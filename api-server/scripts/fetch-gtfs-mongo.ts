import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import fs from 'fs';
import { connectDB } from '../lib/mongodb';
import Feed from '../models/Feed';
import Route from '../models/Route';
import Stop from '../models/Stop';
import RouteStop from '../models/RouteStop';
import { fetchAllValenbisiStations } from './fetch-valenbisi-stations';
import { fetchJCDecauxStationsByContract, transformJCDecauxStation } from './jcdecaux-api';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const TRANSITLAND_API_KEY = process.env.TRANSITLAND_API_KEY || '';
const BASE_URL = 'https://transit.land/api/v2/rest';

interface Provider {
  onestop_id: string;
  spec: string;
  api?: string;
  jcdecaux_contract?: string;
  name?: string;
}

interface FeedInfo {
  id: number;
  onestop_id: string;
  name: string;
  spec: string;
  feed_versions?: Array<{
    id: number;
    sha1: string;
    fetched_at: string;
    url: string;
  }>;
}

async function fetchWithAuth(url: string) {
  const response = await fetch(url, {
    headers: {
      'apikey': TRANSITLAND_API_KEY
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

async function fetchDepartures(feedOnestopId: string, stopId: string) {
  try {
    const days = ['TODAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const allDepartures: any[] = [];
    
    for (const day of days) {
      const url = `${BASE_URL}/stops/${feedOnestopId}:${stopId}/departures?relative_date=${day}&limit=50`;
      const data = await fetchWithAuth(url);
      
      if (data.stops?.[0]?.departures) {
        allDepartures.push(...data.stops[0].departures.map((dep: any) => ({
          ...dep,
          service_date: day
        })));
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return allDepartures;
  } catch (error) {
    console.error(`Error fetching departures for ${feedOnestopId}:${stopId}:`, error);
    return [];
  }
}

async function fetchFeedInfo(onestopId: string): Promise<FeedInfo | null> {
  try {
    const url = `${BASE_URL}/feeds/${onestopId}`;
    const data = await fetchWithAuth(url);
    return data;
  } catch (error) {
    console.error(`Error fetching feed info for ${onestopId}:`, error);
    return null;
  }
}

async function fetchRoutes(onestopId: string) {
  try {
    let allRoutes: any[] = [];
    let after: number | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      let url = `${BASE_URL}/routes?feed_onestop_id=${onestopId}&limit=100&include_geometry=true&include_stops=true`;
      
      if (after) {
        url += `&after=${after}`;
      }
      
      const data = await fetchWithAuth(url);
      const routes = data.routes || [];
      
      if (routes.length === 0) {
        hasMore = false;
      } else {
        allRoutes = allRoutes.concat(routes);
        const lastRoute = routes[routes.length - 1];
        after = lastRoute.id;
        if (routes.length < 100) {
          hasMore = false;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return allRoutes;
  } catch (error) {
    console.error(`Error fetching routes for ${onestopId}:`, error);
    return [];
  }
}

async function fetchStops(onestopId: string) {
  try {
    let allStops: any[] = [];
    let after: number | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      let url = `${BASE_URL}/stops?feed_onestop_id=${onestopId}&limit=100`;
      
      if (after) {
        url += `&after=${after}`;
      }
      
      const data = await fetchWithAuth(url);
      const stops = data.stops || [];
      
      if (stops.length === 0) {
        hasMore = false;
      } else {
        allStops = allStops.concat(stops);
        const lastStop = stops[stops.length - 1];
        after = lastStop.id;
        if (stops.length < 100) {
          hasMore = false;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return allStops;
  } catch (error) {
    console.error(`Error fetching stops for ${onestopId}:`, error);
    return [];
  }
}


export async function updateAllProviders() {
  const db = await connectDB();
  
  const providersPath = path.join(process.cwd(), 'public', 'available_providers.json');
  const providersData = JSON.parse(fs.readFileSync(providersPath, 'utf8'));
  
  const updateId = uuidv4().substring(0, 8);
  
  const tempCollections = {
    feeds: `feeds-${updateId}`,
    routes: `routes-${updateId}`,
    stops: `stops-${updateId}`,
    routestops: `routestops-${updateId}`
  };
  
  const TempFeed = mongoose.model(`Feed_${updateId}`, Feed.schema, tempCollections.feeds);
  const TempRoute = mongoose.model(`Route_${updateId}`, Route.schema, tempCollections.routes);
  const TempStop = mongoose.model(`Stop_${updateId}`, Stop.schema, tempCollections.stops);
  const TempRouteStop = mongoose.model(`RouteStop_${updateId}`, RouteStop.schema, tempCollections.routestops);
  
  for (const provider of providersData.providers as Provider[]) {
    if (provider.api === 'valenbisi') {
      
      try {
        const valenbisiStations = await fetchAllValenbisiStations();
        
        const feedDoc = {
          onestop_id: 'f-valenbisi',
          name: 'Valenbisi',
          spec: 'custom',
          last_updated: new Date(),
          feed_version_sha1: null
        };
        
        const feed = await TempFeed.create(feedDoc);
        const feedId = feed._id;
        
        const stopDocuments = valenbisiStations.map(station => ({
          feed_id: feedId,
          stop_id: station.stop_id,
          stop_name: station.stop_name,
          stop_code: station.stop_code,
          location: {
            type: 'Point',
            coordinates: [station.stop_lon, station.stop_lat]
          },
          location_type: station.location_type,
          wheelchair_boarding: station.wheelchair_boarding,
          is_bike_station: true,
          bike_capacity: station.bike_capacity,
          provider_type: 'bike',
          provider_id: 'valenbisi'
        }));
        
        if (stopDocuments.length > 0) {
          await TempStop.insertMany(stopDocuments);
        }
      } catch (error) {
        console.error('Error processing Valenbisi:', error);
      }
      
      continue;
    }
    
    if (provider.api === 'jcdecaux' && provider.jcdecaux_contract) {
      try {
        const stations = await fetchJCDecauxStationsByContract(provider.jcdecaux_contract);
        
        const feedDoc = {
          onestop_id: provider.onestop_id || `f-jcdecaux-${provider.jcdecaux_contract}`,
          name: provider.name || `JCDecaux ${provider.jcdecaux_contract}`,
          spec: 'custom',
          last_updated: new Date(),
          feed_version_sha1: null
        };
        
        const feed = await TempFeed.create(feedDoc);
        const feedId = feed._id;
        
        const stopDocuments = stations.map(station => {
          const transformed = transformJCDecauxStation(station);
          return {
            feed_id: feedId,
            ...transformed,
            location: {
              type: 'Point',
              coordinates: [transformed.stop_lon, transformed.stop_lat]
            }
          };
        });
        
        if (stopDocuments.length > 0) {
          await TempStop.insertMany(stopDocuments);
        }
      } catch (error) {
        console.error(`Error processing JCDecaux ${provider.jcdecaux_contract}:`, error);
      }
      
      continue;
    }
    
    if (!provider.onestop_id) {
      continue;
    }
    
    const feedInfo = await fetchFeedInfo(provider.onestop_id);
    if (!feedInfo) continue;
    
    const feedData = {
      name: feedInfo.name || provider.onestop_id,
      routes: await fetchRoutes(provider.onestop_id),
      stops: await fetchStops(provider.onestop_id),
      routeStops: null,
      departures: null
    };

    const feedDoc = {
      onestop_id: provider.onestop_id,
      name: feedData.name,
      spec: provider.spec,
      last_updated: new Date(),
      feed_version_sha1: null
    };
    
    const feed = await TempFeed.create(feedDoc);
    const feedId = feed._id;

    // @ts-ignore
    const stopDocuments = [];
    const stopMap = new Map<string, any>();
    
    for (const stop of feedData.stops) {
      const lat = stop.geometry?.coordinates?.[1] || 0;
      const lon = stop.geometry?.coordinates?.[0] || 0;
      
      if (!lat || !lon || lat === 0 || lon === 0) {
        continue;
      }
      
      const stopDoc = {
        feed_id: feedId,
        stop_id: stop.stop_id,
        stop_name: stop.stop_name || '',
        stop_lat: lat,
        stop_lon: lon,
        location_type: stop.location_type || 0,
        parent_station: stop.parent?.stop_id || null,
        location: {
          type: 'Point',
          coordinates: [lon, lat]
        }
      };
      
      stopDocuments.push(stopDoc);
    }
    
    if (stopDocuments.length > 0) {
      const insertedStops = await TempStop.insertMany(stopDocuments);
      insertedStops.forEach((stop, index) => {
        // @ts-ignore
        stopMap.set(stopDocuments[index].stop_id, stop._id);
      });
    }
    
    // @ts-ignore
    const routeDocuments = [];
    const routeMap = new Map<string, any>();
    
    for (const route of feedData.routes) {
      const routeDoc = {
        feed_id: feedId,
        route_id: route.route_id,
        route_short_name: route.route_short_name || '',
        route_long_name: route.route_long_name || '',
        route_type: route.route_type || 0,
        route_color: route.route_color || '#6b46c1',
        agency_id: route.agency?.agency_id || '',
        agency_name: route.agency?.agency_name || '',
        geometry: route.geometry || null
      };
      
      routeDocuments.push(routeDoc);
    }
    
    if (routeDocuments.length > 0) {
      const insertedRoutes = await TempRoute.insertMany(routeDocuments);
      insertedRoutes.forEach((route, index) => {
        // @ts-ignore
        routeMap.set(routeDocuments[index].route_id, route._id);
      });
    }
    const routeStopDocuments = [];
    let routesWithStops = 0;
    
    for (const route of feedData.routes) {
      const routeId = routeMap.get(route.route_id);
      if (!routeId) continue;
      
      let stopsForThisRoute = 0;
      if (route.route_stops && route.route_stops.length > 0) {
        for (const routeStop of route.route_stops) {
          if (routeStop.stop && stopMap.has(routeStop.stop.stop_id)) {
            routeStopDocuments.push({
              route_id: routeId,
              stop_id: stopMap.get(routeStop.stop.stop_id),
              feed_id: feedId
            });
            stopsForThisRoute++;
          }
        }
      }
      
      if (stopsForThisRoute > 0) {
        routesWithStops++;
      }
    }
    
    if (routeStopDocuments.length > 0) {
      await TempRouteStop.insertMany(routeStopDocuments);
    } else {
      console.log(`Warning: No route-stop associations found for ${provider.onestop_id}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  
  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }
    
    const collections = ['feeds', 'routes', 'stops', 'routestops'];
    for (const collectionName of collections) {
      const currentName = collectionName;
      const tempName = `${collectionName}-${updateId}`;
      const backupName = `${collectionName}-bak`;
      
      console.log(`Swapping ${collectionName}...`);
      
      try {
        await db.dropCollection(backupName).catch(() => {});
        const currentExists = await db.listCollections({ name: currentName }).hasNext();
        if (currentExists) {
          await db.renameCollection(currentName, backupName);
        }
        await db.renameCollection(tempName, currentName);
        
        console.log(`${collectionName} swapped successfully`);
      } catch (error) {
        console.error(`Error swapping ${collectionName}:`, error);
        try {
          await db.renameCollection(backupName, currentName).catch(() => {});
        } catch (rollbackError) {
          console.error(`Rollback failed for ${collectionName}:`, rollbackError);
        }
      }
    }
    
    console.log('Collection swap completed!');
    setTimeout(async () => {
      for (const collectionName of collections) {
        try {
          await db.dropCollection(`${collectionName}-bak`);
        } catch (error) {
        }
      }
    }, 5000);
    
  } catch (error) {
    console.error('Error during collection swap:', error);
  }
  
  console.log('GTFS data update completed!');
  process.exit(0);
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export async function getLocalTransportData(lat: number, lon: number, radius = 500) {
  await connectDB();
  
  const stops = await Stop.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lon, lat]
        },
        $maxDistance: radius
      }
    }
  })
  .populate('feed_id')
  .limit(10);
  
  const stopsWithRoutes = await Promise.all(stops.map(async (stop) => {
    const feed = stop.feed_id as any;
    
    if (stop.is_bike_station) {
      return {
        ...stop.toObject(),
        feed_onestop_id: feed.onestop_id,
        feed_name: feed.name,
        distance: calculateDistance(lat, lon, stop.stop_lat, stop.stop_lon),
        routes: [],
        type: 'bike',
        provider_type: stop.provider_type,
        provider_id: stop.provider_id
      };
    }
    
    const routeStops = await RouteStop.find({ stop_id: stop._id })
      .populate({
        path: 'route_id',
        populate: { path: 'feed_id' }
      });
    
    const routes = routeStops.map(rs => {
      const route = rs.route_id as any;
      const feed = route.feed_id as any;
      return {
        route_short_name: route.route_short_name,
        route_long_name: route.route_long_name,
        route_color: route.route_color,
        route_type: route.route_type,
        feed_onestop_id: feed.onestop_id
      };
    });
    
    const uniqueRoutes = Array.from(
      new Map(routes.map(r => [`${r.route_short_name}-${r.feed_onestop_id}`, r])).values()
    );
    
    return {
      ...stop.toObject(),
      feed_onestop_id: feed.onestop_id,
      feed_name: feed.name,
      distance: calculateDistance(lat, lon, stop.stop_lat, stop.stop_lon),
      routes: uniqueRoutes
    };
  }));
  
  stopsWithRoutes.sort((a, b) => a.distance - b.distance);
  
  return { routes: [], stops: stopsWithRoutes };
}

if (require.main === module) {
  updateAllProviders().catch(console.error);
}