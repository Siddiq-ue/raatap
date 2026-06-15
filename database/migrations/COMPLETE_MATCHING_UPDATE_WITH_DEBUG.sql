-- ================================================================
-- COMPLETE MATCHING ALGORITHM UPDATE (WITH DEBUGGING)
-- ================================================================
-- Run this ENTIRE file in Supabase SQL Editor
-- Includes detailed logging to debug why matches aren't being created
-- ================================================================

-- ================================================================
-- STEP 1: Add overlapping_distance column
-- ================================================================

ALTER TABLE match_suggestions
ADD COLUMN IF NOT EXISTS overlapping_distance_meters NUMERIC;

COMMENT ON COLUMN match_suggestions.overlapping_distance_meters IS 
'Distance (in meters) that host and rider travel together. Used for cost splitting.';

CREATE INDEX IF NOT EXISTS idx_match_suggestions_overlapping 
ON match_suggestions(overlapping_distance_meters DESC) 
WHERE overlapping_distance_meters IS NOT NULL;


-- ================================================================
-- STEP 2: Create debug log table for matching
-- ================================================================

CREATE TABLE IF NOT EXISTS match_debug_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID,
    request_id UUID,
    host_from_location TEXT,
    host_to_location TEXT,
    rider_pickup_location TEXT,
    rider_drop_location TEXT,
    gender_check TEXT,
    pickup_distance_meters NUMERIC,
    angle_difference NUMERIC,
    destination_distance_meters NUMERIC,
    match_result JSON,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE match_debug_log IS 'Debug log for matching algorithm - shows why matches pass/fail';


-- ================================================================
-- STEP 3: Update matching function WITH LOGGING
-- ================================================================

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
    v_result JSON;
