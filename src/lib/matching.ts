/**
 * Match Scoring Utility
 * 
 * Natively calculates ride matching scores based on the Host-First Architecture
 * Uses proper overlapping distance calculation based on actual route coordinates.
 */

import { createClient } from "@supabase/supabase-js";

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
  blocked?: boolean;
  blockReason?: string;
}

/**
 * Calculate distance between two points using Haversine formula
 */
function getHaversineDistance(p1: GeoPoint, p2: GeoPoint): number {
  const R = 6371000;
  const lat1 = p1.lat * Math.PI / 180;
  const lat2 = p2.lat * Math.PI / 180;
  const deltaLat = (p2.lat - p1.lat) * Math.PI / 180;
  const deltaLng = (p2.lng - p1.lng) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Check if a point is near a route segment
 */
function isPointOnRoute(from: GeoPoint, to: GeoPoint, target: GeoPoint, threshold = 500): boolean {
  const distFromStart = getHaversineDistance(from, target);
  const distFromEnd = getHaversineDistance(to, target);
  const totalRouteLength = getHaversineDistance(from, to);
  
  const minDistToRoute = Math.min(
    distFromStart,
    distFromEnd,
    Math.abs(distFromStart + distFromEnd - totalRouteLength)
  );
  
  return minDistToRoute <= threshold;
}

/**
 * Get fractional position (0-1) of a point along the route
 */
function getFractionAlongRoute(from: GeoPoint, to: GeoPoint, target: GeoPoint): number {
  const totalLength = getHaversineDistance(from, to);
  if (totalLength < 1) return 0;
  const distFromStart = getHaversineDistance(from, target);
  return Math.max(0, Math.min(1, distFromStart / totalLength));
}

/**
 * Project a lat/lng point into local planar meters anchored at `origin`
 * (equirectangular approximation). Accurate to within a few meters at
 * commute-route scale, which is all a point-to-polyline projection needs.
 */
function toLocalMeters(origin: GeoPoint, point: GeoPoint): { x: number; y: number } {
  const R = 6371000;
  const latRad = origin.lat * Math.PI / 180;
  return {
    x: (point.lng - origin.lng) * Math.PI / 180 * R * Math.cos(latRad),
    y: (point.lat - origin.lat) * Math.PI / 180 * R,
  };
}

/**
 * Project `target` onto segment [segStart, segEnd]. Returns the
 * perpendicular distance to the segment and the fraction (0-1) along it.
 */
function projectOntoSegment(segStart: GeoPoint, segEnd: GeoPoint, target: GeoPoint): { distanceMeters: number; fraction: number } {
  const p2 = toLocalMeters(segStart, segEnd);
  const p = toLocalMeters(segStart, target);
  const lenSq = p2.x * p2.x + p2.y * p2.y;

  if (lenSq < 0.01) {
    return { distanceMeters: getHaversineDistance(segStart, target), fraction: 0 };
  }

  const t = Math.max(0, Math.min(1, (p.x * p2.x + p.y * p2.y) / lenSq));
  const dx = p.x - t * p2.x;
  const dy = p.y - t * p2.y;

  return { distanceMeters: Math.sqrt(dx * dx + dy * dy), fraction: t };
}

/**
 * Project `target` onto a full polyline (sequence of [lng, lat] pairs, the
 * GeoJSON/OSRM coordinate order). Returns the distance along the polyline
 * (meters, from the first vertex) to the closest point, the perpendicular
 * distance from that point to the route, and the polyline's total length.
 */
function projectOntoPolyline(
  coords: [number, number][],
  target: GeoPoint
): { distanceAlong: number; distanceToRoute: number; totalLength: number } {
  let cumulative = 0;
  let bestDistanceToRoute = Infinity;
  let bestDistanceAlong = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const segStart: GeoPoint = { lng: coords[i][0], lat: coords[i][1] };
    const segEnd: GeoPoint = { lng: coords[i + 1][0], lat: coords[i + 1][1] };
    const segLength = getHaversineDistance(segStart, segEnd);

    const { distanceMeters, fraction } = projectOntoSegment(segStart, segEnd, target);

    if (distanceMeters < bestDistanceToRoute) {
      bestDistanceToRoute = distanceMeters;
      bestDistanceAlong = cumulative + fraction * segLength;
    }

    cumulative += segLength;
  }

  return { distanceAlong: bestDistanceAlong, distanceToRoute: bestDistanceToRoute, totalLength: cumulative };
}

