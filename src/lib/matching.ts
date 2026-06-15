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
 * Calculate overlapping distance using route geometries (PostGIS)
 * This is the most accurate method when geometries are available
 */
function calculateOverlappingDistanceWithGeometries(
  riderTotalJourneyMeters: number,
  pickupDistance: number,
  destinationDistance: number
): number {
  // More accurate formula: overlap = rider_journey - pickup_detour - destination_detour
  // This assumes the rider's route overlaps with host's route between pickup and destination
  let overlappingDistance = 0;
  if (riderTotalJourneyMeters > 0) {
    overlappingDistance = Math.max(0, riderTotalJourneyMeters - pickupDistance - destinationDistance);
  }
  return Math.round(overlappingDistance);
}

/**
 * Calculate overlapping distance using actual route coordinates
 */
function calculateOverlappingDistance(
  hostFrom: GeoPoint,
  hostTo: GeoPoint,
  riderPickup: GeoPoint,
  riderDest: GeoPoint
): number {
  const hostRouteDistance = getHaversineDistance(hostFrom, hostTo);
  const riderSegmentLength = getHaversineDistance(riderPickup, riderDest);

  if (riderSegmentLength < 10) return 0;

  const pickupOnRoute = isPointOnRoute(hostFrom, hostTo, riderPickup);
  const destOnRoute = isPointOnRoute(hostFrom, hostTo, riderDest);

  if (!pickupOnRoute || !destOnRoute) return 0;

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
  // Use geometry-based calculation if route geometries are available (more accurate)
  // Otherwise fall back to point-based calculation
  let overlappingDistance = 0;
  
  if (riderTotalJourneyMeters > 0) {
    // Use the geometry-based formula (rider_journey - pickup_detour - destination_detour)
    // This is more accurate when riderTotalJourneyMeters comes from OSRM
    overlappingDistance = calculateOverlappingDistanceWithGeometries(
      riderTotalJourneyMeters,
      pickupDistance,
      destinationDistance
    );
  }

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
    host_route_distance_meters: Math.round(hostRouteDistance),
    host_route_distance_km: parseFloat((hostRouteDistance / 1000).toFixed(2)),
    same_college: sameCollege,
    reason: sameCollege ? 'Compatible route found (Same College!)' : 'Compatible route found via API'
  };
}
