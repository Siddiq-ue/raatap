-- =================================================================
-- Retire the OSRM host-detour matching formula entirely
-- =================================================================
-- calculate_route_match_score() (and everything that calls it) scores a
-- match by how much EXTRA driving the HOST would do to swing by the
-- rider's pickup point. That question doesn't apply to this app: the host
-- drives their route exactly as planned and never detours - the rider
-- gets themself to wherever the route already passes closest. So this
-- formula was answering a question that isn't part of the product, not
-- just computing it inconsistently (see migrations 25/27/28, and the
-- matching card that showed 27% match / 19km "100%" overlap on the same
-- trip - two numbers that can't both be true of one real route).
--
-- Migration 30 already dropped the two triggers that were the only thing
-- invoking this call chain automatically (on_ride_request_created_auto_match,
-- on_ride_template_created_auto_match). This migration removes the dead
-- chain itself so it can't be manually invoked or re-wired back in later
-- by accident:
--
--   trigger_auto_match_request/_template()          - trigger bodies, now orphaned
--   generate_match_suggestions_for_ride_request/_template() - the loops they ran
--   regenerate_matches_for_request/_template()       - manual wrappers around the above
--   generate_all_matches()                           - bulk wrapper around the above
--   calculate_route_match_score(uuid, uuid)          - the OSRM-detour scoring itself
--   calculate_overlapping_distance(8 FLOAT args)      - its straight-chord-only,
--                                                       non-geometry-aware overlap helper
--
-- NOT touched: calculate_overlapping_distance(..., p_host_route_geometry
-- GEOGRAPHY, p_pickup_threshold_meters, p_dest_threshold_meters) - the real,
-- geometry-aware 11-arg version from migration 27. This one is still live
-- and actively called by src/app/api/matches/suggestions/route.ts to
-- recompute overlap for display, independent of calculate_route_match_score.
-- find_intersecting_templates()/find_intersecting_requests() (the candidate
-- search RPCs the JS API routes use) are also untouched.
--
-- Confirmed via full-repo grep: no application code calls any of the
-- functions being dropped here.
-- =================================================================

DROP TRIGGER IF EXISTS on_ride_request_created_auto_match ON ride_requests;
DROP TRIGGER IF EXISTS on_ride_template_created_auto_match ON ride_templates;

DROP FUNCTION IF EXISTS trigger_auto_match_request();
DROP FUNCTION IF EXISTS trigger_auto_match_template();

DROP FUNCTION IF EXISTS regenerate_matches_for_request(UUID);
DROP FUNCTION IF EXISTS regenerate_matches_for_template(UUID);
DROP FUNCTION IF EXISTS generate_all_matches();

DROP FUNCTION IF EXISTS generate_match_suggestions_for_ride_request(UUID);
DROP FUNCTION IF EXISTS generate_match_suggestions_for_ride_template(UUID);

DROP FUNCTION IF EXISTS calculate_route_match_score(UUID, UUID);

DROP FUNCTION IF EXISTS calculate_overlapping_distance(
    FLOAT, FLOAT, FLOAT, FLOAT, FLOAT, FLOAT, FLOAT, FLOAT
);
