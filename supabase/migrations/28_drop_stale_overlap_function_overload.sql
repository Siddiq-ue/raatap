-- Migration 27 added two new parameters (p_pickup_threshold_meters,
-- p_dest_threshold_meters) to calculate_overlapping_distance. Since the
-- parameter list changed, Postgres created a second overload instead of
-- replacing the old 9-arg version - both defs now coexist, and any RPC
-- call passing only the original 9 arguments becomes ambiguous between
-- them ("Could not choose the best candidate function"). Drop the old
-- signature so only the migration-27 version remains.
DROP FUNCTION IF EXISTS calculate_overlapping_distance(
    FLOAT, FLOAT, FLOAT, FLOAT, FLOAT, FLOAT, FLOAT, FLOAT, GEOGRAPHY
);
