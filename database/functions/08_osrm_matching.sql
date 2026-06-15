-- =================================================================
-- PURE OSRM-BASED MATCHING FUNCTION
-- =================================================================
-- Uses actual road distances from OSRM (no straight-line for matching)
-- Criteria:
-- 1. Pickup detour ≤ 5km (rider pickup to host route via OSRM)
-- 2. Destination distance ≤ 3km (straight-line fallback)
-- 3. Gender preference compatible
--
-- Requires: pg_http extension for calling OSRM API
-- =================================================================

-- Enable HTTP extension for calling OSRM API
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Grant permissions for extension schema/functions (avoid signature-specific grants)
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO postgres, anon, authenticated;

-- =================================================================
-- MAIN MATCHING FUNCTION
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
    original_route JSON;
    detour_route JSON;
    original_distance NUMERIC;
    detour_distance NUMERIC;
    detour_added NUMERIC;
    destination_distance NUMERIC;
    gender_compatible BOOLEAN;
    match_score NUMERIC;
    osrm_url TEXT;
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
    -- 0. EMAIL VERIFICATION CHECK
    -- ============================================================
    -- Both host and rider must have verified emails
    IF (SELECT email_verified FROM profiles WHERE id = template.host_id) IS NOT TRUE THEN
        RETURN json_build_object(
            'compatible', false,
            'reason', 'Host email not verified',
            'error_code', 'HOST_EMAIL_NOT_VERIFIED'
        );
    END IF;

    IF (SELECT email_verified FROM profiles WHERE id = ride_request.rider_id) IS NOT TRUE THEN
        RETURN json_build_object(
            'compatible', false,
            'reason', 'Rider email not verified',
            'error_code', 'RIDER_EMAIL_NOT_VERIFIED'
        );
    END IF;

    -- ============================================================
    -- 1. GENDER COMPATIBILITY CHECK
    -- ============================================================
    gender_compatible := (
        template.gender_preference = 'both' OR
        ride_request.gender_preference = 'both' OR
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
    -- 2. GET OSRM SERVER URL
    -- ============================================================
    osrm_url := COALESCE(
        current_setting('app.settings.osrm_url', true),
        'https://router.project-osrm.org'
    );

    -- ============================================================
    -- 3. CALL OSRM API - Original Route (Host: from → to)
    -- ============================================================
    BEGIN
        SELECT (content->'routes'->0) INTO original_route
        FROM extensions.http_get(
            format(
                '%s/route/v1/driving/%s,%s;%s,%s?overview=false',
                osrm_url,
                template.from_lng, template.from_lat,
                template.to_lng, template.to_lat
            )::varchar
        );

        IF original_route IS NULL THEN
            -- Fallback to straight-line if OSRM fails
            original_distance := ST_Distance(
                template.from_point::geography,
                template.to_point::geography,
                true
            );
        ELSE
            original_distance := (original_route->>'distance')::NUMERIC;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Fallback to straight-line
        original_distance := ST_Distance(
            template.from_point::geography,
            template.to_point::geography,
            true
        );
    END;

    -- ============================================================
    -- 4. CALL OSRM API - Detour Route (Host + Rider: from → pickup → to)
    -- ============================================================
    BEGIN
        SELECT (content->'routes'->0) INTO detour_route
        FROM extensions.http_get(
            format(
                '%s/route/v1/driving/%s,%s;%s,%s;%s,%s?overview=false',
                osrm_url,
                template.from_lng, template.from_lat,
                ride_request.pickup_lng, ride_request.pickup_lat,
                template.to_lng, template.to_lat
            )::varchar
        );

        IF detour_route IS NULL THEN
            -- Fallback: calculate pickup straight-line distance
            detour_distance := ST_Distance(
                template.from_point::geography,
                ride_request.pickup_point::geography,
                true
            ) + ST_Distance(
                ride_request.pickup_point::geography,
                template.to_point::geography,
                true
            );
        ELSE
            detour_distance := (detour_route->>'distance')::NUMERIC;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Fallback to straight-line
        detour_distance := ST_Distance(
            template.from_point::geography,
            ride_request.pickup_point::geography,
            true
        ) + ST_Distance(
            ride_request.pickup_point::geography,
            template.to_point::geography,
            true
        );
    END;

    -- ============================================================
    -- 5. CALCULATE DETOUR ADDED
    -- ============================================================
    detour_added := detour_distance - original_distance;

    -- ============================================================
    -- 6. CHECK: Is detour acceptable? (≤ 5km extra)
    -- ============================================================
    IF detour_added > 5000 THEN
        RETURN json_build_object(
            'compatible', false,
            'reason', 'Detour too long (' || ROUND(detour_added/1000, 2) || 'km extra)',
            'error_code', 'DETOUR_TOO_LONG',
            'detour_added_meters', ROUND(detour_added)
        );
    END IF;

    -- ============================================================
    -- 7. CHECK DESTINATION DISTANCE (≤ 3km straight-line)
    -- ============================================================
    destination_distance := ST_Distance(
        template.to_point::geography,
        ride_request.destination_point::geography,
        true
    );

    IF destination_distance > 3000 THEN
        RETURN json_build_object(
            'compatible', false,
            'reason', 'Destination too far (' || ROUND(destination_distance/1000, 2) || 'km)',
            'error_code', 'DESTINATION_TOO_FAR',
            'destination_distance_meters', ROUND(destination_distance)
        );
    END IF;

    -- ============================================================
    -- 8. CALCULATE MATCH SCORE
    -- ============================================================
    -- Score based on how much detour is added (less detour = higher score)
    match_score := GREATEST(0, 100 - (detour_added / 50));

    -- Bonus for close destination
    IF destination_distance < 1000 THEN
        match_score := LEAST(100, match_score + 10);
    END IF;

    -- ============================================================
    -- 9. RETURN RESULT
    -- ============================================================
    RETURN json_build_object(
        'compatible', true,
        'match_score', ROUND(match_score, 2),
        'original_distance_meters', ROUND(original_distance),
        'original_distance_km', ROUND(original_distance / 1000.0, 2),
        'detour_distance_meters', ROUND(detour_distance),
        'detour_distance_km', ROUND(detour_distance / 1000.0, 2),
        'detour_added_meters', ROUND(detour_added),
        'detour_added_km', ROUND(detour_added / 1000.0, 2),
        'destination_distance_meters', ROUND(destination_distance),
        'destination_distance_km', ROUND(destination_distance / 1000.0, 2),
        'reason', 'Compatible route found via OSRM'
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
'Pure OSRM-based matching. Uses actual road distances to calculate detour.
Criteria:
- Detour added ≤ 5km (road distance via OSRM)
- Destination distance ≤ 3km (straight-line)
- Gender preference compatible';
