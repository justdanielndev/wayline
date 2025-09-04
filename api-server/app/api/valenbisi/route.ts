import { NextRequest } from 'next/server';

const VALENBISI_API_URL = 'https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/valenbisi-disponibilitat-valenbisi-dsiponibilidad/records';

interface ValenbisiStation {
  geo_point_2d: {
    lon: number;
    lat: number;
  };
  address: string;
  number: number;
  open: string;
  ticket: string;
  total: number;
  free: number;
  available: number;
  geo_shape?: {
    geometry: {
      type: string;
      coordinates: [number, number];
    };
    properties: object;
  };
}

interface ValenbisiResponse {
  total_count: number;
  results: ValenbisiStation[];
}

const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 2 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const radius = searchParams.get('radius') || '500';

    if (!lat || !lon) {
      return Response.json(
        { error: 'lat and lon parameters are required' },
        { status: 400 }
      );
    }

    const cacheKey = `${lat},${lon},${radius}`;
    const cached = cache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      return Response.json({
        ...cached.data,
        cached: true,
        cache_expires: new Date(cached.expires).toISOString()
      });
    }

    const params = new URLSearchParams({
      where: `distance(geo_point_2d,geom'POINT(${lon} ${lat})',${radius}m)`,
      limit: '20',
      offset: '0',
      timezone: 'Europe/Madrid'
    });

    const response = await fetch(`${VALENBISI_API_URL}?${params}`, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Valenbisi API error: ${response.status} ${response.statusText}`);
    }

    const data: ValenbisiResponse = await response.json();
    
    const stations = data.results.map(station => ({
      station_id: station.number.toString(),
      station_name: station.address,
      station_address: station.address,
      coordinates: [station.geo_point_2d.lon, station.geo_point_2d.lat],
      bikes_available: station.available,
      docks_free: station.free,
      total_capacity: station.total,
      is_open: station.open === 'T',
      has_ticket_machine: station.ticket === 'T',
      distance: calculateDistance(
        parseFloat(lat),
        parseFloat(lon),
        station.geo_point_2d.lat,
        station.geo_point_2d.lon
      )
    })).sort((a, b) => a.distance - b.distance);

    const result = {
      type: 'FeatureCollection',
      features: stations.map(station => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: station.coordinates
        },
        properties: {
          ...station,
          type: 'bike_share'
        }
      })),
      timestamp: new Date().toISOString()
    };

    cache.set(cacheKey, {
      data: result,
      expires: Date.now() + CACHE_TTL
    });

    return Response.json({
      ...result,
      cached: false
    });

  } catch (error) {
    console.error('Error fetching Valenbisi data:', error);
    return Response.json(
      { error: 'Failed to fetch Valenbisi stations' },
      { status: 500 }
    );
  }
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

  return Math.round(R * c);
}