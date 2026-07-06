/**
 * OSRM (Open Source Routing Machine) Utility
 * Calculates real road-based distances and routes
 * 
 * TODO: The default URL (https://router.project-osrm.org) is a public demo instance 
 * not meant for production traffic. Set OSRM_SERVER_URL to a self-hosted instance before launch.
 * 
 * @example
 * // Use public server
 * const detour = await calculateDetour(from, to, pickup);
 * 
 * @example
 * // Use self-hosted server (Oracle Cloud, Fly.io, etc.)
 * process.env.OSRM_SERVER_URL = 'http://your-server:5000';
 */

export interface OSRMRoute {
  distance: number; // meters
  duration: number; // seconds
  geometry: any;
}

export interface OSRMResponse {
  routes: OSRMRoute[];
  waypoints: any[];
  code: string;
}

export interface DetourCalculation {
  originalDistance: number; // meters (A → B)
  detourDistance: number; // meters (A → Pickup → B)
  detourAdded: number; // meters (extra distance)
  originalDuration: number; // seconds
  detourDuration: number; // seconds
  extraTime: number; // seconds
}

// OSRM Server configuration
const OSRM_SERVER_URL = process.env.OSRM_SERVER_URL || 'https://router.project-osrm.org';

// Simple in-memory cache to reduce API calls
const routeCache = new Map<string, OSRMRoute>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

/**
 * Get route between two points using OSRM
 */
export async function getRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<OSRMRoute | null> {
  // Create cache key
  const cacheKey = `route:${from.lat},${from.lng}-${to.lat},${to.lng}`;
  
  // Check cache
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const url = `${OSRM_SERVER_URL}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Timeout after 5 seconds
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`OSRM API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: OSRMResponse = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.warn('No route found by OSRM');
      return null;
    }

    const route = data.routes[0];
    
    // Cache the result
    setCache(cacheKey, route);
    
    return route;
  } catch (error) {
    console.error('Error fetching route from OSRM:', error);
    return null;
  }
}

/**
 * Get route with waypoint (for detour calculation)
 * Route: from → waypoint → to
 */
export async function getRouteWithWaypoint(
  from: { lat: number; lng: number },
  waypoint: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<OSRMRoute | null> {
  // Create cache key
  const cacheKey = `waypoint:${from.lat},${from.lng}-${waypoint.lat},${waypoint.lng}-${to.lat},${to.lng}`;
  
  // Check cache
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const url = `${OSRM_SERVER_URL}/route/v1/driving/${from.lng},${from.lat};${waypoint.lng},${waypoint.lat};${to.lng},${to.lat}?overview=false`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Timeout after 5 seconds
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`OSRM API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: OSRMResponse = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.warn('No route found by OSRM');
      return null;
    }

    const route = data.routes[0];
    
    // Cache the result
    setCache(cacheKey, route);
    
    return route;
  } catch (error) {
    console.error('Error fetching route with waypoint from OSRM:', error);
    return null;
  }
}

/**
 * Get multiple alternative routes from OSRM
 * Returns array of routes with geometry, distance, duration
 */
export async function getAlternativeRoutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  alternatives: number = 3
): Promise<{ routes: OSRMRoute[] } | null> {
  try {
    const url = `${OSRM_SERVER_URL}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=${alternatives}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`OSRM Alternatives API error: ${response.status}`);
      return null;
    }

    const data: OSRMResponse = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.warn('No alternative routes found by OSRM');
      return null;
    }

    const result = { routes: data.routes };
    return result;
  } catch (error) {
    console.error('Error fetching alternative routes from OSRM:', error);
    return null;
  }
}

/**
 * Get full route geometry (LineString) from OSRM
 * This returns the GeoJSON geometry needed for PostGIS spatial matching
 */
