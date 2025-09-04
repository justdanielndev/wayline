import fetch from 'node-fetch';

const VALENBISI_API_URL = 'https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets/valenbisi-disponibilitat-valenbisi-dsiponibilidad/records';

interface ValenbisiStation {
  geo_point_2d: {
    lon: number;
    lat: number;
  };
  address: string;
  number: number;
  total: number;
}

export async function fetchAllValenbisiStations() {
  console.log('Fetching all Valenbisi stations...');
  
  const allStations: any[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;
  
  while (hasMore) {
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
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
      // @ts-expect-error - error expected
      const stations = data.results || [];
      
      const transformedStations = stations.map((station: ValenbisiStation) => ({
        stop_id: `BIKE_${station.number}`,
        stop_name: station.address,
        stop_lat: station.geo_point_2d.lat,
        stop_lon: station.geo_point_2d.lon,
        stop_code: station.number.toString(),
        location_type: 0,
        wheelchair_boarding: 1,
        is_bike_station: true,
        bike_capacity: station.total,
        provider_type: 'bike',
        provider_id: 'valenbisi'
      }));
      
      allStations.push(...transformedStations);
      
      if (stations.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
      
      console.log(`Fetched ${allStations.length} Valenbisi stations so far...`);
    } catch (error) {
      console.error('Error fetching Valenbisi stations:', error);
      hasMore = false;
    }
  }
  
  console.log(`Total Valenbisi stations fetched: ${allStations.length}`);
  return allStations;
}