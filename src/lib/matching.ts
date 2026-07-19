/**
 * Match Scoring Utility
 * 
 * Natively calculates ride matching scores based on the Host-First Architecture
 * Uses proper overlapping distance calculation based on actual route coordinates.
 */

import { createClient } from "@supabase/supabase-js";
import { getRouteWithFallback } from "./osrm";

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
function projectOntoSegment(segStart: GeoPoint, segEnd: GeoPoint, target: GeoPoint): { distanceMeters: number; fraction: number; point: GeoPoint } {
  const p2 = toLocalMeters(segStart, segEnd);
  const p = toLocalMeters(segStart, target);
  const lenSq = p2.x * p2.x + p2.y * p2.y;

  if (lenSq < 0.01) {
    return { distanceMeters: getHaversineDistance(segStart, target), fraction: 0, point: segStart };
  }

  const t = Math.max(0, Math.min(1, (p.x * p2.x + p.y * p2.y) / lenSq));
  const dx = p.x - t * p2.x;
  const dy = p.y - t * p2.y;

  return {
    distanceMeters: Math.sqrt(dx * dx + dy * dy),
    fraction: t,
    point: { lat: segStart.lat + t * (segEnd.lat - segStart.lat), lng: segStart.lng + t * (segEnd.lng - segStart.lng) },
  };
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
): { distanceAlong: number; distanceToRoute: number; totalLength: number; point: GeoPoint } {
  let cumulative = 0;
  let bestDistanceToRoute = Infinity;
  let bestDistanceAlong = 0;
  let bestPoint: GeoPoint = { lng: coords[0][0], lat: coords[0][1] };

  for (let i = 0; i < coords.length - 1; i++) {
    const segStart: GeoPoint = { lng: coords[i][0], lat: coords[i][1] };
    const segEnd: GeoPoint = { lng: coords[i + 1][0], lat: coords[i + 1][1] };
    const segLength = getHaversineDistance(segStart, segEnd);

    const { distanceMeters, fraction, point } = projectOntoSegment(segStart, segEnd, target);

    if (distanceMeters < bestDistanceToRoute) {
      bestDistanceToRoute = distanceMeters;
      bestDistanceAlong = cumulative + fraction * segLength;
      bestPoint = point;
    }

    cumulative += segLength;
  }

  return { distanceAlong: bestDistanceAlong, distanceToRoute: bestDistanceToRoute, totalLength: cumulative, point: bestPoint };
}

/**
 * Parse a PostGIS hex-encoded (E)WKB LineString - the default text form
 * Postgres/PostgREST return for `geography`/`geometry` columns selected
 * directly (e.g. "0102000020E6100000...") - into [lng, lat][] pairs.
 * Supabase never hands back GeoJSON for these columns unless the query
 * explicitly wraps them in ST_AsGeoJSON, so this is the common case in
 * practice, not a fallback.
 */
function parseWkbHexLineString(hex: string): [number, number][] | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0 || hex.length < 18) return null;

  const buf = Buffer.from(hex, "hex");
  let offset = 0;

  const littleEndian = buf.readUInt8(offset) === 1;
  offset += 1;

  const readUInt32 = () => {
    const v = littleEndian ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
    offset += 4;
    return v;
  };
  const readDouble = () => {
    const v = littleEndian ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset);
    offset += 8;
    return v;
  };

  const geomType = readUInt32();
  const hasSrid = (geomType & 0x20000000) !== 0;
  if ((geomType & 0xff) !== 2) return null; // not a LineString

  if (hasSrid) readUInt32(); // discard SRID, we only need coordinates

  const numPoints = readUInt32();
  if (!Number.isFinite(numPoints) || numPoints < 2) return null;
  if (offset + numPoints * 16 > buf.length) return null; // truncated/corrupt buffer

  const coords: [number, number][] = [];
  for (let i = 0; i < numPoints; i++) {
    const x = readDouble();
    const y = readDouble();
    coords.push([x, y]);
  }
  return coords;
}

/**
 * Parse WKT/EWKT LineString text (e.g. "SRID=4326;LINESTRING(lng lat, ...)"
 * or "LINESTRING(lng lat, ...)") into [lng, lat][] pairs. Some columns in
 * this schema store route geometry as plain text rather than a native
 * PostGIS type, which comes back this way instead of hex WKB.
 */
function parseWktLineString(text: string): [number, number][] | null {
  const match = text.match(/LINESTRING\s*\(([^)]+)\)/i);
  if (!match) return null;

  const coords = match[1].split(",").map((pair) => {
    const [lng, lat] = pair.trim().split(/\s+/).map(Number);
    return [lng, lat] as [number, number];
  });

  return coords.length >= 2 && coords.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
    ? coords
    : null;
}

/**
 * Pull a flat [lng, lat][] coordinate array out of whatever shape route
 * geometry arrives in: a raw coordinate array, a GeoJSON LineString, hex
 * WKB (the default for a PostGIS geography/geometry column selected as-is
 * via Supabase), or WKT/EWKT text.
 */
function extractLineCoords(geometry: any): [number, number][] | null {
  if (Array.isArray(geometry)) {
    return geometry.length >= 2 ? geometry : null;
  }
  if (typeof geometry === "string") {
    return parseWkbHexLineString(geometry) ?? parseWktLineString(geometry);
  }
  const coords = geometry?.coordinates;
  return Array.isArray(coords) && coords.length >= 2 ? coords : null;
}

