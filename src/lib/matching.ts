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
 * Find where the rider's actual road route shares actual road with the
 * host's actual road route, by comparing the two polylines segment by
 * segment - NOT by projecting rider points onto the host route as a whole
 * (that's what projectOntoPolyline/overlapFromProjection do, and why they
 * can pick a host-route point that's geometrically close but physically
 * unreachable - across a median, behind a gated complex, down a one-way
 * loop, etc).
 *
 * For every segment of the rider's route (in order, from pickup to
 * destination), this checks every segment of the host's route and asks "is
 * there a host segment close enough to this one that they're plausibly the
 * same stretch of road?" (segment midpoint-to-midpoint distance <=
 * toleranceMeters). The first rider segment with a match is the meeting
 * point; the last one is the exit point. The overlap distance is the sum of
 * the lengths of every rider segment that matched - the actual length of
 * shared road, not just the span between two projected points.
 *
 * Deliberately O(riderSegments * hostSegments) with a console log for every
 * segment comparison - this is a correctness-first rewrite, not tuned for
 * performance. Returns null if no rider segment ever matches a host
 * segment - genuinely no shared road, however close the endpoints alone
 * might look.
 */
function findRouteOverlap(
  hostRouteCoords: [number, number][],
  riderRouteCoords: [number, number][],
  toleranceMeters: number
): {
  overlapMeters: number;
  entryPoint: GeoPoint;
  exitPoint: GeoPoint;
  pickupToEntryMeters: number;
  exitToDestinationMeters: number;
} | null {
  const hostSegments: { index: number; start: GeoPoint; end: GeoPoint; midpoint: GeoPoint }[] = [];
  for (let j = 0; j < hostRouteCoords.length - 1; j++) {
    const start: GeoPoint = { lng: hostRouteCoords[j][0], lat: hostRouteCoords[j][1] };
    const end: GeoPoint = { lng: hostRouteCoords[j + 1][0], lat: hostRouteCoords[j + 1][1] };
    hostSegments.push({
      index: j,
      start,
      end,
      midpoint: { lat: (start.lat + end.lat) / 2, lng: (start.lng + end.lng) / 2 },
    });
  }

  console.log(
    `[findRouteOverlap] Comparing rider route (${riderRouteCoords.length - 1} segments) against ` +
    `host route (${hostSegments.length} segments), tolerance=${toleranceMeters}m`
  );

  let riderCumulative = 0; // distance from rider's pickup to the START of the current segment
  let cumulativeAtExit = 0; // distance from rider's pickup to the END of the last matched segment
  let matchedLength = 0;
  let entryPoint: GeoPoint | null = null;
  let exitPoint: GeoPoint | null = null;
  let pickupToEntryMeters = 0;

  for (let i = 0; i < riderRouteCoords.length - 1; i++) {
    const riderStart: GeoPoint = { lng: riderRouteCoords[i][0], lat: riderRouteCoords[i][1] };
    const riderEnd: GeoPoint = { lng: riderRouteCoords[i + 1][0], lat: riderRouteCoords[i + 1][1] };
    const riderMidpoint: GeoPoint = { lat: (riderStart.lat + riderEnd.lat) / 2, lng: (riderStart.lng + riderEnd.lng) / 2 };
    const segmentLength = getHaversineDistance(riderStart, riderEnd);

    // Compare this rider segment against every host segment; keep the
    // closest one. Segment-to-segment closeness is approximated by
    // midpoint-to-midpoint distance - simple, symmetric, and accurate
    // enough at the vertex density OSRM routes come at.
    let closestHostIndex = -1;
    let closestDistance = Infinity;
    for (const hostSegment of hostSegments) {
      const d = getHaversineDistance(riderMidpoint, hostSegment.midpoint);
      if (d < closestDistance) {
        closestDistance = d;
        closestHostIndex = hostSegment.index;
      }
    }

    const isMatch = closestDistance <= toleranceMeters;

    if (isMatch) {
      console.log(
        `[findRouteOverlap] rider segment ${i} MATCHED host segment ${closestHostIndex} ` +
        `(midpoint distance ${closestDistance.toFixed(1)}m <= ${toleranceMeters}m tolerance) - counts as shared road`
      );

      if (!entryPoint) {
        entryPoint = riderStart;
        pickupToEntryMeters = riderCumulative;
        console.log(
          `[findRouteOverlap] MEETING POINT: rider segment ${i} start ` +
          `(${riderStart.lat.toFixed(6)}, ${riderStart.lng.toFixed(6)}), ` +
          `${pickupToEntryMeters.toFixed(1)}m from rider's pickup`
        );
      }

      exitPoint = riderEnd;
      cumulativeAtExit = riderCumulative + segmentLength;
      matchedLength += segmentLength;
    } else {
      console.log(
        `[findRouteOverlap] rider segment ${i} did NOT match - nearest host segment is ${closestHostIndex} ` +
        `at ${closestDistance.toFixed(1)}m, which is beyond the ${toleranceMeters}m tolerance - not the same road`
      );
    }

    riderCumulative += segmentLength;
  }

  const riderTotalLength = riderCumulative;

  if (!entryPoint || !exitPoint) {
    console.log(
      `[findRouteOverlap] No shared road found - none of the rider's ${riderRouteCoords.length - 1} segments ` +
      `ever came within ${toleranceMeters}m of the host's route`
    );
    return null;
  }

  const exitToDestinationMeters = Math.max(0, riderTotalLength - cumulativeAtExit);

  console.log(
    `[findRouteOverlap] EXIT POINT: (${exitPoint.lat.toFixed(6)}, ${exitPoint.lng.toFixed(6)}), ` +
    `${exitToDestinationMeters.toFixed(1)}m from rider's destination`
  );
  console.log(`[findRouteOverlap] OVERLAP (total shared road length): ${matchedLength.toFixed(1)}m`);

  return {
    overlapMeters: matchedLength,
    entryPoint,
    exitPoint,
    pickupToEntryMeters,
    exitToDestinationMeters,
  };
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
  routeOverlapToleranceMeters = 50,
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
  routeOverlapToleranceMeters?: number;
}): MatchScoreResult {
  // The host drives their route exactly as planned and never detours - the
  // rider gets themself to wherever the route already passes closest.
  const hostRouteCoords = extractLineCoords(hostRouteGeometry) ??
    ([[hostFrom.lng, hostFrom.lat], [hostTo.lng, hostTo.lat]] as [number, number][]);
  const riderRouteCoords = extractLineCoords(riderRouteGeometry);

  // When the rider's own real route is available, walk it against the
  // host's route (findRouteOverlap) instead of projecting just the two
  // endpoints - this is what catches a rider whose straight-line-nearest
  // point on the host's route is geometrically close but physically
  // unreachable. routeOverlap's pickup/destination figures are the rider's
  // real driving distance along their own route to/from where it meets the
  // host's, so they're used ahead of any override; overlappingDistance is
  // computed from the same walk further down. If routeOverlap comes back
  // null (rider route was given but never actually gets close to the
  // host's), overlap is genuinely zero regardless of how close the
  // endpoints look in isolation.
  const routeOverlap = riderRouteCoords
    ? findRouteOverlap(hostRouteCoords, riderRouteCoords, routeOverlapToleranceMeters)
    : null;

  const projection = projectRiderOntoHostRoute(hostFrom, hostTo, riderPickup, riderDestination, hostRouteGeometry);
  const pickupDistance = routeOverlap
    ? (pickupDistanceOverride ?? routeOverlap.pickupToEntryMeters)
    : (pickupDistanceOverride ?? projection.pickup.distanceToRoute);
  const destinationDistance = routeOverlap
    ? (destinationDistanceOverride ?? routeOverlap.exitToDestinationMeters)
    : (destinationDistanceOverride ?? projection.destination.distanceToRoute);
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
  // Route-matched pairs (routeOverlap present): pickupDistance is the
  // rider's own real driving distance along their own route to reach the
  // shared road - not a detour, just the start of their normal journey. A
  // fixed maxDetourMeters cutoff on that figure wrongly rejects a rider
  // whose road happens to run a while before merging with the host's, even
  // when the shared stretch afterward is substantial. So for route-matched
  // pairs, judge it by payoff instead: reject only when the lead-in outweighs
  // the shared road it leads to (rider travels a long way for very little
  // actual overlap), not against an absolute distance. Pairs without real
  // rider route geometry (no routeOverlap) fall back to the original
  // absolute maxDetourMeters gate, since there's no overlap figure yet to
  // weigh it against.
  const pickupWorthIt = routeOverlap
    ? routeOverlap.pickupToEntryMeters <= routeOverlap.overlapMeters
    : pickupDistance <= maxDetourMeters;

  if (!pickupWorthIt) {
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
      reason: routeOverlap
        ? `Too much travel (${(pickupDistance/1000).toFixed(2)}km) for the shared route length (${(routeOverlap.overlapMeters/1000).toFixed(2)}km)`
        : `Pickup location too far (>${(pickupDistance/1000).toFixed(2)}km)`
    };
  }

  // 3. Destination Distance Check - same reasoning, symmetric on the exit side.
  const destinationWorthIt = routeOverlap
    ? routeOverlap.exitToDestinationMeters <= routeOverlap.overlapMeters
    : destinationDistance <= maxDestinationMeters;

  if (!destinationWorthIt) {
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
      reason: routeOverlap
        ? `Too much travel (${(destinationDistance/1000).toFixed(2)}km) for the shared route length (${(routeOverlap.overlapMeters/1000).toFixed(2)}km)`
        : `Destination too far (>${(destinationDistance/1000).toFixed(2)}km)`
    };
  }

  // 4. Calculate Overlapping Distance
  // When the rider's real route was walked against the host's (routeOverlap),
  // that's authoritative - it already accounts for road connectivity, not
  // just as-the-crow-flies distance. riderRouteCoords present but
  // routeOverlap null means the rider's real path never actually comes
  // close to the host's route anywhere, so overlap is a hard zero rather
  // than falling back to the endpoint-projection estimate. Only when no
  // rider route geometry was supplied at all do we fall back to that
  // estimate, capped by the rider's own journey distance so they're never
  // charged for more than they travel.
  const riderSegmentLength = getHaversineDistance(riderPickup, riderDestination);
  let overlappingDistance = riderRouteCoords
    ? (routeOverlap?.overlapMeters ?? 0)
    : overlapFromProjection(projection, riderSegmentLength, maxDetourMeters, maxDestinationMeters);

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

  let matchScore: number;
  if (routeOverlap) {
    // Route-matched: fixed-distance normalizers (pickupDistance/2000,
    // destinationDistance/1000) don't mean anything once a multi-km lead-in
    // can be perfectly legitimate, as the gate above already established -
    // they'd tank the score to 0 for exactly the pairs the new gate just
    // accepted as good matches. Score by overlap quality instead:
    // overlapRatio (how much of the rider's whole trip is spent on the
    // shared road - the main signal, weighted heaviest) plus how efficient
    // the lead-in/tail-out travel is relative to the shared road itself
    // (the same ratio the gate checks, expressed as 0-1 "efficiency" -
    // small lead-in per km of shared road scores higher).
    const pickupEfficiency = 1 - Math.min(1, pickupDistance / overlappingDistance);
    const destinationEfficiency = 1 - Math.min(1, destinationDistance / overlappingDistance);
    matchScore = (
      overlapRatio * 0.60 +
      pickupEfficiency * 0.20 +
      destinationEfficiency * 0.20
    ) * 100;
  } else {
    matchScore = (
      (1.0 - (pickupDistance / 2000.0)) * 0.50 +
      (1.0 - (destinationDistance / 1000.0)) * 0.30 +
      overlapRatio * 0.20
    ) * 100;
  }

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
 * what the rider actually has to travel.
 *
 * If `params.riderRouteGeometry` (the rider's own real OSRM route) is
 * supplied, calculateMatchScore already derives real road-distance
 * pickup/destination figures directly from it via findRouteOverlap - the
 * distance along the rider's own path to/from wherever it actually meets
 * the host's route - so no OSRM call is needed here at all, and this is
 * strictly more accurate than pinging OSRM for the distance to a single
 * straight-line-guessed meeting point. That guess-and-check via OSRM is
 * kept only as a fallback for callers that don't have the rider's route
 * geometry on hand.
 */
export async function calculateMatchScoreWithRoadDistance(
  params: Parameters<typeof calculateMatchScore>[0]
): Promise<MatchScoreResult> {
  const { hostFrom, hostTo, riderPickup, riderDestination, hostRouteGeometry, riderRouteGeometry } = params;

  if (extractLineCoords(riderRouteGeometry)) {
    return calculateMatchScore(params);
  }

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