BEGIN
    -- Get ride template (host)
    SELECT * INTO template
    FROM ride_templates
    WHERE id = template_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN json_build_object('compatible', false, 'reason', 'Template not found', 'error_code', 'TEMPLATE_NOT_FOUND');
    END IF;

    -- Get ride request (rider)
    SELECT * INTO ride_request
    FROM ride_requests
    WHERE id = request_id AND status = 'active';

    IF NOT FOUND THEN
        -- Log: Request not found
        INSERT INTO match_debug_log (template_id, request_id, match_result)
        VALUES (template_id, request_id, json_build_object('error', 'Request not found or not active'));
        
        RETURN json_build_object('compatible', false, 'reason', 'Request not found', 'error_code', 'REQUEST_NOT_FOUND');
    END IF;

    -- 1. GENDER COMPATIBILITY CHECK
    gender_compatible := (
        template.gender_preference = 'both' OR
        ride_request.gender_preference = 'both' OR
        template.gender_preference = ride_request.gender_preference
    );

    IF NOT gender_compatible THEN
        -- Log: Gender mismatch
        INSERT INTO match_debug_log (
            template_id, request_id, 
            host_from_location, host_to_location,
            rider_pickup_location, rider_drop_location,
            gender_check,
            match_result
        ) VALUES (
            template_id, request_id,
            template.from_location, template.to_location,
            ride_request.pickup_location, ride_request.destination_location,
            'FAILED: host=' || template.gender_preference || ', rider=' || ride_request.gender_preference,
            json_build_object('error', 'Gender mismatch', 'host_gender', template.gender_preference, 'rider_gender', ride_request.gender_preference)
        );
        
        RETURN json_build_object('compatible', false, 'reason', 'Gender mismatch', 'error_code', 'GENDER_MISMATCH');
    END IF;

    -- 2. PICKUP DISTANCE CHECK (≤ 2km)
    pickup_distance := ST_Distance(template.from_point::geography, ride_request.pickup_point::geography, true);

    IF pickup_distance > 2000 THEN
        -- Log: Pickup too far
        INSERT INTO match_debug_log (
            template_id, request_id,
            host_from_location, host_to_location,
            rider_pickup_location, rider_drop_location,
            gender_check,
            pickup_distance_meters,
            match_result
        ) VALUES (
            template_id, request_id,
            template.from_location, template.to_location,
            ride_request.pickup_location, ride_request.destination_location,
            'PASSED',
            ROUND(pickup_distance),
            json_build_object('error', 'Pickup too far', 'distance_km', ROUND(pickup_distance/1000.0, 2))
        );
        
        RETURN json_build_object('compatible', false, 'reason', 'Pickup too far (' || ROUND(pickup_distance/1000, 2) || 'km)', 'error_code', 'PICKUP_TOO_FAR', 'pickup_distance_meters', ROUND(pickup_distance));
    END IF;

    -- 3. CHECK IF RIDER IS "ON THE WAY" (NOT BEHIND HOST)
    host_bearing := ST_Azimuth(template.from_point::geography, template.to_point::geography) * 180 / PI();
    rider_angle := ST_Azimuth(template.from_point::geography, ride_request.pickup_point::geography) * 180 / PI();
    angle_difference := ABS(host_bearing - rider_angle);
    
    IF angle_difference > 180 THEN
        angle_difference := 360 - angle_difference;
    END IF;

    IF angle_difference > 90 THEN
        -- Log: Rider behind host
        INSERT INTO match_debug_log (
            template_id, request_id,
            host_from_location, host_to_location,
            rider_pickup_location, rider_drop_location,
            gender_check,
            pickup_distance_meters,
            angle_difference,
            match_result
        ) VALUES (
            template_id, request_id,
            template.from_location, template.to_location,
            ride_request.pickup_location, ride_request.destination_location,
            'PASSED',
            ROUND(pickup_distance),
            ROUND(angle_difference),
            json_build_object('error', 'Rider behind host', 'angle_degrees', ROUND(angle_difference))
        );
        
        RETURN json_build_object('compatible', false, 'reason', 'Rider is behind host (not on the way)', 'error_code', 'RIDER_BEHIND_HOST', 'angle_difference', ROUND(angle_difference));
    END IF;

    -- 4. DESTINATION DISTANCE CHECK (≤ 1km)
    destination_distance := ST_Distance(template.to_point::geography, ride_request.drop_point::geography, true);

    IF destination_distance > 1000 THEN
        -- Log: Destination too far
        INSERT INTO match_debug_log (
            template_id, request_id,
            host_from_location, host_to_location,
            rider_pickup_location, rider_drop_location,
            gender_check,
            pickup_distance_meters,
            angle_difference,
            destination_distance_meters,
            match_result
        ) VALUES (
            template_id, request_id,
            template.from_location, template.to_location,
            ride_request.pickup_location, ride_request.destination_location,
            'PASSED',
            ROUND(pickup_distance),
            ROUND(angle_difference),
            ROUND(destination_distance),
            json_build_object('error', 'Destination too far', 'distance_km', ROUND(destination_distance/1000.0, 2))
        );
        
        RETURN json_build_object('compatible', false, 'reason', 'Destination too far (' || ROUND(destination_distance/1000, 2) || 'km)', 'error_code', 'DESTINATION_TOO_FAR', 'destination_distance_meters', ROUND(destination_distance));
    END IF;

    -- 5. CALCULATE OVERLAPPING DISTANCE (for cost splitting)
    host_route_distance := ST_Distance(template.from_point::geography, template.to_point::geography, true);
    overlap_ratio := 1.0 - ((pickup_distance + destination_distance) / NULLIF(host_route_distance + pickup_distance + destination_distance, 0));
    overlap_ratio := GREATEST(0, LEAST(1, overlap_ratio));
    overlapping_distance := host_route_distance * overlap_ratio;

    -- 6. CALCULATE MATCH SCORE
    match_score := ((1.0 - (pickup_distance / 2000.0)) * 0.50 + (1.0 - (destination_distance / 1000.0)) * 0.30 + overlap_ratio * 0.20) * 100;
    match_score := GREATEST(0, LEAST(100, match_score));

    -- Log: SUCCESS
    INSERT INTO match_debug_log (
        template_id, request_id,
        host_from_location, host_to_location,
        rider_pickup_location, rider_drop_location,
        gender_check,
        pickup_distance_meters,
        angle_difference,
        destination_distance_meters,
        match_result
    ) VALUES (
        template_id, request_id,
        template.from_location, template.to_location,
        ride_request.pickup_location, ride_request.destination_location,
        'PASSED',
        ROUND(pickup_distance),
        ROUND(angle_difference),
        ROUND(destination_distance),
        json_build_object(
            'success', true,
            'match_score', ROUND(match_score, 2),
            'pickup_km', ROUND(pickup_distance / 1000.0, 2),
            'destination_km', ROUND(destination_distance / 1000.0, 2),
            'overlap_km', ROUND(overlapping_distance / 1000.0, 2)
        )
    );

    -- 7. RETURN RESULT
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
        'reason', 'Compatible route found'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('compatible', false, 'reason', 'Error: ' || SQLERRM, 'error_code', 'CALCULATION_ERROR');
END;
$$;


-- ================================================================
-- STEP 4: Update match generation functions WITH LOGGING
-- ================================================================