/**
 * Project the rider's pickup and destination onto the host's route - the
 * real, road-following polyline when available, otherwise the straight
 * chord between the host's endpoints - and report, for each point, how far
 * the rider would have to travel to reach the route and how far along the
 * route that point sits.
 *
 * The host never detours in this app's model: they drive their route exactly
 * as planned, and the rider gets themself to wherever that route already
 * passes closest. So "distance to route" here - not distance to the host's
 * fixed start/end address - is what "pickup distance" and "destination
 * distance" should mean everywhere they're used (the compatibility gate,
 * the match score, and the overlap calculation below all share this one
 * projection so they can never disagree about where the route actually is).
 */
function projectRiderOntoHostRoute(
  hostFrom: GeoPoint,
  hostTo: GeoPoint,
  riderPickup: GeoPoint,
  riderDestination: GeoPoint,
  hostRouteGeometry?: any
): {
  pickup: { distanceToRoute: number; distanceAlong: number; point: GeoPoint };
  destination: { distanceToRoute: number; distanceAlong: number; point: GeoPoint };
  hostRouteLength: number;
} {
  const hostRouteCoords = extractLineCoords(hostRouteGeometry) ??
    ([[hostFrom.lng, hostFrom.lat], [hostTo.lng, hostTo.lat]] as [number, number][]);

  const pickup = projectOntoPolyline(hostRouteCoords, riderPickup);
  const destination = projectOntoPolyline(hostRouteCoords, riderDestination);

  return {
    pickup: { distanceToRoute: pickup.distanceToRoute, distanceAlong: pickup.distanceAlong, point: pickup.point },
    destination: { distanceToRoute: destination.distanceToRoute, distanceAlong: destination.distanceAlong, point: destination.point },
    hostRouteLength: pickup.totalLength,
  };
}

/**
 * Distance along the host's route between the rider's pickup and
 * destination projections - the segment of the host's trip the rider
 * actually shares. Zero if either point is too far from the route to
 * count as "on it," or if the destination projects behind the pickup
 * (the rider's leg runs the wrong way along the route).
 */
function overlapFromProjection(
  projection: ReturnType<typeof projectRiderOntoHostRoute>,
  riderSegmentLength: number,
  pickupThreshold: number,
  destThreshold: number
): number {
  if (riderSegmentLength < 10) {
    return 0;
  }

  if (projection.pickup.distanceToRoute > pickupThreshold || projection.destination.distanceToRoute > destThreshold) {
    return 0;
  }

  if (projection.destination.distanceAlong >= projection.pickup.distanceAlong) {
    return projection.destination.distanceAlong - projection.pickup.distanceAlong;
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
  pickupDistanceOverride?: number;
  destinationDistanceOverride?: number;
}): MatchScoreResult {
  // The host drives their route exactly as planned and never detours - the
  // rider gets themself to wherever the route already passes closest. So
  // "pickup distance" / "destination distance" mean distance-to-the-route,
  // not distance-to-the-host's-fixed-start/end-address. pickupDistanceOverride
  // /destinationDistanceOverride (from the SQL candidate search, which already
  // measures point-to-route distance) take precedence when supplied; otherwise
  // this same projection also drives the overlap calculation below, so the
  // two can never disagree about where the route is.
  const projection = projectRiderOntoHostRoute(hostFrom, hostTo, riderPickup, riderDestination, hostRouteGeometry);
  const pickupDistance = pickupDistanceOverride ?? projection.pickup.distanceToRoute;
  const destinationDistance = destinationDistanceOverride ?? projection.destination.distanceToRoute;
  const hostRouteDistance = projection.hostRouteLength;
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
  // Distance along the host's route between the rider's pickup and
  // destination projections (computed above), capped by the rider's own
  // journey distance so they're never charged for more than they travel.
  const riderSegmentLength = getHaversineDistance(riderPickup, riderDestination);
  let overlappingDistance = overlapFromProjection(projection, riderSegmentLength, maxDetourMeters, maxDestinationMeters);

  if (riderTotalJourneyMeters > 0) {
    overlappingDistance = Math.min(overlappingDistance, riderTotalJourneyMeters);
  }

  // 4b. A match only makes sense if the rider actually shares part of the
  // host's route, travelling the same direction the host is already
  // driving - being close to the road isn't enough on its own. This is
  // what rejects e.g. a rider standing right next to the route but wanting
  // to go the opposite way: pickup/destination distance can both be tiny
  // while overlap is still genuinely zero.
  if (overlappingDistance <= 0) {
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
      reason: 'No shared route with host (wrong direction or no overlap)'
    };
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

/**
 * Same as calculateMatchScore, but measures pickup/destination distance as
 * real driving distance instead of straight-line distance to the route.
 *
 * The host never detours to get the rider - the rider makes their own way to
 * wherever the host's route already passes (the "meeting point"). A meeting
 * point that's 400m away as the crow flies can be a 2km drive if it's across
 * a highway or down a one-way system, so the straight-line figure understates
 * what the rider actually has to travel. This fetches the real road distance
 * from OSRM for the rider's shortest path to (and from) that meeting point,
 * then feeds it into the same compatibility gate and scoring logic via the
 * override params - nothing about the overlap/gating rules themselves changes.
 */
export async function calculateMatchScoreWithRoadDistance(
  params: Parameters<typeof calculateMatchScore>[0]
): Promise<MatchScoreResult> {
  const { hostFrom, hostTo, riderPickup, riderDestination, hostRouteGeometry } = params;
  const projection = projectRiderOntoHostRoute(hostFrom, hostTo, riderPickup, riderDestination, hostRouteGeometry);

  const [pickupRoad, destinationRoad] = await Promise.all([
    getRouteWithFallback(riderPickup, projection.pickup.point),
    getRouteWithFallback(projection.destination.point, riderDestination),
  ]);

  return calculateMatchScore({
    ...params,
    pickupDistanceOverride: pickupRoad.distance,
    destinationDistanceOverride: destinationRoad.distance,
  });
}
