const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://waylineapi.isitzoe.dev';

export const API_ENDPOINTS = {
  stops: `${API_BASE_URL}/api/stops`,
  routes: `${API_BASE_URL}/api/routes`,
  departures: `${API_BASE_URL}/api/departures`,
  departuresRealtime: `${API_BASE_URL}/api/departures-realtime`,
  transport: `${API_BASE_URL}/api/transport`,
  bikes: `${API_BASE_URL}/api/bikes`,
  valenbisi: `${API_BASE_URL}/api/valenbisi`,
};

export async function fetchAPI(endpoint: string, options?: RequestInit) {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`);
  }
  
  return response.json();
}