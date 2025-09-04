import { NextRequest } from 'next/server';
import { connectDB } from '../../../lib/mongodb';
import Stop from '../../../models/Stop';
import RouteStop from '../../../models/RouteStop';
import fs from 'fs';
import path from 'path';

function normalizeStopName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

async function getProviderConfig() {
  try {
    const providersPath = path.join(process.cwd(), 'public', 'available_providers.json');
    const providersData = JSON.parse(fs.readFileSync(providersPath, 'utf8'));
    return providersData.providers;
  } catch (error) {
    console.error('Error reading providers config:', error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lon = parseFloat(searchParams.get('lon') || '0');
    const radius = parseInt(searchParams.get('radius') || '1000');

    if (!lat || !lon) {
      return Response.json(
        { error: 'Latitude and longitude are required' },
        { status: 400 }
      );
    }

    const providers = await getProviderConfig();
    const mergeableGroups: string[][] = [];
    const providerToGroupIndex = new Map<string, number>();
    
    providers.forEach((p: any) => {
      if (p.mergeable && typeof p.mergeable === 'object') {
        let groupIndex = providerToGroupIndex.get(p.onestop_id);
        if (groupIndex === undefined) {
          groupIndex = mergeableGroups.length;
          mergeableGroups.push([p.onestop_id]);
          providerToGroupIndex.set(p.onestop_id, groupIndex);
        }
        
        Object.entries(p.mergeable).forEach(([partnerId, canMerge]) => {
          if (canMerge === true && !mergeableGroups[groupIndex!].includes(partnerId)) {
            mergeableGroups[groupIndex!].push(partnerId);
            providerToGroupIndex.set(partnerId, groupIndex!);
          }
        });
      }
    });

    function canProvidersMerge(provider1: string, provider2: string): boolean {
      const group1 = providerToGroupIndex.get(provider1);
      const group2 = providerToGroupIndex.get(provider2);
      return group1 !== undefined && group2 !== undefined && group1 === group2;
    }

    const stops = await Stop.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lon, lat]
          },
          $maxDistance: radius
        }
      },
      $or: [
        { location_type: 1 },
        { parent_station: null },
        { parent_station: '' }
      ]
    })
    .populate('feed_id')
    .limit(30);

    const processedStops = await Promise.all(stops.map(async (stop) => {
      const feed = stop.feed_id as any;
      
      if (stop.is_bike_station) {
        const R = 6371e3;
        const φ1 = lat * Math.PI / 180;
        const φ2 = stop.stop_lat * Math.PI / 180;
        const Δφ = (stop.stop_lat - lat) * Math.PI / 180;
        const Δλ = (stop.stop_lon - lon) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [stop.stop_lon, stop.stop_lat]
          },
          properties: {
            stop_id: stop.stop_id,
            stop_name: stop.stop_name,
            feed_onestop_id: feed.onestop_id,
            feed_name: feed.name,
            routes: [],
            distance: Math.round(distance),
            is_bike_station: true,
            bike_capacity: stop.bike_capacity,
            provider_type: stop.provider_type,
            provider_id: stop.provider_id,
            type: 'bike'
          }
        };
      }
      
      const routeStops = await RouteStop.find({ stop_id: stop._id })
        .populate({
          path: 'route_id',
          populate: { path: 'feed_id' }
        });

      const routesMap = new Map<string, any>();
      routeStops.forEach(rs => {
        const route = rs.route_id as any;
        const routeFeed = route.feed_id as any;
        const key = `${route.route_short_name}-${routeFeed.onestop_id}`;
        
        if (!routesMap.has(key)) {
          routesMap.set(key, {
            route_short_name: route.route_short_name || 'R',
            route_color: route.route_color || '#6b46c1',
            route_type: route.route_type || 3,
            feed_onestop_id: routeFeed.onestop_id
          });
        }
      });

      const routes = Array.from(routesMap.values());
      
      const R = 6371e3;
      const φ1 = lat * Math.PI / 180;
      const φ2 = stop.stop_lat * Math.PI / 180;
      const Δφ = (stop.stop_lat - lat) * Math.PI / 180;
      const Δλ = (stop.stop_lon - lon) * Math.PI / 180;
      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [stop.stop_lon, stop.stop_lat]
        },
        properties: {
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          feed_onestop_id: feed.onestop_id,
          feed_name: feed.name,
          routes: routes,
          distance: Math.round(distance)
        }
      };
    }));

    const groupedStops: any[] = [];
    const stopsByNormalizedName = new Map<string, any[]>();
    const processedIndices = new Set<number>();

    processedStops.forEach((stop, index) => {
      const normalizedName = normalizeStopName(stop.properties.stop_name);
      if (!stopsByNormalizedName.has(normalizedName)) {
        stopsByNormalizedName.set(normalizedName, []);
      }
      stopsByNormalizedName.get(normalizedName)!.push({ stop, index });
    });

    stopsByNormalizedName.forEach((stopsGroup) => {
      if (stopsGroup.length > 1) {
        const mergeableSubgroups: any[][] = [];
        
        stopsGroup.forEach(({ stop, index }: any) => {
          let assigned = false;
          
          for (let j = 0; j < mergeableSubgroups.length; j++) {
            const subgroup = mergeableSubgroups[j];
            const canMerge = subgroup.some(({ stop: otherStop }: any) => 
              canProvidersMerge(stop.properties.feed_onestop_id, otherStop.properties.feed_onestop_id)
            );
            
            if (canMerge) {
              subgroup.push({ stop, index });
              assigned = true;
              break;
            }
          }
          
          if (!assigned) {
            mergeableSubgroups.push([{ stop, index }]);
          }
        });
        
        mergeableSubgroups.forEach((subgroup) => {
          if (subgroup.length > 1) {
            const allRoutes: any[] = [];
            const seenRoutes = new Set<string>();
            const providers = new Set<string>();
            
            subgroup.forEach(({ stop }: any) => {
              providers.add(stop.properties.feed_onestop_id);
              stop.properties.routes.forEach((r: any) => {
                const key = `${r.route_short_name}-${r.feed_onestop_id}`;
                if (!seenRoutes.has(key)) {
                  seenRoutes.add(key);
                  allRoutes.push(r);
                }
              });
            });
            
            const firstStop = subgroup[0].stop;
            groupedStops.push({
              ...firstStop,
              properties: {
                ...firstStop.properties,
                routes: allRoutes,
                totalRoutes: allRoutes.length,
                combined: true,
                providers: Array.from(providers)
              }
            });
            
            subgroup.forEach(({ index }: any) => processedIndices.add(index));
          } else {
            const { stop, index } = subgroup[0];
            groupedStops.push({
              ...stop,
              properties: {
                ...stop.properties,
                routes: stop.properties.routes,
                totalRoutes: stop.properties.routes.length
              }
            });
            processedIndices.add(index);
          }
        });
      }
    });
    
    processedStops.forEach((stop, index) => {
      if (!processedIndices.has(index)) {
        groupedStops.push({
          ...stop,
          properties: {
            ...stop.properties,
            routes: stop.properties.routes,
            totalRoutes: stop.properties.routes.length
          }
        });
      }
    });

    return Response.json({
      type: 'FeatureCollection',
      features: groupedStops
    });
  } catch (error) {
    console.error('Error fetching stops:', error);
    return Response.json(
      { error: 'Failed to fetch stops' },
      { status: 500 }
    );
  }
}