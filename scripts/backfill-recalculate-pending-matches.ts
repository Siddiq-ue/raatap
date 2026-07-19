/**
 * Recalculate match_suggestions rows using calculateMatchScoreWithRoadDistance()
 * - real OSRM driving distance from rider to the meeting point on the host's
 * route, instead of distance-to-host's-fixed-address or straight-line
 * distance-to-route - and no longer relying on the retired OSRM host-detour
 * formula.
 *
 * Two groups of statuses are handled differently:
 *
 *  - PENDING_STATUSES (pending_host_approval, pending_rider_approval, and
 *    the legacy pending/shown): still awaiting a decision. Rows that are
 *    still genuinely compatible get their score/distance columns updated
 *    in place. Rows that no longer qualify get status set to 'expired'
 *    instead of being deleted, so nothing silently vanishes out from under
 *    a host who already saw it.
 *
 *  - RECORD_ONLY_STATUSES (skipped, expired): the decision is already made
 *    and nothing is live/visible to a user anymore, so only the numeric
 *    score/distance columns are corrected for accurate history - status is
 *    never touched here, whatever the recalculated compatibility says.
 *
 * accepted/confirmed/rejected rows are excluded from the query entirely and
 * never fetched or written to - those reflect a real, already-agreed
 * decision (and, for accepted/confirmed, an agreed cost) that shouldn't
 * change retroactively without a separate explicit call.
 *
 * Usage:
 *   npx tsx scripts/backfill-recalculate-pending-matches.ts          # dry run
 *   npx tsx scripts/backfill-recalculate-pending-matches.ts --apply  # writes updates
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
const PENDING_STATUSES = ["pending", "shown", "pending_host_approval", "pending_rider_approval"];
const RECORD_ONLY_STATUSES = ["skipped", "expired"];

async function main() {
  console.log(`[Backfill] Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (no writes)"}`);

  const { data: suggestions, error } = await supabase
    .from("match_suggestions")
    .select("id, status, ride_template_id, ride_request_id, route_match_score, pickup_distance_meters, overlapping_distance_meters")
    .in("status", [...PENDING_STATUSES, ...RECORD_ONLY_STATUSES]);

  if (error) {
    console.error("[Backfill] Failed to fetch match_suggestions:", error);
    process.exit(1);
  }

  console.log(`[Backfill] Found ${suggestions?.length ?? 0} pending match_suggestions to check.`);

  let stillCompatibleChanged = 0;
  let stillCompatibleUnchanged = 0;
  let nowIncompatible = 0;
  let skipped = 0;

  for (const suggestion of suggestions ?? []) {
    const { data: template } = await supabase
      .from("ride_templates")
      .select("from_lat, from_lng, to_lat, to_lng, route_geometry, max_detour_meters, host_id")
      .eq("id", suggestion.ride_template_id)
      .single();

    const { data: request } = await supabase
      .from("ride_requests")
      .select("pickup_lat, pickup_lng, destination_lat, destination_lng, route_distance_meters, gender_preference, rider_id")
      .eq("id", suggestion.ride_request_id)
      .single();

    if (!template?.from_lat || !template?.to_lat || !request?.pickup_lat || !request?.destination_lat) {
      console.warn(`[Backfill] Skipping ${suggestion.id} - missing coordinates`);
      skipped++;
      continue;
    }

    const { data: hostProfile } = await supabase
      .from("profiles")
      .select("comfortable_with, institution")
      .eq("id", template.host_id)
      .single();

    const { data: riderProfile } = await supabase
      .from("profiles")
      .select("institution")
      .eq("id", request.rider_id)
      .single();

    const score = await calculateMatchScoreWithRoadDistance({
      hostFrom: { lat: template.from_lat, lng: template.from_lng },
      hostTo: { lat: template.to_lat, lng: template.to_lng },
      riderPickup: { lat: request.pickup_lat, lng: request.pickup_lng },
      riderDestination: { lat: request.destination_lat, lng: request.destination_lng },
      riderTotalJourneyMeters: request.route_distance_meters || 0,
      hostGenderPreference: hostProfile?.comfortable_with || "both",
      riderGenderPreference: request.gender_preference || "both",
      hostCollege: hostProfile?.institution,
      riderCollege: riderProfile?.institution,
      maxDetourMeters: template.max_detour_meters ?? 2000,
      maxDestinationMeters: 1000,
      hostRouteGeometry: template.route_geometry,
    });

    const isRecordOnly = RECORD_ONLY_STATUSES.includes(suggestion.status);

    if (!score.compatible && !isRecordOnly) {
      // Still-pending row that no longer qualifies: retire it instead of
      // leaving a false suggestion in front of a host/rider.
      nowIncompatible++;
      console.log(
        `[Backfill] ${suggestion.id} (${suggestion.status}): NO LONGER COMPATIBLE (${score.reason}) - ` +
        `was ${suggestion.route_match_score}% / ${suggestion.overlapping_distance_meters}m overlap -> will mark 'expired'`
      );
      if (APPLY) {
        const { error: updateError } = await supabase
          .from("match_suggestions")
          .update({ status: "expired" })
          .eq("id", suggestion.id);
        if (updateError) console.error(`[Backfill] Failed to expire ${suggestion.id}:`, updateError);
      }
      continue;
    }

    // Either still compatible (pending or record-only), or record-only and
    // no longer compatible - either way, status is left as-is here and only
    // the numeric columns are corrected.
    const changed =
      Math.round(suggestion.route_match_score) !== Math.round(score.match_score) ||
      suggestion.pickup_distance_meters !== score.pickup_distance_meters ||
      suggestion.overlapping_distance_meters !== score.overlapping_distance_meters;

    if (!changed) {
      stillCompatibleUnchanged++;
      continue;
    }

    stillCompatibleChanged++;
    console.log(
      `[Backfill] ${suggestion.id} (${suggestion.status}): ${suggestion.route_match_score}% / ${suggestion.pickup_distance_meters}m pickup / ` +
      `${suggestion.overlapping_distance_meters}m overlap  ->  ${score.match_score}% / ${score.pickup_distance_meters}m pickup / ` +
      `${score.overlapping_distance_meters}m overlap${!score.compatible ? " (incompatible, record only)" : ""}`
    );

    if (APPLY) {
      const { error: updateError } = await supabase
        .from("match_suggestions")
        .update({
          route_match_score: score.match_score,
          overall_score: score.match_score,
          detour_distance_meters: score.pickup_distance_meters,
          pickup_distance_meters: score.pickup_distance_meters,
          overlapping_distance_meters: score.overlapping_distance_meters,
        })
        .eq("id", suggestion.id);
      if (updateError) console.error(`[Backfill] Failed to update ${suggestion.id}:`, updateError);
    }
  }

  console.log(
    `\n[Backfill] Done. still-compatible-changed=${stillCompatibleChanged} ` +
    `still-compatible-unchanged=${stillCompatibleUnchanged} now-incompatible=${nowIncompatible} skipped=${skipped}`
  );
  if (!APPLY && (stillCompatibleChanged > 0 || nowIncompatible > 0)) {
    console.log("[Backfill] This was a dry run - re-run with --apply to write these changes.");
  }
}

main();