/**
 * Pull a flat [lng, lat][] coordinate array out of whatever shape route
 * geometry arrives in - a GeoJSON LineString (from OSRM, or a PostGIS
 * geography column serialized by PostgREST) or a raw coordinate array.
 */
function extractLineCoords(geometry: any): [number, number][] | null {
  const coords = Array.isArray(geometry) ? geometry : geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return coords;
}

/**
 * Calculate the overlapping distance between the host's route and the
 * rider's pickup -> dropoff segment.
 *
 * When the host's actual route geometry (the real, road-following polyline)
 * is available, the rider's points are projected directly onto it. This is
 * what makes the overlap correct for routes that bend - a straight chord
 * between the host's endpoints can sit far from where the road (and the
 * rider) actually is, which was silently zeroing out valid overlaps. Falls
 * back to the straight-line chord approximation when no geometry is passed.
 */
function calculateOverlappingDistance(
  hostFrom: GeoPoint,
  hostTo: GeoPoint,
  riderPickup: GeoPoint,
  riderDest: GeoPoint,
  pickupThreshold = 500,
  destThreshold = 500,
  hostRouteGeometry?: any
): number {
  const riderSegmentLength = getHaversineDistance(riderPickup, riderDest);

  if (riderSegmentLength < 10) {
    return 0;
  }

  const hostRouteCoords = extractLineCoords(hostRouteGeometry);

  if (hostRouteCoords) {
    const pickupProjection = projectOntoPolyline(hostRouteCoords, riderPickup);
    const destProjection = projectOntoPolyline(hostRouteCoords, riderDest);

    if (pickupProjection.distanceToRoute > pickupThreshold || destProjection.distanceToRoute > destThreshold) {
      return 0;
    }

    if (destProjection.distanceAlong >= pickupProjection.distanceAlong) {
      return destProjection.distanceAlong - pickupProjection.distanceAlong;
    }
    return 0;
  }

  // Fallback: no route geometry available, approximate with the straight
  // chord between the host's start and end points.
  const hostRouteDistance = getHaversineDistance(hostFrom, hostTo);
  const pickupOnRoute = isPointOnRoute(hostFrom, hostTo, riderPickup, pickupThreshold);
  const destOnRoute = isPointOnRoute(hostFrom, hostTo, riderDest, destThreshold);

  if (!pickupOnRoute || !destOnRoute) {
    return 0;
  }

  const pickupFraction = getFractionAlongRoute(hostFrom, hostTo, riderPickup);
  const destFraction = getFractionAlongRoute(hostFrom, hostTo, riderDest);

  if (destFraction >= pickupFraction) {
    return (destFraction - pickupFraction) * hostRouteDistance;
  }
  return 0;
}

/**
 * Check if a host-rider pair has a red flag that blocks matching
 */
export async function checkRedFlag(
  supabase: any,
  hostId: string,
  riderId: string
): Promise<{ hasRedFlag: boolean; reason?: string }> {
  try {
    const { data, error } = await supabase
      .from("host_behavior_flags")
      .select("reason")
      .eq("host_id", hostId)
      .eq("rider_id", riderId)
      .eq("flag_type", "red")
      .is("resolved_at", null)
      .single();

    if (error && error.code !== "PGRST116") { // Not "no rows returned"
      console.error("Error checking red flags:", error);
      return { hasRedFlag: false };
    }

    return {
      hasRedFlag: !!data,
      reason: data?.reason
    };
  } catch (err) {
    console.error("Exception checking red flags:", err);
    return { hasRedFlag: false };
  }
}

