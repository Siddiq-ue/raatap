/**
 * Recompute match_suggestions.overlapping_distance_meters for existing,
 * not-yet-finalized rows using the fixed calculate_overlapping_distance()
 * DB function (real route_geometry projection, migrations 20-22).
 *
 * Done row-by-row via RPC rather than a single in-migration UPDATE because
 * each row's calculate_overlapping_distance() call makes a live OSRM HTTP
 * request - fine one at a time from a script, too slow/unreliable to run
 * as one big statement inside the CLI's migration push.
 *
 * Only touches rows still pending (not yet accepted/confirmed) - once a
 * rider has confirmed a match the cost is already agreed.
 *
 * Usage:
 *   npx tsx scripts/backfill-overlap-via-rpc.ts          # dry run
 *   npx tsx scripts/backfill-overlap-via-rpc.ts --apply   # writes updates
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const env: Record<string, string> = {};
fs.readFileSync(".env", "utf-8").split("\n").forEach((line) => {
  const idx = line.indexOf("=");
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes("--apply");
const PENDING_STATUSES = ["pending", "shown", "pending_host_approval", "pending_rider_approval"];

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
      .select("pickup_lat, pickup_lng, destination_lat, destination_lng")
      .eq("id", suggestion.ride_request_id)
      .single();

    if (!template?.from_lat || !template?.to_lat || !request?.pickup_lat || !request?.destination_lat) {
      console.warn(`[Backfill] Skipping ${suggestion.id} - missing coordinates`);
      skipped++;
      continue;
    }

    const { data: newValue, error: rpcError } = await supabase.rpc("calculate_overlapping_distance", {
      p_host_from_lat: template.from_lat,
      p_host_from_lng: template.from_lng,
      p_host_to_lat: template.to_lat,
      p_host_to_lng: template.to_lng,
      p_rider_pickup_lat: request.pickup_lat,
      p_rider_pickup_lng: request.pickup_lng,
      p_rider_dest_lat: request.destination_lat,
      p_rider_dest_lng: request.destination_lng,
      p_host_route_geometry: template.route_geometry,
    });

    if (rpcError) {
      console.error(`[Backfill] RPC failed for ${suggestion.id}:`, rpcError.message);
      skipped++;
      continue;
    }

    const oldValue = suggestion.overlapping_distance_meters;

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
