-- =================================================================
-- OSRM-BASED MATCHING FUNCTION
-- =================================================================
-- New matching criteria:
-- 1. Pickup distance <= 2km (rider pickup to host pickup)
-- 2. Destination distance <= 1km (rider dropoff to host dropoff)
-- 3. Rider pickup must be "on the way" (not behind host)
-- 4. Calculate overlapping distance for cost splitting
-- 5. Gender preference only (no time/day matching)
-- =================================================================

CREATE OR REPLACE FUNCTION calculate_route_match_score(
    template_id UUID,
    request_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    template RECORD;
    ride_request RECORD;
    pickup_distance NUMERIC;
    destination_distance NUMERIC;
    overlapping_distance NUMERIC;
    gender_compatible BOOLEAN;
    host_route_distance NUMERIC;
    overlap_ratio NUMERIC;
    match_score NUMERIC;
    rider_angle NUMERIC;
    host_bearing NUMERIC;
    angle_difference NUMERIC;
BEGIN
    -- Get ride template (host)
    SELECT * INTO template
    FROM ride_templates
    WHERE id = template_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN json_build_object(
            'compatible', false, 
            'reason', 'Template not found or inactive',
            'error_code', 'TEMPLATE_NOT_FOUND'
        );
    END IF;

    -- Get ride request (rider)
    SELECT * INTO ride_request
    FROM ride_requests
    WHERE id = request_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN json_build_object(
            'compatible', false, 
            'reason', 'Request not found or inactive',
            'error_code', 'REQUEST_NOT_FOUND'
        );
    END IF;

    -- ============================================================
    -- 1. GENDER COMPATIBILITY CHECK
    -- ============================================================
    gender_compatible := (
        -- Host accepts both genders
        template.gender_preference = 'both' OR
        -- Rider accepts both genders
        ride_request.gender_preference = 'both' OR
        -- Same gender match
        template.gender_preference = ride_request.gender_preference
    );

    IF NOT gender_compatible THEN
        RETURN json_build_object(
            'compatible', false, 
            'reason', 'Gender preference mismatch',
            'error_code', 'GENDER_MISMATCH'
        );
    END IF;

    -- ============================================================
    -- 2. PICKUP DISTANCE CHECK (≤ 2km)
    -- ============================================================
    pickup_distance := ST_Distance(
        template.from_point::geography,
        ride_request.pickup_point::geography,
        true
    );

    IF pickup_distance > 2000 THEN
        RETURN json_build_object(
            'compatible', false, 
            'reason', 'Pickup location too far (>' || ROUND(pickup_distance/1000, 2) || 'km)',
            'error_code', 'PICKUP_TOO_FAR',
            'pickup_distance_meters', ROUND(pickup_distance)
        );
    END IF;

    -- ============================================================
    -- 3. CHECK IF RIDER IS "ON THE WAY" (NOT BEHIND HOST)
    -- ============================================================
    -- Calculate bearing from host pickup to host destination
    host_bearing := ST_Azimuth(
        template.from_point::geography,
        template.to_point::geography
    ) * 180 / PI();

    -- Calculate bearing from host pickup to rider pickup
    rider_angle := ST_Azimuth(
        template.from_point::geography,
        ride_request.pickup_point::geography
    ) * 180 / PI();

    -- Calculate angle difference
    angle_difference := ABS(host_bearing - rider_angle);
    
    -- Normalize to 0-180 range
    IF angle_difference > 180 THEN
        angle_difference := 360 - angle_difference;
    END IF;

    -- If angle difference > 90 degrees, rider is behind host
    IF angle_difference > 90 THEN
        RETURN json_build_object(
            'compatible', false, 
            'reason', 'Rider pickup is behind host route (not on the way)',
            'error_code', 'RIDER_BEHIND_HOST',
            'angle_difference', ROUND(angle_difference)
        );
    END IF;

    -- ============================================================
    -- 4. DESTINATION DISTANCE CHECK (≤ 1km)
    -- ============================================================
    destination_distance := ST_Distance(
        template.to_point::geography,
        ride_request.drop_point::geography,
        true
    );

    IF destination_distance > 1000 THEN
        RETURN json_build_object(
            'compatible', false, 
            'reason', 'Destination too far (>' || ROUND(destination_distance/1000, 2) || 'km)',
            'error_code', 'DESTINATION_TOO_FAR',
            'destination_distance_meters', ROUND(destination_distance)
        );
    END IF;

    -- ============================================================
    -- 5. CALCULATE OVERLAPPING DISTANCE (for cost splitting)
    -- ============================================================
    host_route_distance := ST_Distance(
        template.from_point::geography,
        template.to_point::geography,
        true
    );

    -- Overlap ratio: how much of the route is shared
    overlap_ratio := 1.0 - (
        (pickup_distance + destination_distance) / 
        NULLIF(host_route_distance + pickup_distance + destination_distance, 0)
    );
    
    overlap_ratio := GREATEST(0, LEAST(1, overlap_ratio));
    overlapping_distance := host_route_distance * overlap_ratio;

    -- ============================================================
    -- 6. CALCULATE MATCH SCORE
    -- ============================================================
    match_score := (
        (1.0 - (pickup_distance / 2000.0)) * 0.50 +
        (1.0 - (destination_distance / 1000.0)) * 0.30 +
        overlap_ratio * 0.20
    ) * 100;

    match_score := GREATEST(0, LEAST(100, match_score));

    -- ============================================================
    -- 7. RETURN RESULT
    -- ============================================================
    RETURN json_build_object(
        'compatible', true,
        'match_score', ROUND(match_score, 2),
        'pickup_distance_meters', ROUND(pickup_distance),
        'pickup_distance_km', ROUND(pickup_distance / 1000.0, 2),
        'destination_distance_meters', ROUND(destination_distance),
        'destination_distance_km', ROUND(destination_distance / 1000.0, 2),
        'overlapping_distance_meters', ROUND(overlapping_distance),
        'overlapping_distance_km', ROUND(overlapping_distance / 1000.0, 2),
        'overlap_ratio', ROUND(overlap_ratio, 2),
        'host_route_distance_meters', ROUND(host_route_distance),
        'host_route_distance_km', ROUND(host_route_distance / 1000.0, 2),
        'angle_difference', ROUND(angle_difference),
        'reason', 'Compatible route found'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'compatible', false,
        'reason', 'Error calculating match: ' || SQLERRM,
        'error_code', 'CALCULATION_ERROR'
    );
END;
$$;

COMMENT ON FUNCTION calculate_route_match_score IS
'Calculates route compatibility between host template and rider request.
Criteria:
- Pickup distance <= 2km
- Destination distance <= 1km
- Gender preference compatible
Returns overlap distance for cost splitting.';

-- ================================================================
-- TESTING
-- ================================================================
/*
-- Test the function:
SELECT calculate_route_match_score(
    'your-template-id',
    'your-request-id'
);

-- Expected output for compatible match:
-- {
--   "compatible": true,
--   "match_score": 85.5,
--   "pickup_distance_km": 1.2,
--   "destination_distance_km": 0.5,
--   "overlapping_distance_km": 8.5,
--   "overlap_ratio": 0.85
-- }

-- Expected output for incompatible match:
-- {
--   "compatible": false,
--   "reason": "Pickup location too far (2.5km)",
--   "error_code": "PICKUP_TOO_FAR"
-- }
*/
