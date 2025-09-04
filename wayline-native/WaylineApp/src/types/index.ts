export interface Stop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  feed_onestop_id?: string;
  is_open?: boolean;
  services?: number;
  capacity?: number;
  total_capacity?: number;
  available_vehicles?: number;
  bikes?: any;
  distance?: number;
  routes?: Route[];
  route_type?: number;
  wheelchair_boarding?: number;
  accessibility?: string[];
}

export interface Route {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_color: string;
  route_type: number;
  feed_onestop_id: string;
}

export interface BikeStation {
  id: number;
  name: string;
  lat: number;
  lng: number;
  available: number;
  capacity: number;
  services?: number;
  is_open: boolean;
  total_capacity: number;
  available_vehicles: number;
  stop_name?: string;
}

export interface Departure {
  departure_time: string;
  arrival_time: string;
  minutes_until: number;
  is_tomorrow?: boolean;
  route: {
    route_short_name: string;
    route_long_name: string;
    route_color: string;
    route_type: number;
    feed_onestop_id: string;
  };
}

export interface TransportResponse {
  stops: Stop[];
  coverage?: {
    lat: number;
    lon: number;
    radius: number;
    providers: string[];
  };
}

export interface DepartureResponse {
  stop_name: string;
  current_time: string;
  departures: Departure[];
}