export async function getRouteGeometry(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<any | null> {
  const cacheKey = `geometry:${from.lat},${from.lng}-${to.lat},${to.lng}`;
  
  // Check cache (reusing the OSRMRoute cache pattern)
  const cached = getCached(cacheKey);
  if (cached && cached.geometry) return cached.geometry;

  try {
    // Request full overview and GeoJSON geometries
    const url = `${OSRM_SERVER_URL}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Timeout after 5 seconds
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`OSRM Geometry API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: OSRMResponse = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.warn('No route geometry found by OSRM');
      return null;
    }

    const route = data.routes[0];
    
    // Cache the result
    setCache(cacheKey, route);
    
    return route.geometry;
  } catch (error) {
    console.error('Error fetching route geometry from OSRM:', error);
    return null;
  }
}

/**
 * Calculate real detour distance using OSRM
 * 
 * @param from - Host start point (office)
 * @param to - Host end point (home)
 * @param pickup - Rider pickup point
 * @returns Detour calculation with distances and durations
 */
export async function calculateDetour(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  pickup: { lat: number; lng: number }
): Promise<DetourCalculation | null> {
  try {
    // Get original route distance (A → B)
    const originalRoute = await getRoute(from, to);
    if (!originalRoute) {
      console.warn('Could not get original route');
      return null;
    }

    // Get detour route distance (A → Pickup → B)
    const detourRoute = await getRouteWithWaypoint(from, pickup, to);
    if (!detourRoute) {
      console.warn('Could not get detour route');
      return null;
    }

    return {
      originalDistance: originalRoute.distance,
      detourDistance: detourRoute.distance,
      detourAdded: detourRoute.distance - originalRoute.distance,
      originalDuration: originalRoute.duration,
      detourDuration: detourRoute.duration,
      extraTime: detourRoute.duration - originalRoute.duration,
    };
  } catch (error) {
    console.error('Error calculating detour:', error);
    return null;
  }
}

/**
 * Calculate straight-line distance (Haversine formula)
 * Fallback when OSRM is unavailable
 */
export function getStraightLineDistance(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δφ = ((to.lat - from.lat) * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Get route with fallback to straight-line calculation
 * More resilient but less accurate
 */
export async function getRouteWithFallback(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<{ distance: number; duration: number; isEstimate: boolean }> {
  const osrmRoute = await getRoute(from, to);

  if (osrmRoute) {
    return {
      distance: osrmRoute.distance,
      duration: osrmRoute.duration,
      isEstimate: false,
    };
  }

  // Fallback to straight-line with speed estimate
  const straightDistance = getStraightLineDistance(from, to);
  // Estimate: assume 30 km/h average city speed
  const estimatedDuration = (straightDistance / 30000) * 3600 * 1.3; // +30% for roads

  return {
    distance: straightDistance * 1.3, // Estimate roads add ~30%
    duration: estimatedDuration,
    isEstimate: true,
  };
}

// Cache helper functions
function getCached(key: string): OSRMRoute | null {
  const timestamp = cacheTimestamps.get(key);
  if (!timestamp) return null;
  
  const isExpired = Date.now() - timestamp > CACHE_TTL;
  if (isExpired) {
    cacheTimestamps.delete(key);
    routeCache.delete(key);
    return null;
  }
  
  return routeCache.get(key) || null;
}

function setCache(key: string, route: OSRMRoute): void {
  // Limit cache size to 1000 entries
  if (routeCache.size >= 1000) {
    const oldestKey = cacheTimestamps.keys().next().value;
    if (oldestKey) {
      cacheTimestamps.delete(oldestKey);
      routeCache.delete(oldestKey);
    }
  }
  
  routeCache.set(key, route);
  cacheTimestamps.set(key, Date.now());
}

/**
 * Clear the route cache
 * Useful for testing or manual cache invalidation
 */
export function clearCache(): void {
  routeCache.clear();
  cacheTimestamps.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; entries: number } {
  const now = Date.now();
  let validEntries = 0;
  
  for (const [key, timestamp] of cacheTimestamps.entries()) {
    if (now - timestamp < CACHE_TTL) {
      validEntries++;
    }
  }
  
  return {
    size: routeCache.size,
    entries: validEntries,
  };
}
