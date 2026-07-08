-- =================================================================
-- ADD: host route total distance as a PostgREST computed column
-- =================================================================
-- ride_requests already stores route_distance_meters (the rider's total
-- pickup->dropoff distance, from OSRM) but ride_templates has no
-- equivalent for the host's full from->to route - it's only ever
-- computed transiently inside calculate_route_match_score() and never
-- persisted. The admin match-suggestions panel wants to show both
-- totals side by side, so expose the host's route length as a
-- PostgREST computed column (a function taking the table row) instead
-- of adding + backfilling + keeping in sync a real stored column.
--
-- Prefers the real route_geometry length (road-following); falls back
-- to the straight chord between from/to when a template has no stored
-- geometry.
-- =================================================================

CREATE OR REPLACE FUNCTION ride_templates_route_distance_meters(rt ride_templates)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    ST_Length(rt.route_geometry),
    ST_Distance(
      ST_SetSRID(ST_MakePoint(rt.from_lng, rt.from_lat), 4326)::geography,
      ST_SetSRID(ST_MakePoint(rt.to_lng, rt.to_lat), 4326)::geography,
      true
    )
  );
$$;

COMMENT ON FUNCTION ride_templates_route_distance_meters IS
'PostgREST computed column: host''s total route distance in meters (real route_geometry length, or straight-line fallback).';
