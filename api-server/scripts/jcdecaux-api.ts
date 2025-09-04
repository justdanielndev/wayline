import fetch from 'node-fetch';

const JCDECAUX_API_BASE = 'https://api.jcdecaux.com/vls/v1';
const JCDECAUX_API_KEY = process.env.JCDECAUX_API_KEY || '';

interface JCDecauxContract {
  name: string;
  commercial_name: string;
  country_code: string;
  cities: string[];
}

interface JCDecauxStation {
  number: number;
  contractName?: string;
  contract_name?: string;
  name: string;
  address: string;
  position: {
    latitude?: number;
    longitude?: number;
    lat?: number;
    lng?: number;
  };
  banking: boolean;
  bonus: boolean;
  status: 'OPEN' | 'CLOSED';
  lastUpdate?: string;
  last_update?: number;
  connected?: boolean;
  overflow?: boolean;
  shape?: any;
  totalStands?: {
    availabilities: {
      bikes: number;
      stands: number;
      mechanicalBikes: number;
      electricalBikes: number;
      electricalInternalBatteryBikes: number;
      electricalRemovableBatteryBikes: number;
    };
    capacity: number;
  };
  mainStands?: {
    availabilities: {
      bikes: number;
      stands: number;
      mechanicalBikes: number;
      electricalBikes: number;
      electricalInternalBatteryBikes: number;
      electricalRemovableBatteryBikes: number;
    };
    capacity: number;
  };
  overflowStands?: any;
  bike_stands?: number;
  available_bike_stands?: number;
  available_bikes?: number;
}

export async function fetchJCDecauxContracts(): Promise<JCDecauxContract[]> {
  const url = `${JCDECAUX_API_BASE}/contracts?apiKey=${JCDECAUX_API_KEY}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`JCDecaux API error: ${response.status} ${response.statusText}`);
    }
    
    // @ts-expect-error - error expected
    return await response.json();
  } catch (error) {
    console.error('Error fetching JCDecaux contracts:', error);
    throw error;
  }
}

export async function fetchJCDecauxStationsByContract(contractName: string): Promise<JCDecauxStation[]> {
  const url = `${JCDECAUX_API_BASE}/stations?contract=${contractName}&apiKey=${JCDECAUX_API_KEY}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`JCDecaux API error: ${response.status} ${response.statusText}`);
    }
    
    // @ts-expect-error - error expected
    return await response.json();
  } catch (error) {
    console.error(`Error fetching JCDecaux stations for ${contractName}:`, error);
    throw error;
  }
}

export async function fetchAllJCDecauxStations(): Promise<JCDecauxStation[]> {
  const url = `${JCDECAUX_API_BASE}/stations?apiKey=${JCDECAUX_API_KEY}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`JCDecaux API error: ${response.status} ${response.statusText}`);
    }
    
    // @ts-expect-error - error expected
    return await response.json();
  } catch (error) {
    console.error('Error fetching all JCDecaux stations:', error);
    throw error;
  }
}

export async function fetchJCDecauxStation(stationNumber: number, contractName: string): Promise<JCDecauxStation> {
  const url = `${JCDECAUX_API_BASE}/stations/${stationNumber}?contract=${contractName}&apiKey=${JCDECAUX_API_KEY}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Station ${stationNumber} not found in contract ${contractName}`);
      }
      throw new Error(`JCDecaux API error: ${response.status} ${response.statusText}`);
    }
    
    // @ts-expect-error - error expected
    return await response.json();
  } catch (error) {
    console.error(`Error fetching JCDecaux station ${stationNumber} for ${contractName}:`, error);
    throw error;
  }
}

export function transformJCDecauxStation(station: JCDecauxStation) {
  const contractName = station.contractName || station.contract_name || '';
  const lat = station.position.latitude || station.position.lat || 0;
  const lon = station.position.longitude || station.position.lng || 0;
  const capacity = station.totalStands?.capacity || station.bike_stands || 0;
  
  return {
    stop_id: `BIKE_${contractName}_${station.number}`,
    stop_name: station.name,
    stop_lat: lat,
    stop_lon: lon,
    stop_code: station.number.toString(),
    location_type: 0,
    wheelchair_boarding: 1,
    is_bike_station: true,
    bike_capacity: capacity,
    provider_type: 'bike',
    provider_id: `jcdecaux_${contractName}`,
    jcdecaux_contract: contractName,
    jcdecaux_number: station.number
  };
}