CREATE OR REPLACE FUNCTION generate_match_suggestions_for_ride_template(template_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    template RECORD;
    request RECORD;
    match_result JSON;
    suggestions_created INTEGER := 0;
    existing_match UUID;
    total_checked INTEGER := 0;
    gender_failures INTEGER := 0;
    distance_failures INTEGER := 0;
    angle_failures INTEGER := 0;
BEGIN
    SELECT * INTO template FROM ride_templates WHERE id = template_id;
    IF NOT FOUND THEN 
        RAISE NOTICE 'Template % not found', template_id;
        RETURN 0; 
    END IF;

    RAISE NOTICE 'Processing template: % (Host: %)', template_id, template.host_id;
    RAISE NOTICE 'Template route: % -> %', template.from_location, template.to_location;

    FOR request IN
        SELECT * FROM ride_requests
        WHERE status = 'active' AND rider_id != template.host_id
    LOOP
        total_checked := total_checked + 1;
        
        SELECT id INTO existing_match FROM match_suggestions
        WHERE ride_template_id = template_id AND ride_request_id = request.id
        AND status NOT IN ('rejected', 'skipped', 'expired');

        IF existing_match IS NULL THEN
            match_result := calculate_route_match_score(template_id, request.id);
            
            IF (match_result->>'compatible')::BOOLEAN = true THEN
                INSERT INTO match_suggestions (
                    ride_template_id, ride_request_id, route_match_score,
                    schedule_match_score, overall_score, detour_distance_meters,
                    pickup_distance_meters, overlapping_distance_meters, status
                ) VALUES (
                    template_id, request.id,
                    (match_result->>'match_score')::NUMERIC,
                    0,
                    (match_result->>'match_score')::NUMERIC,
                    (match_result->>'pickup_distance_meters')::INTEGER,
                    (match_result->>'pickup_distance_meters')::INTEGER,
                    (match_result->>'overlapping_distance_meters')::NUMERIC,
                    'pending_host_approval'
                );
                suggestions_created := suggestions_created + 1;
                RAISE NOTICE '  ✓ Match created with rider % (score: %)', request.rider_id, match_result->>'match_score';
            ELSE
                -- Count failure reasons
                IF (match_result->>'error_code') = 'GENDER_MISMATCH' THEN
                    gender_failures := gender_failures + 1;
                ELSIF (match_result->>'error_code') IN ('PICKUP_TOO_FAR', 'DESTINATION_TOO_FAR') THEN
                    distance_failures := distance_failures + 1;
                ELSIF (match_result->>'error_code') = 'RIDER_BEHIND_HOST' THEN
                    angle_failures := angle_failures + 1;
                END IF;
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE 'Results: Checked=%, Created=%, Gender failures=%, Distance failures=%, Angle failures=%', 
        total_checked, suggestions_created, gender_failures, distance_failures, angle_failures;

    RETURN suggestions_created;
END;
$$;

CREATE OR REPLACE FUNCTION generate_match_suggestions_for_ride_request(request_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    request RECORD;
    template RECORD;
    match_result JSON;
    suggestions_created INTEGER := 0;
    existing_match UUID;
    total_checked INTEGER := 0;
BEGIN
    SELECT * INTO request FROM ride_requests WHERE id = request_id;
    IF NOT FOUND THEN 
        RAISE NOTICE 'Request % not found', request_id;
        RETURN 0; 
    END IF;

    RAISE NOTICE 'Processing request: % (Rider: %)', request_id, request.rider_id;
    RAISE NOTICE 'Request route: % -> %', request.pickup_location, request.destination_location;

    FOR template IN
        SELECT * FROM ride_templates
        WHERE status = 'active' AND host_id != request.rider_id
    LOOP
        total_checked := total_checked + 1;
        
        SELECT id INTO existing_match FROM match_suggestions
        WHERE ride_template_id = template.id AND ride_request_id = request_id
        AND status NOT IN ('rejected', 'skipped', 'expired');

        IF existing_match IS NULL THEN
            match_result := calculate_route_match_score(template.id, request_id);
            
            IF (match_result->>'compatible')::BOOLEAN = true THEN
                INSERT INTO match_suggestions (
                    ride_template_id, ride_request_id, route_match_score,
                    schedule_match_score, overall_score, detour_distance_meters,
                    pickup_distance_meters, overlapping_distance_meters, status
                ) VALUES (
                    template.id, request_id,
                    (match_result->>'match_score')::NUMERIC,
                    0,
                    (match_result->>'match_score')::NUMERIC,
                    (match_result->>'pickup_distance_meters')::INTEGER,
                    (match_result->>'pickup_distance_meters')::INTEGER,
                    (match_result->>'overlapping_distance_meters')::NUMERIC,
                    'pending_host_approval'
                );
                suggestions_created := suggestions_created + 1;
                RAISE NOTICE '  ✓ Match created with host % (score: %)', template.host_id, match_result->>'match_score';
            ELSE
                RAISE NOTICE '  ✗ Rejected: %', match_result->>'reason';
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE 'Results: Checked=%, Created=%', total_checked, suggestions_created;

    RETURN suggestions_created;
END;
$$;


-- ================================================================
-- STEP 5: Debug queries - Run these to see what's happening
-- ================================================================

-- Check how many templates/requests exist
SELECT 
    (SELECT COUNT(*) FROM ride_templates WHERE status = 'active') as active_templates,
    (SELECT COUNT(*) FROM ride_requests WHERE status = 'active') as active_requests;

-- View template details
SELECT 
    id,
    host_id,
    from_location,
    to_location,
    gender_preference,
    status
FROM ride_templates 
WHERE status = 'active';

-- View request details
SELECT 
    id,
    rider_id,
    pickup_location,
    destination_location,
    gender_preference,
    vehicle_preference,
    status
FROM ride_requests 
WHERE status = 'active';


-- ================================================================
-- STEP 6: Clear old matches and regenerate
-- ================================================================

-- Delete old pending matches
DELETE FROM match_suggestions WHERE status IN ('pending', 'shown', 'pending_host_approval', 'pending_rider_approval');
DELETE FROM match_debug_log;

-- Regenerate matches for all active templates
DO $$
DECLARE
    template_rec RECORD;
    matches_created INTEGER;
BEGIN
    RAISE NOTICE 'Starting match generation...';
    FOR template_rec IN SELECT id FROM ride_templates WHERE status = 'active'
    LOOP
        matches_created := generate_match_suggestions_for_ride_template(template_rec.id);
        RAISE NOTICE 'Template %: created % matches', template_rec.id, matches_created;
    END LOOP;
END $$;

-- Regenerate matches for all active requests
DO $$
DECLARE
    request_rec RECORD;
    matches_created INTEGER;
BEGIN
    FOR request_rec IN SELECT id FROM ride_requests WHERE status = 'active'
    LOOP
        matches_created := generate_match_suggestions_for_ride_request(request_rec.id);
        RAISE NOTICE 'Request %: created % matches', request_rec.id, matches_created;
    END LOOP;
END $$;


-- ================================================================
-- STEP 7: View debug results
-- ================================================================

-- Check match count
SELECT 
    COUNT(*) as total_matches,
    AVG(overall_score) as avg_score,
    AVG(pickup_distance_meters) as avg_pickup_dist_meters,
    AVG(overlapping_distance_meters) as avg_overlap_dist_meters
FROM match_suggestions 
WHERE status = 'pending';

-- View debug log - WHY matches failed
SELECT 
    template_id,
    request_id,
    gender_check,
    pickup_distance_meters / 1000.0 as pickup_km,
    angle_difference,
    destination_distance_meters / 1000.0 as dest_km,
    match_result->>'error' as failure_reason
FROM match_debug_log
ORDER BY created_at DESC
LIMIT 20;

-- View successful matches
SELECT 
    template_id,
    request_id,
    match_result->>'match_score' as score,
    match_result->>'pickup_km' as pickup_km,
    match_result->>'destination_km' as dest_km,
    match_result->>'overlap_km' as overlap_km
FROM match_debug_log
WHERE match_result->>'success' = 'true'
ORDER BY created_at DESC
LIMIT 10;

-- View actual match suggestions
SELECT 
    ms.id,
    ms.overall_score as match_score,
    ms.pickup_distance_meters / 1000.0 as pickup_km,
    ms.overlapping_distance_meters / 1000.0 as overlap_km,
    rt.from_location as host_from,
    rt.to_location as host_to,
    rr.pickup_location as rider_pickup,
    rr.destination_location as rider_drop
FROM match_suggestions ms
JOIN ride_templates rt ON ms.ride_template_id = rt.id
JOIN ride_requests rr ON ms.ride_request_id = rr.id
WHERE ms.status = 'pending'
ORDER BY ms.overall_score DESC
LIMIT 10;


-- ================================================================
-- DONE! ✅
-- ================================================================
-- Check the debug log to see WHY matches are failing:
-- SELECT * FROM match_debug_log ORDER BY created_at DESC;
-- ================================================================
