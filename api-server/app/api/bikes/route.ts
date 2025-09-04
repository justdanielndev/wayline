import { NextRequest } from 'next/server';
import { connectDB } from '../../../lib/mongodb';
import Stop from '../../../models/Stop';
import { fetchJCDecauxStation } from '../../../scripts/jcdecaux-api';

const VALENBISI_API_URL = 'https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/valenbisi-disponibilitat-valenbisi-dsiponibilidad/records';

interface BikeAvailability {
  stop_id: string;
  stop_name: string;
  coordinates: [number, number];
  available_bikes: number;
  available_stands: number;
  total_capacity: number;
  status: string;
  last_update?: string;
  mechanical_bikes?: number;
  electrical_bikes?: number;
  provider: string;
}

async function fetchValenbisiAvailability(lat: number, lon: number, radius: number): Promise<BikeAvailability[]> {
  try {
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

    const data = await response.json();
    const stations = data.results || [];

    return stations.map((station: any) => ({
      stop_id: `BIKE_${station.number}`,
      stop_name: station.address,
      coordinates: [station.geo_point_2d.lon, station.geo_point_2d.lat],
      available_bikes: station.available,
      available_stands: station.free,
      total_capacity: station.total,
      status: station.open === 1 ? 'OPEN' : 'CLOSED',
      last_update: station.lastupdate,
      provider: 'valenbisi'
    }));
  } catch (error) {
    console.error('Error fetching Valenbisi availability:', error);
    return [];
  }
}

async function fetchJCDecauxAvailability(stations: any[]): Promise<BikeAvailability[]> {
  const availabilities: BikeAvailability[] = [];

  for (const station of stations) {
    if (station.jcdecaux_contract && station.jcdecaux_number) {
      try {
        const realtimeData = await fetchJCDecauxStation(
          station.jcdecaux_number,
          station.jcdecaux_contract
        );

        const availableBikes = realtimeData.totalStands?.availabilities?.bikes ??
          realtimeData.available_bikes ?? 0;
        const availableStands = realtimeData.totalStands?.availabilities?.stands ??
          realtimeData.available_bike_stands ?? 0;
        const totalCapacity = realtimeData.totalStands?.capacity ??
          realtimeData.bike_stands ?? 0;
        const lastUpdate = realtimeData.lastUpdate ||
          (realtimeData.last_update ? new Date(realtimeData.last_update).toISOString() : undefined);

        availabilities.push({
          stop_id: station.stop_id,
          stop_name: station.stop_name,
          coordinates: [station.stop_lon, station.stop_lat],
          available_bikes: availableBikes,
          available_stands: availableStands,
          total_capacity: totalCapacity,
          status: realtimeData.status,
          last_update: lastUpdate,
          mechanical_bikes: realtimeData.totalStands?.availabilities?.mechanicalBikes,
          electrical_bikes: realtimeData.totalStands?.availabilities?.electricalBikes,
          provider: `jcdecaux_${station.jcdecaux_contract}`
        });
      } catch (error) {
        console.error(`Error fetching JCDecaux station ${station.stop_id}:`, error);
      }
    }
  }

  return availabilities;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lon = parseFloat(searchParams.get('lon') || '0');
    const radius = parseInt(searchParams.get('radius') || '1000');
    const provider = searchParams.get('provider');

    if (!lat || !lon) {
      return Response.json(
        { error: 'Latitude and longitude are required' },
        { status: 400 }
      );
    }

    const results: BikeAvailability[] = [];

    await connectDB();
    const bikeStations = await Stop.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lon, lat]
          },
          $maxDistance: radius
        }
      },
      is_bike_station: true
    }).limit(20);

    const valenbisiStations = bikeStations.filter(s => s.provider_id === 'valenbisi');
    const jcdecauxStations = bikeStations.filter(s => s.provider_id?.startsWith('jcdecaux_'));

    if ((!provider || provider === 'valenbisi') && valenbisiStations.length > 0) {
      const valenbisiData = await fetchValenbisiAvailability(lat, lon, radius);
      results.push(...valenbisiData);
    }

    if ((!provider || provider?.startsWith('jcdecaux')) && jcdecauxStations.length > 0) {
      const jcdecauxData = await fetchJCDecauxAvailability(jcdecauxStations);
      results.push(...jcdecauxData);
    }

    return Response.json({
      type: 'FeatureCollection',
      features: results.map(station => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: station.coordinates
        },
        properties: station
      }))
    });
  } catch (error) {
    console.error('Error fetching bike availability:', error);
    return Response.json(
      { error: 'Failed to fetch bike availability' },
      { status: 500 }
    );
  }
}