export function calculateMatchScore({
  hostFrom,
  hostTo,
  riderPickup,
  riderDestination,
  riderTotalJourneyMeters,
  hostGenderPreference,
  riderGenderPreference,
  hostCollege,
  riderCollege,
  maxDetourMeters = 2000,
  maxDestinationMeters = 1000,
  hostRouteGeometry,
  riderRouteGeometry,
  pickupDistanceOverride,
  destinationDistanceOverride,
}: {
  hostFrom: GeoPoint;
  hostTo: GeoPoint;
  riderPickup: GeoPoint;
  riderDestination: GeoPoint;
  riderTotalJourneyMeters: number;
  hostGenderPreference: string;
  riderGenderPreference: string;
  hostCollege?: string;
  riderCollege?: string;
  maxDetourMeters?: number;
  maxDestinationMeters?: number;
  hostRouteGeometry?: any;
  riderRouteGeometry?: any;
  pickupDistanceOverride?: number;
  destinationDistanceOverride?: number;
}): MatchScoreResult {
  const pickupDistance = pickupDistanceOverride ?? getHaversineDistance(hostFrom, riderPickup);
  const destinationDistance = destinationDistanceOverride ?? getHaversineDistance(hostTo, riderDestination);
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

  // 4. Calculate Overlapping Distance
  // Project the rider's pickup/destination onto the host's actual route (real
  // road-following geometry when available, else the straight chord between
  // hostFrom/hostTo) and take the distance between them along it, capped by
  // the rider's own journey distance so they're never charged for more than
  // they travel.
  const hostRouteCoords = extractLineCoords(hostRouteGeometry);
  let overlappingDistance = calculateOverlappingDistance(
    hostFrom,
    hostTo,
    riderPickup,
    riderDestination,
    maxDetourMeters,
    maxDestinationMeters,
    hostRouteGeometry
  );

  if (riderTotalJourneyMeters > 0) {
    overlappingDistance = Math.min(overlappingDistance, riderTotalJourneyMeters);
  }

  // When real route geometry is available, report its actual (road-following)
  // length instead of the straight chord - it's a more accurate "host route
  // distance" and keeps overlap_ratio/host_route_distance consistent with how
  // overlappingDistance was actually computed above.
  const reportedHostRouteDistance = hostRouteCoords
    ? projectOntoPolyline(hostRouteCoords, hostTo).totalLength
    : hostRouteDistance;

  const overlapRatio = riderTotalJourneyMeters > 0
    ? overlappingDistance / riderTotalJourneyMeters
    : 0;

  // 5. Check if same college
  const sameCollege = !!(hostCollege && riderCollege && 
    hostCollege.toLowerCase().trim() === riderCollege.toLowerCase().trim());

  // 6. Calculate Match Score (base 100) + College Bonus (10)
  const collegeBonus = sameCollege ? 10 : 0;
  
  let matchScore = (
    (1.0 - (pickupDistance / 2000.0)) * 0.50 +
    (1.0 - (destinationDistance / 1000.0)) * 0.30 +
    overlapRatio * 0.20
  ) * 100;

  // Add college bonus
  matchScore = matchScore + collegeBonus;

  matchScore = Math.max(0, Math.min(110, matchScore)); // Allow up to 110 with bonus

  return {
    compatible: true,
    match_score: parseFloat(matchScore.toFixed(2)),
    pickup_distance_meters: Math.round(pickupDistance),
    pickup_distance_km: parseFloat((pickupDistance / 1000).toFixed(2)),
    destination_distance_meters: Math.round(destinationDistance),
    destination_distance_km: parseFloat((destinationDistance / 1000).toFixed(2)),
    overlapping_distance_meters: Math.round(overlappingDistance),
    overlapping_distance_km: parseFloat((overlappingDistance / 1000).toFixed(2)),
    overlap_ratio: parseFloat(overlapRatio.toFixed(2)),
    host_route_distance_meters: Math.round(reportedHostRouteDistance),
    host_route_distance_km: parseFloat((reportedHostRouteDistance / 1000).toFixed(2)),
    same_college: sameCollege,
    reason: sameCollege ? 'Compatible route found (Same College!)' : 'Compatible route found via API'
  };
}
