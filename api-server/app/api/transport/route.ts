import { NextRequest } from 'next/server';
import { getLocalTransportData } from '../../../scripts/fetch-gtfs-mongo';
import fs from 'fs';
import path from 'path';

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
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lon = parseFloat(searchParams.get('lon') || '0');
    const radius = parseInt(searchParams.get('radius') || '50');

    if (!lat || !lon) {
      return Response.json(
        { error: 'Latitude and longitude are required' },
        { status: 400 }
      );
    }

    const providers = await getProviderConfig();
    const providerConfig = providers.reduce((acc: any, provider: any) => {
      acc[provider.onestop_id] = provider;
      return acc;
    }, {});

    const transportData = await getLocalTransportData(lat, lon, radius);
    
    const filteredRoutes = transportData.routes.filter((route: any) => {
      const feedConfig = providerConfig[route.feed_onestop_id];
      return feedConfig && feedConfig.showlines === true;
    });
    
    return Response.json({
      routes: filteredRoutes,
      stops: transportData.stops
    });
  } catch (error) {
    console.error('Error fetching transport data:', error);
    return Response.json(
      { error: 'Failed to fetch transport data' },
      { status: 500 }
    );
  }
}