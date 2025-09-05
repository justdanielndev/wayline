const TRIPGO_API_KEY = process.env.EXPO_PUBLIC_TRIPGO_API_KEY || '537224bf15747921fa77710ba375fc7e';
const TRIPGO_BASE_URL = 'https://api.tripgo.com/v1';

export interface TripGoLocation {
  lat: number;
  lng: number;
  name?: string;
  address?: string;
  class?: string;
}

export interface TripGoSegment {
  startTime: number;
  endTime: number;
  from: TripGoLocation;
  to: TripGoLocation;
  mode: string;
  modeInfo?: {
    alt: string;
    color?: { red: number; green: number; blue: number };
  };
  action: string;
  metres?: number;
  duration?: number;
  visibility: string;
}

export interface TripGoTrip {
  arrive: number;
  depart: number;
  carbon?: number;
  hassleFree?: boolean;
  weightedScore: number;
  saveURL?: string;
  shareURL?: string;
  updateURL?: string;
  progressURL?: string;
  plannedURL?: string;
  temporaryURL?: string;
  segments: string[];
}

export interface TripGoGroup {
  trips: TripGoTrip[];
  frequency?: number;
}

export interface TripGoRoutingResponse {
  groups: TripGoGroup[];
  segmentTemplates: Array<{
    hashCode: number;
    [key: string]: any;
  }>;
  query: {
    from: TripGoLocation;
    to: TripGoLocation;
  };
}

export interface TripGoRegion {
  name: string;
  code: string;
  timezone: string;
  bounds: {
    northEast: TripGoLocation;
    southWest: TripGoLocation;
  };
  cities: Array<{
    name: string;
    lat: number;
    lng: number;
  }>;
}

export interface TripGoLocationResult {
  lat: number;
  lng: number;
  name: string;
  address?: string;
  code?: string;
  stopCode?: string;
  modeInfo?: any;
  wheelchairAccessible?: boolean;
}

class TripGoService {
  private apiKey: string;
  private headers: Record<string, string>;

  constructor() {
    this.apiKey = TRIPGO_API_KEY;
    this.headers = {
      'X-TripGo-Key': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  private async fetchTripGo<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${TRIPGO_BASE_URL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.headers,
          ...(options?.headers || {})
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TripGo API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      console.error('TripGo API request failed:', error);
      throw error;
    }
  }

  /**
   * Get available regions
   */
  async getRegions(): Promise<{ regions: TripGoRegion[] }> {
    return this.fetchTripGo('/regions.json', {
      method: 'POST',
      body: JSON.stringify({ v: 2 })
    });
  }

  async searchLocations(query: string, near: { lat: number; lng: number }): Promise<{ choices: TripGoLocationResult[] }> {
    const params = new URLSearchParams({
      q: query,
      near: `${near.lat},${near.lng}`,
      a: 'true'
    });

    return this.fetchTripGo(`/geocode.json?${params}`);
  }

  /**
   * Get nearby transit stops and POIs
   */
  async getNearbyLocations(lat: number, lng: number, radius: number = 500, modes?: string[]): Promise<{ groups: any[] }> {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      radius: radius.toString(),
      ...(modes && { modes: modes.join(',') })
    });

    return this.fetchTripGo(`/locations.json?${params}`);
  }

  /**
   * Calculate route between two points
   */
  async calculateRoute(
    from: { lat: number; lng: number; name?: string },
    to: { lat: number; lng: number; name?: string },
    options: {
      departAfter?: number;
      arriveBefore?: number;
      modes?: string[];
      wheelchair?: boolean;
      bestOnly?: boolean;
    } = {}
  ): Promise<TripGoRoutingResponse> {
    const params = new URLSearchParams({
      v: '11',
      from: `(${from.lat},${from.lng})${from.name ? `"${from.name}"` : ''}`,
      to: `(${to.lat},${to.lng})${to.name ? `"${to.name}"` : ''}`,
      modes: options.modes?.join(',') || 'pt_pub',
      ...(options.departAfter && { departAfter: options.departAfter.toString() }),
      ...(options.arriveBefore && { arriveBefore: options.arriveBefore.toString() }),
      ...(options.wheelchair !== undefined && { wheelchair: options.wheelchair.toString() }),
      ...(options.bestOnly !== undefined && { bestOnly: options.bestOnly.toString() })
    });

    return this.fetchTripGo(`/routing.json?${params}`);
  }

  /**
   * Process routing response to get detailed trip information
   */
  processRoutingResponse(response: TripGoRoutingResponse): Array<{
    trip: TripGoTrip;
    segments: TripGoSegment[];
  }> {
    const results = [];
    const segmentMap = new Map<number, any>();

    console.log('Processing routing response:', {
      groupsCount: response.groups?.length,
      segmentTemplatesCount: response.segmentTemplates?.length
    });

    response.segmentTemplates?.forEach(template => {
      segmentMap.set(template.hashCode, template);
    });

    for (const group of response.groups) {
      for (const trip of group.trips) {
        const segments: TripGoSegment[] = [];

        console.log('Processing trip with segments:', trip.segments);

        for (const segmentRef of trip.segments) {
          const hashCode = typeof segmentRef === 'string' ? parseInt(segmentRef) : segmentRef;
          const template = segmentMap.get(hashCode);
          
          if (template) {
            segments.push({
              startTime: template.startTime,
              endTime: template.endTime,
              from: template.from,
              to: template.to,
              mode: template.modeIdentifier || template.mode || '',
              modeInfo: template.modeInfo,
              action: template.action || template.instruction || 'Travel',
              metres: template.metres || template.distance,
              duration: template.endTime - template.startTime,
              visibility: template.visibility || 'in details'
            });
          } else {
            console.warn('No template found for segment:', segmentRef, 'hashCode:', hashCode);
          }
        }

        console.log('Trip processed with', segments.length, 'segments');
        results.push({ trip, segments });
      }
    }

    return results;
  }
}

const tripGoService = new TripGoService();

export default tripGoService;