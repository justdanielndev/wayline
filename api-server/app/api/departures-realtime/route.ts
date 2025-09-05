import { NextRequest } from 'next/server';
import { connectDB } from '../../../lib/mongodb';
import Stop from '../../../models/Stop';
import Feed from '../../../models/Feed';
import path from 'path';
import fs from 'fs';

const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 60 * 60 * 1000;
const TRANSITLAND_CACHE_TTL = 2 * 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (value.expires < now) {
      cache.delete(key);
    }
  }
}, 10 * 60 * 1000);

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const stopId = searchParams.get('stop_id');
    const feedOnestopId = searchParams.get('feed_onestop_id');

    if (!stopId || !feedOnestopId) {
      return Response.json(
        { error: 'stop_id and feed_onestop_id are required' },
        { status: 400 }
      );
    }

    const cacheKey = `${feedOnestopId}:${stopId}`;
    let cachedPastDepartures: any[] = [];
    
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      const now = Date.now();
      const serverTime = cached.data.server_time || now;
      const timeDiff = now - serverTime;
      
      let upcomingCount = 0;
      const allCachedDepartures = [
        ...(cached.data.departures?.past || []),
        ...(cached.data.departures?.upcoming || []),
        ...(cached.data.departures?.later || [])
      ];
      
      for (const dep of allCachedDepartures) {
        const adjustedMinutes = (dep.minutes_from_now || 0) - (timeDiff / 60000);
        if (adjustedMinutes >= 0) {
          upcomingCount++;
        }
      }
      
      if (upcomingCount < 5) {
        
        cachedPastDepartures = allCachedDepartures
          .map(dep => ({
            ...dep,
            minutes_from_now: (dep.minutes_from_now || 0) - (timeDiff / 60000)
          }))
          .filter(dep => dep.minutes_from_now < 0)
          .sort((a, b) => b.minutes_from_now - a.minutes_from_now)
          .slice(0, 5);
        
        cache.delete(cacheKey);
      } else {
        return Response.json({
          ...cached.data,
          cached: true,
          cache_expires: new Date(cached.expires).toISOString()
        });
      }
    }

    const feed = await Feed.findOne({ onestop_id: feedOnestopId });
    if (!feed) {
      return Response.json({ error: 'Feed not found' }, { status: 404 });
    }

    const stop = await Stop.findOne({ 
      stop_id: stopId,
      feed_id: feed._id 
    });
    
    if (!stop) {
      return Response.json({ error: 'Stop not found' }, { status: 404 });
    }

    const providersPath = path.join(process.cwd(), 'public', 'available_providers.json');
    const providersData = JSON.parse(fs.readFileSync(providersPath, 'utf8'));
    const provider = providersData.providers.find((p: any) => p.onestop_id === feedOnestopId);

    if (!provider) {
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }

    let departures: any[] = [];

    const transformDepartures = (rawDepartures: any[], feedOnestopId: string) => {
      const now = new Date();
      const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
      
      return rawDepartures.map((dep: any) => {
        const [depHours, depMinutes] = (dep.departure_time || '00:00:00').split(':').map(Number);
        let depTimeInMinutes = depHours * 60 + depMinutes;
        if (depHours >= 24) {
          depTimeInMinutes = (depHours - 24) * 60 + depMinutes;
        }
        let minutesFromNow = depTimeInMinutes - currentTimeInMinutes;
        if (minutesFromNow < -720) {
          minutesFromNow += 24 * 60;
        }
        
        return {
          departure_time: dep.departure_time || '',
          arrival_time: dep.arrival_time || '',
          route: {
            route_id: dep.trip?.route?.route_id || '',
            route_short_name: dep.trip?.route?.route_short_name || '',
            route_long_name: dep.trip?.route?.route_long_name || '',
            route_color: dep.trip?.route?.route_color || '#6b46c1',
            route_type: dep.trip?.route?.route_type || 0,
            feed_onestop_id: feedOnestopId
          },
          trip_id: dep.trip?.trip_id || '',
          trip_headsign: dep.trip?.trip_headsign || '',
          stop_sequence: dep.stop_sequence || 0,
          minutes_from_now: Math.floor(minutesFromNow),
          realtime: dep.departure?.estimated || dep.arrival?.estimated ? true : false,
          service_date: dep.service_date || '',
          schedule_relationship: dep.schedule_relationship || 'STATIC'
        };
      }).sort((a: any, b: any) => a.minutes_from_now - b.minutes_from_now);
    };

    {
      const TRANSITLAND_API_KEY = process.env.TRANSITLAND_API_KEY || '';
      
      let limit = 30;
      const response = await fetch(
        `https://transit.land/api/v2/rest/stops/${feedOnestopId}:${stopId}/departures?limit=${limit}`,
        {
          headers: {
            'apikey': TRANSITLAND_API_KEY || ''
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        
        const stopData = data.stops?.[0];
        const rawDepartures = stopData?.departures || [];
        departures = transformDepartures(rawDepartures, feedOnestopId);
        
        const upcomingCount = departures.filter((d: any) => d.minutes_from_now >= 0).length;
        if (upcomingCount < 5) {
          limit = 60;
          
          const refetchResponse = await fetch(
            `https://transit.land/api/v2/rest/stops/${feedOnestopId}:${stopId}/departures?limit=${limit}`,
            {
              headers: {
                'apikey': TRANSITLAND_API_KEY || ''
              }
            }
          );
          
          if (refetchResponse.ok) {
            const refetchData = await refetchResponse.json();
            const refetchStopData = refetchData.stops?.[0];
            const refetchRawDepartures = refetchStopData?.departures || [];            
            departures = transformDepartures(refetchRawDepartures, feedOnestopId);
          } else {
            console.error('TransitLand API refetch error:', refetchResponse.status, refetchResponse.statusText);
          }
        }
      } else {
        console.error('TransitLand API error:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error response:', errorText);
      }
    }
    
    const now = Date.now();
    const categorizedDepartures: {
      past: any[];
      upcoming: any[];
      later: any[];
    } = {
      past: [],
      upcoming: [],
      later: []
    };
    {
      const newPastDepartures = departures.filter((d: any) => {
        const minutesFromNow = d.minutes_from_now ?? d.minutes_until ?? 0;
        return minutesFromNow < 0;
      });
      
      const allPastDepartures = [...cachedPastDepartures, ...newPastDepartures];
      const uniquePastDepartures = allPastDepartures.reduce((acc: any[], dep) => {
        const exists = acc.find(d => 
          d.trip_id === dep.trip_id && 
          d.departure_time === dep.departure_time
        );
        if (!exists) {
          acc.push(dep);
        }
        return acc;
      }, []);
      
      categorizedDepartures.past = uniquePastDepartures
        .sort((a, b) => b.minutes_from_now - a.minutes_from_now)
        .slice(0, 5);
      
      categorizedDepartures.upcoming = departures.filter((d: any) => {
        const minutesFromNow = d.minutes_from_now ?? d.minutes_until ?? 0;
        return minutesFromNow >= 0;
      }).slice(0, 5);
      
      categorizedDepartures.later = departures.filter((d: any) => {
        const minutesFromNow = d.minutes_from_now ?? d.minutes_until ?? 0;
        return minutesFromNow >= 0;
      }).slice(5, 10);
    }
    
    const result = {
      stop_name: stop.stop_name,
      stop_id: stop.stop_id,
      feed_onestop_id: feedOnestopId,
      current_time: new Date().toISOString(),
      server_time: now,
      departures: categorizedDepartures
    };

    const cacheTTL = TRANSITLAND_CACHE_TTL;
    
    cache.set(cacheKey, {
      data: result,
      expires: Date.now() + cacheTTL
    });

    return Response.json({
      ...result,
      cached: false
    });
  } catch (error) {
    console.error('Error fetching real-time departures:', error);
    return Response.json(
      { error: 'Failed to fetch departures' },
      { status: 500 }
    );
  }
}