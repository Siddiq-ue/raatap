/**
 * Recompute match_suggestions.overlapping_distance_meters for existing,
 * not-yet-finalized rows using the current (fixed) calculateMatchScore
 * logic in src/lib/matching.ts.
 *
 * Needed because overlapping_distance_meters is only ever set once, at
 * INSERT time, by the app - nothing in the database recalculates it
 * afterward. Rows created before the coordinate-bug fix (otp/verify,
 * admin/verify-user) or before the route-geometry projection fix
 * (matching.ts) are stuck with their old wrong values until backfilled.
 *
 * Only touches rows still in a pending state (not yet accepted/confirmed) -
 * once a rider has confirmed a match the cost is already agreed, so we
 * don't retroactively change it.
 *
 * Usage:
 *   bun run scripts/backfill-overlapping-distance.ts          # dry run, reports what would change
 *   bun run scripts/backfill-overlapping-distance.ts --apply  # actually writes the updates
 */

import { createClient } from "@supabase/supabase-js";
import { calculateMatchScore } from "../src/lib/matching";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes("--apply");

const PENDING_STATUSES = ["pending", "shown", "pending_host_approval", "pending_rider_approval"];

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function main() {
  console.log(`[Backfill] Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (no writes)"}`);

  const { data: suggestions, error } = await supabase
    .from("match_suggestions")
    .select("id, overlapping_distance_meters, ride_template_id, ride_request_id, status")
    .in("status", PENDING_STATUSES);

  if (error) {
    console.error("[Backfill] Failed to fetch match_suggestions:", error);
    process.exit(1);
  }

  console.log(`[Backfill] Found ${suggestions?.length ?? 0} pending match_suggestions to check.`);

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const suggestion of suggestions ?? []) {
    const { data: template } = await supabase
      .from("ride_templates")
      .select("from_lat, from_lng, to_lat, to_lng, route_geometry")
      .eq("id", suggestion.ride_template_id)
      .single();

    const { data: request } = await supabase
      .from("ride_requests")
      .select("pickup_lat, pickup_lng, destination_lat, destination_lng, route_distance_meters")
      .eq("id", suggestion.ride_request_id)
      .single();

    if (!template?.from_lat || !template?.to_lat || !request?.pickup_lat || !request?.destination_lat) {
      console.warn(`[Backfill] Skipping ${suggestion.id} - missing coordinates`);
      skipped++;
      continue;
    }

    const riderPickup = { lat: request.pickup_lat, lng: request.pickup_lng };
    const riderDestination = { lat: request.destination_lat, lng: request.destination_lng };
    const riderTotalJourneyMeters = request.route_distance_meters || haversineMeters(riderPickup, riderDestination);

    // Bypass the gender/detour/destination gates - this match was already
    // accepted as compatible when it was created. We're only recomputing
    // the overlap number, not re-validating the match.
    const score = calculateMatchScore({
      hostFrom: { lat: template.from_lat, lng: template.from_lng },
      hostTo: { lat: template.to_lat, lng: template.to_lng },
      riderPickup,
      riderDestination,
      riderTotalJourneyMeters,
      hostGenderPreference: "both",
      riderGenderPreference: "both",
      maxDetourMeters: Number.MAX_SAFE_INTEGER,
      maxDestinationMeters: Number.MAX_SAFE_INTEGER,
      hostRouteGeometry: template.route_geometry,
    });

    const oldValue = suggestion.overlapping_distance_meters;
    const newValue = score.overlapping_distance_meters;

    if (oldValue === newValue) {
      unchanged++;
      continue;
    }

    changed++;
    console.log(`[Backfill] ${suggestion.id}: ${oldValue}m -> ${newValue}m`);

    if (APPLY) {
      const { error: updateError } = await supabase
        .from("match_suggestions")
        .update({ overlapping_distance_meters: newValue })
        .eq("id", suggestion.id);

      if (updateError) {
        console.error(`[Backfill] Failed to update ${suggestion.id}:`, updateError);
      }
    }
  }

  console.log(`\n[Backfill] Done. changed=${changed} unchanged=${unchanged} skipped=${skipped}`);
  if (!APPLY && changed > 0) {
    console.log("[Backfill] This was a dry run - re-run with --apply to write these changes.");
  }
}

main();
