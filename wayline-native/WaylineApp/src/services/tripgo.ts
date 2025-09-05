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
  segments: any[];
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

    const result = await this.fetchTripGo<TripGoRoutingResponse>(`/routing.json?${params}`);
    return result;
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

    response.segmentTemplates?.forEach(template => {
      segmentMap.set(template.hashCode, template);
    });

    for (const group of response.groups) {
      for (const trip of group.trips) {
        const segments: TripGoSegment[] = [];

        if (Array.isArray(trip.segments) && trip.segments.length > 0 && typeof trip.segments[0] === 'object') {
          for (const segment of trip.segments) {
            if ('startTime' in segment && 'endTime' in segment) {
              const seg = segment as any;
              let actionText = seg.action || seg.instruction || seg.notes || '';
              
              if (!actionText && seg.from && seg.to) {
                const mode = seg.modeIdentifier || seg.mode || '';
                if (mode.includes('walk')) {
                  actionText = `Walk to ${seg.to.name || seg.to.address || 'destination'}`;
                } else if (mode.includes('bus') || mode.includes('train')) {
                  actionText = `Take ${seg.operator || 'transit'} to ${seg.to.name || 'destination'}`;
                } else {
                  actionText = `Travel to ${seg.to.name || 'destination'}`;
                }
              }
              
              const processedSegment: TripGoSegment = {
                ...seg,
                mode: seg.modeIdentifier || seg.mode || seg.type || '',
                action: actionText || 'Travel',
              };
              segments.push(processedSegment);
            }
          }
        } else if (trip.segments) {
          for (const segmentRef of trip.segments) {
          let hashCode: number;
          if (typeof segmentRef === 'string') {
            hashCode = parseInt(segmentRef, 10);
            if (isNaN(hashCode)) {
              console.warn('Invalid segment reference:', segmentRef);
              continue;
            }
          } else if (typeof segmentRef === 'number') {
            hashCode = segmentRef;
          } else if (typeof segmentRef === 'object' && segmentRef !== null && 'hashCode' in segmentRef) {
            hashCode = (segmentRef as any).hashCode;
          } else {
            console.warn('Unknown segment reference type:', segmentRef);
            continue;
          }
          
          const template = segmentMap.get(hashCode);
          
          if (template) {
            let actionText = template.action || template.instruction || template.notes || '';
            
            if (!actionText && template.serviceName) {
              actionText = `Take ${template.serviceName}`;
              if (template.serviceTripID) {
                actionText += ` (${template.serviceTripID})`;
              }
              if (template.to && template.to.name) {
                actionText += ` to ${template.to.name}`;
              }
            }
            
            if (!actionText && template.operator) {
              const routeInfo = template.routeShortName || template.routeLongName || '';
              if (routeInfo) {
                actionText = `Take ${template.operator} ${routeInfo}`;
              } else {
                actionText = `Take ${template.operator}`;
              }
              if (template.to && template.to.name) {
                actionText += ` to ${template.to.name}`;
              }
            }
            
            if (!actionText && template.from && template.to) {
              const modeStr = (template.modeIdentifier || template.mode || template.type || '').toLowerCase();
              if (modeStr.includes('walk')) {
                actionText = `Walk from ${template.from.name || template.from.address || 'location'} to ${template.to.name || template.to.address || 'destination'}`;
              } else if (modeStr.includes('bus') || modeStr.includes('train') || modeStr.includes('pt_pub')) {
                actionText = `Take ${template.operator || 'public transport'} to ${template.to.name || 'destination'}`;
              } else {
                actionText = `Travel to ${template.to.name || 'destination'}`;
              }
            }
            
            if (!actionText && template.streets && template.streets.length > 0) {
              const street = template.streets[0];
              if (street.instruction) {
                actionText = street.instruction;
              } else if (street.name) {
                actionText = `Walk along ${street.name}`;
              }
            }
            
            segments.push({
              startTime: template.startTime || 0,
              endTime: template.endTime || 0,
              from: template.from || {},
              to: template.to || {},
              mode: template.modeIdentifier || template.mode || template.type || '',
              modeInfo: template.modeInfo,
              action: actionText || 'Travel',
              metres: template.metres || template.distance || 0,
              duration: (template.endTime || 0) - (template.startTime || 0),
              visibility: template.visibility || 'in details'
            });
          } else {
            console.warn('No template found for segment:', segmentRef, 'hashCode:', hashCode);
          }
          }
        }
        results.push({ trip, segments });
      }
    }

    return results;
  }
}

const tripGoService = new TripGoService();

export default tripGoService;