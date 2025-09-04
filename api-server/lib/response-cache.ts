import crypto from 'crypto';

interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 2 * 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, 30 * 60 * 1000);

export function getCacheKey(url: string, params?: any): string {
  const sortedParams = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
  return crypto.createHash('md5').update(`${url}:${sortedParams}`).digest('hex');
}

export function getCachedResponse(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  
  return entry.data;
}

export function setCachedResponse(key: string, data: any): void {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

export function clearCache(): void {
  cache.clear();
}