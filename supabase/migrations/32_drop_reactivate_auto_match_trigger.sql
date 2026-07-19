-- =================================================================
-- Drop the leftover "reactivate" auto-match triggers
-- =================================================================
-- Migrations 30/31 dropped the AFTER INSERT auto-match triggers on
-- ride_requests/ride_templates and the whole legacy OSRM-detour matching
-- function chain they called into (generate_match_suggestions_for_ride_request,
-- generate_match_suggestions_for_ride_template, calculate_route_match_score,
-- etc.) - reasoning: the host never detours, matching is decided
-- exclusively by the JS API path's geometry-aware overlap check now.
--
-- They missed a second pair of triggers: on_ride_request_reactivated_auto_match
-- / on_ride_template_reactivated_auto_match, AFTER UPDATE triggers (not
-- INSERT) that fire whenever a row's status transitions to 'active' from
-- something else - e.g. exactly what happens in
-- src/app/api/pods/leave/route.ts and src/app/api/pods/dismiss/route.ts
-- when a rider leaves/is removed from a pod. Their functions,
-- trigger_auto_match_request_on_reactivate() and
-- trigger_auto_match_template_on_reactivate(), call
-- generate_match_suggestions_for_ride_request()/_template() - which
-- migration 31 already dropped - so every such UPDATE has been failing
-- outright with "function ... does not exist" since 31 was applied.
--
-- Because pods/leave and pods/dismiss don't check the error on that
-- particular update call, the failure is silent: the pod_member gets
-- marked left/dismissed and seats_taken is decremented, but the rider's
-- ride_requests.status stays stuck at 'matched' forever, making them
-- invisible to all future matching (every match query filters on
-- status = 'active'). Confirmed on ride_request
-- abe88c4d-3c3b-4a86-a30a-f0f577ad8ce1 (rider Samanvitha Vemula, dismissed
-- from her pod on 2026-07-17, still stuck at status='matched').
--
-- Fix: drop both triggers and their functions too, same as 30/31 -
-- reactivating a row should just flip its status; matching happens through
-- the JS API path when new templates/requests are created, not
-- automatically here.
-- =================================================================

DROP TRIGGER IF EXISTS on_ride_request_reactivated_auto_match ON ride_requests;
DROP FUNCTION IF EXISTS trigger_auto_match_request_on_reactivate();

DROP TRIGGER IF EXISTS on_ride_template_reactivated_auto_match ON ride_templates;
DROP FUNCTION IF EXISTS trigger_auto_match_template_on_reactivate();
