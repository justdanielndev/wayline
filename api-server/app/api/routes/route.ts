import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '../../../scripts/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lon') || '0');
    const radius = parseInt(searchParams.get('radius') || '5000');
    
    const db = initDatabase();
    
    const routes = db.prepare(`
      SELECT 
        r.route_short_name,
        r.route_long_name, 
        r.route_color,
        r.route_type,
        r.geometry,
        f.onestop_id as feed_onestop_id,
        f.name as feed_name
      FROM routes r
      JOIN feeds f ON r.feed_id = f.id
      WHERE r.geometry IS NOT NULL
    `).all();
    db.close();
    const fs = require('fs');
    const path = require('path');
    const providersPath = path.join(process.cwd(), 'public', 'available_providers.json');
    const providersData = JSON.parse(fs.readFileSync(providersPath, 'utf8'));
    const showlinesProviders = new Set(
      providersData.providers
        .filter((p: any) => p.showlines === true)
        .map((p: any) => p.onestop_id)
    );
    
    const features = routes
      .filter((route: any) => showlinesProviders.has(route.feed_onestop_id))
      .map((route: any) => {
        let geometry;
        try {
          geometry = JSON.parse(route.geometry);
        } catch (e) {
          return null;
        }
        
        return {
          type: 'Feature',
          properties: {
            route_short_name: route.route_short_name,
            route_long_name: route.route_long_name,
            route_color: route.route_color,
            route_type: route.route_type,
            feed_onestop_id: route.feed_onestop_id,
            feed_name: route.feed_name
          },
          geometry: geometry
        };
      })
      .filter(Boolean);
    
    const geoJSON = {
      type: 'FeatureCollection',
      features: features
    };
    
    return NextResponse.json(geoJSON);
    
  } catch (error) {
    console.error('Error fetching routes:', error);
    return NextResponse.json({ error: 'Failed to fetch routes' }, { status: 500 });
  }
}