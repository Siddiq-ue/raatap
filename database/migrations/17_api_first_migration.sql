-- =================================================================
-- 17_API_FIRST_MIGRATION
-- =================================================================
-- This migration shifts the matching architecture from DB-heavy functions
-- to lightweight spatial queries, ready for Next.js API execution.
-- =================================================================

-- 1. Add Route Geometry column to ride_templates
ALTER TABLE ride_templates 
ADD COLUMN IF NOT EXISTS route_geometry GEOGRAPHY(LineString, 4326);

-- 2. Update match_suggestions status enum to support new Host-First flow
ALTER TABLE match_suggestions
DROP CONSTRAINT IF EXISTS match_suggestions_status_check;

ALTER TABLE match_suggestions
ADD CONSTRAINT match_suggestions_status_check
CHECK (status = ANY (ARRAY[
    'pending_host_approval'::text, 
    'pending_rider_approval'::text, 
    'accepted'::text, 
    'rejected'::text,
    'skipped'::text, 
    'expired'::text, 
    'confirmed'::text,
    'pending'::text, -- legacy
    'shown'::text -- legacy
]));

-- 3. Drop existing Triggers that auto-run heavy DB logic
DROP TRIGGER IF EXISTS on_ride_template_created_auto_match ON ride_templates;
DROP TRIGGER IF EXISTS on_ride_request_created_auto_match ON ride_requests;
DROP TRIGGER IF EXISTS on_profile_update_create_ride ON profiles;

-- 4. Drop all deprecated data manipulation and matching functions
DROP FUNCTION IF EXISTS auto_match_ride_template CASCADE;
DROP FUNCTION IF EXISTS auto_match_ride_request CASCADE;
DROP FUNCTION IF EXISTS auto_create_ride_from_profile CASCADE;

DROP FUNCTION IF EXISTS create_ride_template_from_profile CASCADE;
DROP FUNCTION IF EXISTS create_ride_request_from_profile CASCADE;

DROP FUNCTION IF EXISTS generate_match_suggestions_for_ride_template CASCADE;
DROP FUNCTION IF EXISTS generate_match_suggestions_for_ride_request CASCADE;

DROP FUNCTION IF EXISTS calculate_route_match_score CASCADE;
DROP FUNCTION IF EXISTS regenerate_matches_for_template CASCADE;
DROP FUNCTION IF EXISTS regenerate_matches_for_request CASCADE;
DROP FUNCTION IF EXISTS generate_all_matches CASCADE;

-- 5. Create fast, read-only Spatial Queries for the API to use

-- Drop old functions if they exist (to avoid overloading conflicts)
DROP FUNCTION IF EXISTS find_intersecting_requests(GEOGRAPHY, INTEGER);
DROP FUNCTION IF EXISTS find_intersecting_templates(GEOGRAPHY, GEOGRAPHY);
DROP FUNCTION IF EXISTS find_intersecting_requests(TEXT, INTEGER);
DROP FUNCTION IF EXISTS find_intersecting_templates(TEXT, TEXT);

-- Find intersecting requests (For when a Host creates a Template)
CREATE OR REPLACE FUNCTION find_intersecting_requests(
    p_route_geometry TEXT,
    p_max_detour_meters INTEGER DEFAULT 2000
)
RETURNS TABLE (
    request_id UUID,
    rider_id UUID,
    pickup_point GEOGRAPHY,
    destination_point GEOGRAPHY,
    pickup_distance_meters FLOAT,
    destination_distance_meters FLOAT,
    host_route_distance_meters FLOAT,
    rider_total_journey_meters FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_route_geometry GEOGRAPHY;
BEGIN
    v_route_geometry := ST_GeomFromText(p_route_geometry, 4326)::geography;
    
    RETURN QUERY
    SELECT 
        rr.id AS request_id,
        rr.rider_id,
        rr.pickup_point::geography,
        rr.destination_point::geography,
        ST_Distance(v_route_geometry, rr.pickup_point::geography) AS pickup_distance_meters,
        ST_Distance(v_route_geometry, rr.destination_point::geography) AS destination_distance_meters,
        ST_Length(v_route_geometry) AS host_route_distance_meters,
        ST_Distance(rr.pickup_point::geography, rr.destination_point::geography, true) AS rider_total_journey_meters
    FROM 
        ride_requests rr
    WHERE 
        rr.status = 'active'
        AND ST_DWithin(v_route_geometry, rr.pickup_point::geography, p_max_detour_meters)
        AND ST_DWithin(v_route_geometry, rr.destination_point::geography, 1000);
END;
$$;

-- Find intersecting templates (For when a Rider creates a Request)
CREATE OR REPLACE FUNCTION find_intersecting_templates(
    p_pickup_point TEXT,
    p_destination_point TEXT
)
RETURNS TABLE (
    template_id UUID,
    host_id UUID,
    route_geometry GEOGRAPHY,
    pickup_distance_meters FLOAT,
    destination_distance_meters FLOAT,
    host_route_distance_meters FLOAT,
    rider_total_journey_meters FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pickup_point GEOGRAPHY;
    v_destination_point GEOGRAPHY;
BEGIN
    v_pickup_point := ST_GeomFromText(p_pickup_point, 4326)::geography;
    v_destination_point := ST_GeomFromText(p_destination_point, 4326)::geography;
    
    RETURN QUERY
    SELECT 
        rt.id AS template_id,
        rt.host_id,
        rt.route_geometry,
        ST_Distance(rt.route_geometry, v_pickup_point) AS pickup_distance_meters,
        ST_Distance(rt.route_geometry, v_destination_point) AS destination_distance_meters,
        ST_Length(rt.route_geometry) AS host_route_distance_meters,
        ST_Distance(v_pickup_point, v_destination_point, true) AS rider_total_journey_meters
    FROM 
        ride_templates rt
    WHERE 
        rt.status = 'active'
        AND rt.route_geometry IS NOT NULL
        AND ST_DWithin(rt.route_geometry, v_pickup_point, rt.max_detour_meters)
        AND ST_DWithin(rt.route_geometry, v_destination_point, 1000);
END;
$$;
