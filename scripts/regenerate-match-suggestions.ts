/**
 * Re-run match discovery for every active rider against every active host
 * template, using calculateMatchScoreWithRoadDistance() (real OSRM
 * road-connectivity-aware overlap when the rider's route geometry is
 * available, each host's own configured tolerance, single consistent
 * geometry projection).
 *
 * This is not a recalculation of existing rows (see
 * backfill-recalculate-pending-matches.ts for that) - it's the same
 * candidate search + scoring that runs when a rider creates a new request
 * (src/app/api/rides/requests/create/route.ts), just re-run for every
 * existing active rider so pairs that were missed under the old, buggier
 * logic (e.g. a host with a larger configured max_detour_meters whose
 * valid riders got wrongly rejected by the old hardcoded 2000m gate) get
 * a chance to surface as new suggestions now.
 *
 * Skips any (template, request) pair that already has a match_suggestions
 * row in ANY status - this only fills in gaps, never creates a duplicate
 * for a pair that's already been seen and decided on (or already exists
 * as pending/expired/skipped from the earlier backfill).
 *
 * Usage:
 *   npx tsx scripts/regenerate-match-suggestions.ts          # dry run
 *   npx tsx scripts/regenerate-match-suggestions.ts --apply  # writes new rows
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import { calculateMatchScoreWithRoadDistance } from "../src/lib/matching";

const env: Record<string, string> = {};
fs.readFileSync(".env", "utf-8").split("\n").forEach((line) => {
  const idx = line.indexOf("=");
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`[Regenerate] Mode: ${APPLY ? "APPLY (writing new rows)" : "DRY RUN (no writes)"}`);

  const { data: requests, error: requestsError } = await supabase
    .from("ride_requests")
    .select("id, rider_id, pickup_lat, pickup_lng, destination_lat, destination_lng, route_distance_meters, gender_preference, route_geometry")
    .eq("status", "active");

  if (requestsError) {
    console.error("[Regenerate] Failed to fetch ride_requests:", requestsError);
    process.exit(1);
  }

  console.log(`[Regenerate] ${requests?.length ?? 0} active ride requests to check.`);

  const { data: existingPairs } = await supabase
    .from("match_suggestions")
    .select("ride_template_id, ride_request_id");
  const existingPairKeys = new Set((existingPairs ?? []).map((p) => `${p.ride_template_id}:${p.ride_request_id}`));

  let created = 0;
  let alreadyExisted = 0;
  let notCompatible = 0;
  let skippedMissingData = 0;

  for (const request of requests ?? []) {
    const { data: riderProfile } = await supabase
      .from("profiles")
      .select("institution")
      .eq("id", request.rider_id)
      .single();

    const { data: matches, error: matchError } = await supabase.rpc("find_intersecting_templates", {
      p_pickup_point: `POINT(${request.pickup_lng} ${request.pickup_lat})`,
      p_destination_point: `POINT(${request.destination_lng} ${request.destination_lat})`,
    });

    if (matchError) {
      console.error(`[Regenerate] find_intersecting_templates failed for request ${request.id}:`, matchError.message);
      continue;
    }

    for (const match of matches ?? []) {
      if (match.host_id === request.rider_id) continue; // can't match yourself

      const pairKey = `${match.template_id}:${request.id}`;
      if (existingPairKeys.has(pairKey)) {
        alreadyExisted++;
        continue;
      }

      const { data: hostTemplate } = await supabase
        .from("ride_templates")
        .select("from_lat, from_lng, to_lat, to_lng, route_geometry, max_detour_meters, available_seats, seats_taken, status")
        .eq("id", match.template_id)
        .single();

      if (!hostTemplate || hostTemplate.status !== "active") {
        skippedMissingData++;
        continue;
      }
      if ((hostTemplate.available_seats - (hostTemplate.seats_taken || 0)) <= 0) {
        continue; // host full, not a data problem, just not a candidate right now
      }

      const { data: hostProfile } = await supabase
        .from("profiles")
        .select("comfortable_with, institution")
        .eq("id", match.host_id)
        .single();

      const score = await calculateMatchScoreWithRoadDistance({
        hostFrom: { lat: hostTemplate.from_lat, lng: hostTemplate.from_lng },
        hostTo: { lat: hostTemplate.to_lat, lng: hostTemplate.to_lng },
        riderPickup: { lat: request.pickup_lat, lng: request.pickup_lng },
        riderDestination: { lat: request.destination_lat, lng: request.destination_lng },
        riderTotalJourneyMeters: request.route_distance_meters || match.rider_total_journey_meters || 0,
        hostGenderPreference: hostProfile?.comfortable_with || "both",
        riderGenderPreference: request.gender_preference || "both",
        hostCollege: hostProfile?.institution,
        riderCollege: riderProfile?.institution,
        maxDetourMeters: hostTemplate.max_detour_meters ?? 2000,
        maxDestinationMeters: 1000,
        hostRouteGeometry: hostTemplate.route_geometry,
        riderRouteGeometry: request.route_geometry,
      });

      if (!score.compatible) {
        notCompatible++;
        continue;
      }

      created++;
      console.log(
        `[Regenerate] NEW: template=${match.template_id.slice(0,8)} request=${request.id.slice(0,8)} - ` +
        `${score.match_score}% match, pickup=${score.pickup_distance_meters}m, overlap=${score.overlapping_distance_meters}m`
      );

      if (APPLY) {
        const { error: insertError } = await supabase.from("match_suggestions").insert({
          ride_template_id: match.template_id,
          ride_request_id: request.id,
          route_match_score: score.match_score,
          overall_score: score.match_score,
          detour_distance_meters: score.pickup_distance_meters,
          pickup_distance_meters: score.pickup_distance_meters,
          overlapping_distance_meters: score.overlapping_distance_meters,
          status: "pending_host_approval",
        });
        if (insertError) console.error(`[Regenerate] Failed to insert new suggestion:`, insertError);
        else existingPairKeys.add(pairKey); // avoid re-creating if the same pair shows up again this run
      }
    }
  }

  console.log(
    `\n[Regenerate] Done. new-matches=${created} already-existed=${alreadyExisted} ` +
    `not-compatible=${notCompatible} skipped-missing-data=${skippedMissingData}`
  );
  if (!APPLY && created > 0) {
    console.log("[Regenerate] This was a dry run - re-run with --apply to write these new suggestions.");
  }
}

main();
