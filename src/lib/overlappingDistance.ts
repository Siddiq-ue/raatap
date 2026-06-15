/**
 * Proper Overlapping Distance Calculator
 * 
 * Uses actual route coordinates to calculate how much of the host's route
 * overlaps with the rider's journey (pickup point to destination point)
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface MatchScoreResult {
  compatible: boolean;
  match_score: number;
  pickup_distance_meters: number;
  pickup_distance_km: number;
  destination_distance_meters: number;
  destination_distance_km: number;
  overlapping_distance_meters: number;
  overlapping_distance_km: number;
  overlap_ratio: number;
  host_route_distance_meters: number;
  host_route_distance_km: number;
  same_college: boolean;
  reason: string;
}

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in meters
 */
function getHaversineDistance(point1: GeoPoint, point2: GeoPoint): number {
  const R = 6371000; // Earth radius in meters
  const lat1 = point1.lat * Math.PI / 180;
  const lat2 = point2.lat * Math.PI / 180;
  const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
  const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate fractional position (0-1) of a point along a line segment
 * Uses simple projection for straight-line routes
 */
function getFractionAlongRoute(
  fromPoint: GeoPoint,
  toPoint: GeoPoint,
  targetPoint: GeoPoint
): number {
  const totalLength = getHaversineDistance(fromPoint, toPoint);
  
  if (totalLength < 1) return 0; // Avoid division by zero
  
  // Distance from start point to target point
  const distFromStart = getHaversineDistance(fromPoint, targetPoint);
  
  // Calculate fraction (capped at 0-1)
  return Math.max(0, Math.min(1, distFromStart / totalLength));
}

/**
 * Check if a point is on/near the route (within threshold)
 */
function isPointOnRoute(
  fromPoint: GeoPoint,
  toPoint: GeoPoint,
  targetPoint: GeoPoint,
  thresholdMeters: number = 500
): boolean {
  const distFromStart = getHaversineDistance(fromPoint, targetPoint);
  const distFromEnd = getHaversineDistance(toPoint, targetPoint);
  const totalRouteLength = getHaversineDistance(fromPoint, toPoint);
  
  // Point is on route if it's close to either endpoint OR within the route segment
  const minDistToRoute = Math.min(
    distFromStart,
    distFromEnd,
    Math.abs(distFromStart + distFromEnd - totalRouteLength)
  );
  
  return minDistToRoute <= thresholdMeters;
}

/**
 * Calculate the overlapping distance between host route and rider journey
 * 
 * @param hostFrom - Host's starting point
 * @param hostTo - Host's ending point  
 * @param riderPickup - Rider's pickup point
 * @param riderDestination - Rider's destination point
 * @returns Overlapping distance in meters
 */
export function calculateOverlappingDistance(
  hostFrom: GeoPoint,
  hostTo: GeoPoint,
  riderPickup: GeoPoint,
  riderDestination: GeoPoint
): number {
  // Get total route distances
  const hostRouteDistance = getHaversineDistance(hostFrom, hostTo);
  const riderSegmentLength = getHaversineDistance(riderPickup, riderDestination);
  
  // If rider segment is too short, return 0
  if (riderSegmentLength < 10) {
    return 0;
  }
  
  // Check if both rider points are near the host route
  const pickupOnRoute = isPointOnRoute(hostFrom, hostTo, riderPickup);
  const destOnRoute = isPointOnRoute(hostFrom, hostTo, riderDestination);
  
  // If rider is not on the route, no overlap
  if (!pickupOnRoute || !destOnRoute) {
    return 0;
  }
  
  // Calculate fractional positions along the route
  const pickupFraction = getFractionAlongRoute(hostFrom, hostTo, riderPickup);
  const destFraction = getFractionAlongRoute(hostFrom, hostTo, riderDestination);
  
  // Calculate overlapping distance
  let overlappingDistance = 0;
  
  if (destFraction >= pickupFraction) {
    // Rider travels in same direction as host
    overlappingDistance = (destFraction - pickupFraction) * hostRouteDistance;
  } else {
    // Rider travels opposite direction - minimal or no overlap
    overlappingDistance = 0;
  }
  
  return Math.round(overlappingDistance);
}

/**
 * Calculate pickup distance (detour from host start to rider pickup)
 */
export function calculatePickupDistance(
  hostFrom: GeoPoint,
  riderPickup: GeoPoint
): number {
  return getHaversineDistance(hostFrom, riderPickup);
}

/**
 * Calculate destination distance (detour from host end to rider destination)
 */
export function calculateDestinationDistance(
  hostTo: GeoPoint,
  riderDestination: GeoPoint
): number {
  return getHaversineDistance(hostTo, riderDestination);
}

/**
 * Main match scoring function using proper overlapping distance
 */
export function calculateMatchScoreV2({
  hostFrom,
  hostTo,
  riderPickup,
  riderDestination,
  hostGenderPreference,
  riderGenderPreference,
  hostCollege,
  riderCollege,
  maxDetourMeters = 2000,
  maxDestinationMeters = 1000,
}: {
  hostFrom: GeoPoint;
  hostTo: GeoPoint;
  riderPickup: GeoPoint;
  riderDestination: GeoPoint;
  hostGenderPreference: string;
  riderGenderPreference: string;
  hostCollege?: string;
  riderCollege?: string;
  maxDetourMeters?: number;
  maxDestinationMeters?: number;
}): MatchScoreResult {
  // Calculate distances
  const pickupDistance = calculatePickupDistance(hostFrom, riderPickup);
  const destinationDistance = calculateDestinationDistance(hostTo, riderDestination);
  const hostRouteDistance = getHaversineDistance(hostFrom, hostTo);
  
  // 1. Gender Compatibility Check
  const genderCompatible =
    hostGenderPreference === 'both' ||
    riderGenderPreference === 'both' ||
    hostGenderPreference === riderGenderPreference;

  if (!genderCompatible) {
    return {
      compatible: false,
      match_score: 0,
      pickup_distance_meters: Math.round(pickupDistance),
      pickup_distance_km: parseFloat((pickupDistance / 1000).toFixed(2)),
      destination_distance_meters: Math.round(destinationDistance),
      destination_distance_km: parseFloat((destinationDistance / 1000).toFixed(2)),
      overlapping_distance_meters: 0,
      overlapping_distance_km: 0,
      overlap_ratio: 0,
      host_route_distance_meters: Math.round(hostRouteDistance),
      host_route_distance_km: parseFloat((hostRouteDistance / 1000).toFixed(2)),
      same_college: false,
      reason: 'Gender preference mismatch'
    };
  }

  // 2. Pickup Distance Check
  if (pickupDistance > maxDetourMeters) {
    return {
      compatible: false,
      match_score: 0,
      pickup_distance_meters: Math.round(pickupDistance),
      pickup_distance_km: parseFloat((pickupDistance / 1000).toFixed(2)),
      destination_distance_meters: Math.round(destinationDistance),
      destination_distance_km: parseFloat((destinationDistance / 1000).toFixed(2)),
      overlapping_distance_meters: 0,
      overlapping_distance_km: 0,
      overlap_ratio: 0,
      host_route_distance_meters: Math.round(hostRouteDistance),
      host_route_distance_km: parseFloat((hostRouteDistance / 1000).toFixed(2)),
      same_college: false,
      reason: `Pickup location too far (>${(pickupDistance/1000).toFixed(2)}km)`
    };
  }

  // 3. Destination Distance Check
  if (destinationDistance > maxDestinationMeters) {
    return {
      compatible: false,
      match_score: 0,
      pickup_distance_meters: Math.round(pickupDistance),
      pickup_distance_km: parseFloat((pickupDistance / 1000).toFixed(2)),
      destination_distance_meters: Math.round(destinationDistance),
      destination_distance_km: parseFloat((destinationDistance / 1000).toFixed(2)),
      overlapping_distance_meters: 0,
      overlapping_distance_km: 0,
      overlap_ratio: 0,
      host_route_distance_meters: Math.round(hostRouteDistance),
      host_route_distance_km: parseFloat((hostRouteDistance / 1000).toFixed(2)),
      same_college: false,
      reason: `Destination too far (>${(destinationDistance/1000).toFixed(2)}km)`
    };
  }

  // 4. Calculate Proper Overlapping Distance
  const overlappingDistance = calculateOverlappingDistance(
    hostFrom,
    hostTo,
    riderPickup,
    riderDestination
  );
  
  const overlapRatio = hostRouteDistance > 0 
    ? overlappingDistance / hostRouteDistance 
    : 0;

  // 5. Check if same college
  const sameCollege = !!(
    hostCollege && riderCollege && 
    hostCollege.toLowerCase().trim() === riderCollege.toLowerCase().trim()
  );

  // 6. Calculate Match Score
  const collegeBonus = sameCollege ? 10 : 0;
  
  const matchScore = (
    (1.0 - (pickupDistance / 2000.0)) * 0.50 +
    (1.0 - (destinationDistance / 1000.0)) * 0.30 +
    overlapRatio * 0.20
  ) * 100 + collegeBonus;

  const finalScore = Math.max(0, Math.min(110, matchScore));

  return {
    compatible: true,
    match_score: parseFloat(finalScore.toFixed(2)),
    pickup_distance_meters: Math.round(pickupDistance),
    pickup_distance_km: parseFloat((pickupDistance / 1000).toFixed(2)),
    destination_distance_meters: Math.round(destinationDistance),
    destination_distance_km: parseFloat((destinationDistance / 1000).toFixed(2)),
    overlapping_distance_meters: Math.round(overlappingDistance),
    overlapping_distance_km: parseFloat((overlappingDistance / 1000).toFixed(2)),
    overlap_ratio: parseFloat(Math.max(0, Math.min(1, overlapRatio)).toFixed(2)),
    host_route_distance_meters: Math.round(hostRouteDistance),
    host_route_distance_km: parseFloat((hostRouteDistance / 1000).toFixed(2)),
    same_college: sameCollege,
    reason: sameCollege ? 'Compatible route found (Same College!)' : 'Compatible route found'
  };
}
