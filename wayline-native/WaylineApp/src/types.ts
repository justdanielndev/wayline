export interface Stop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  distance?: number;
  routes?: Route[];
  feed_onestop_id?: string;
}

export interface Route {
  route_id: string;
  route_short_name: string;
  route_long_name?: string;
  route_color?: string;
  route_type: number;
  feed_onestop_id?: string;
}

export interface BikeStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  available: number;
  free: number;
  total: number;
  is_open: boolean;
}

export interface TransportResponse {
  stops: Stop[];
}

export interface DepartureResponse {
  stop_name: string;
  current_time: string;
  departures: Departure[];
}

export interface Departure {
  departure_time: string;
  arrival_time: string;
  minutes_until: number | null;
  is_tomorrow?: boolean;
  route: {
    route_short_name: string;
    route_long_name: string;
    route_color: string;
    route_type: number;
    feed_onestop_id: string;
  };
}