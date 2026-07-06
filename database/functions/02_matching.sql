-- =================================================================
-- OSRM-BASED MATCHING FUNCTION
-- =================================================================
-- Uses actual road distances from OSRM (no straight-line for matching)
-- Criteria:
-- 1. Pickup detour ≤ 5km (rider pickup to host route via OSRM)
-- 2. Destination distance ≤ 3km (straight-line fallback)
-- 3. Gender preference compatible
--
-- Requires: pg_http extension for calling OSRM API
-- =================================================================

-- Core OSRM matching function
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
    overlapping_distance NUMERIC;
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

    -- Gender compatibility check
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

    -- Get OSRM server URL
    osrm_url := COALESCE(
        current_setting('app.settings.osrm_url', true),
        'https://router.project-osrm.org'
    );

    -- Call OSRM API - Original Route (Host: from → to)
    BEGIN
        SELECT (extensions.http_get(
            format(
                '%s/route/v1/driving/%s,%s;%s,%s?overview=false',
                osrm_url,
                template.from_lng, template.from_lat,
                template.to_lng, template.to_lat
            )::varchar
        )->'content')::text::json->'routes'->0 INTO original_route;

        IF original_route IS NULL THEN
            original_distance := ST_Distance(
                template.from_point::geography,
                template.to_point::geography,
                true
            );
        ELSE
            original_distance := (original_route->>'distance')::NUMERIC;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        original_distance := ST_Distance(
            template.from_point::geography,
            template.to_point::geography,
            true
        );
    END;

    -- Call OSRM API - Detour Route (Host + Rider: from → pickup → to)
    BEGIN
        SELECT (extensions.http_get(
            format(
                '%s/route/v1/driving/%s,%s;%s,%s;%s,%s?overview=false',
                osrm_url,
                template.from_lng, template.from_lat,
                ride_request.pickup_lng, ride_request.pickup_lat,
                template.to_lng, template.to_lat
            )::varchar
        )->'content')::text::json->'routes'->0 INTO detour_route;

        IF detour_route IS NULL THEN
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

    -- Calculate detour added
    detour_added := detour_distance - original_distance;

    -- Check: Is detour acceptable? (≤ 5km extra)
    IF detour_added > 5000 THEN
        RETURN json_build_object(
            'compatible', false,
            'reason', 'Detour too long (' || ROUND(detour_added/1000, 2) || 'km extra)',
            'error_code', 'DETOUR_TOO_LONG',
            'detour_added_meters', ROUND(detour_added)
        );
    END IF;

    -- Check destination distance (≤ 3km straight-line)
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

    -- Calculate match score
    match_score := GREATEST(0, 100 - (detour_added / 50));

    -- Bonus for close destination
    IF destination_distance < 1000 THEN
        match_score := LEAST(100, match_score + 10);
    END IF;

    -- Calculate the rider's actual overlapping segment (pickup -> dropoff) along
    -- the host route. This, NOT the host's full route distance, is what the
    -- rider should be charged for.
    overlapping_distance := calculate_overlapping_distance(
        template.from_lat, template.from_lng,
        template.to_lat, template.to_lng,
        ride_request.pickup_lat, ride_request.pickup_lng,
        ride_request.destination_lat, ride_request.destination_lng
    );

    -- Return result
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
        'overlapping_distance_meters', ROUND(overlapping_distance),
        'overlapping_distance_km', ROUND(overlapping_distance / 1000.0, 2),
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


-- =================================================================
-- MATCH GENERATION FUNCTIONS
-- =================================================================

-- Generate matches for a new ride template (host)
CREATE OR REPLACE FUNCTION generate_match_suggestions_for_ride_template(
    template_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    template RECORD;
    request RECORD;
    match_result JSON;
    suggestions_created INTEGER := 0;
    existing_match UUID;
BEGIN
    SELECT * INTO template
    FROM ride_templates
    WHERE id = template_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    FOR request IN
        SELECT * FROM ride_requests
        WHERE status = 'active'
        AND rider_id != template.host_id
    LOOP
        SELECT id INTO existing_match
        FROM match_suggestions
        WHERE ride_template_id = template_id
        AND ride_request_id = request.id
        AND status IN ('pending', 'shown', 'accepted');

        IF existing_match IS NULL THEN
            match_result := calculate_route_match_score(template_id, request.id);

            IF (match_result->>'compatible')::BOOLEAN = true THEN
                INSERT INTO match_suggestions (
                    ride_template_id,
                    ride_request_id,
                    route_match_score,
                    schedule_match_score,
                    overall_score,
                    detour_distance_meters,
                    pickup_distance_meters,
                    overlapping_distance_meters,
                    status
                ) VALUES (
                    template_id,
                    request.id,
                    COALESCE((match_result->>'match_score')::NUMERIC, 0),
                    0,
                    COALESCE((match_result->>'match_score')::NUMERIC, 0),
                    COALESCE((match_result->>'detour_added_meters')::INTEGER, 0),
                    COALESCE((match_result->>'detour_added_meters')::INTEGER, 0),
                    COALESCE((match_result->>'overlapping_distance_meters')::NUMERIC, 0),
                    'pending'
                );

                suggestions_created := suggestions_created + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN suggestions_created;
END;
$$;


-- Generate matches for a new ride request (rider)
CREATE OR REPLACE FUNCTION generate_match_suggestions_for_ride_request(
    request_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    request RECORD;
    template RECORD;
    match_result JSON;
    suggestions_created INTEGER := 0;
    existing_match UUID;
BEGIN
    SELECT * INTO request
    FROM ride_requests
    WHERE id = request_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    FOR template IN
        SELECT * FROM ride_templates
        WHERE status = 'active'
        AND host_id != request.rider_id
    LOOP
        SELECT id INTO existing_match
        FROM match_suggestions
        WHERE ride_template_id = template.id
        AND ride_request_id = request_id
        AND status IN ('pending', 'shown', 'accepted');

        IF existing_match IS NULL THEN
            match_result := calculate_route_match_score(template.id, request_id);

            IF (match_result->>'compatible')::BOOLEAN = true THEN
                INSERT INTO match_suggestions (
                    ride_template_id,
                    ride_request_id,
                    route_match_score,
                    schedule_match_score,
                    overall_score,
                    detour_distance_meters,
                    pickup_distance_meters,
                    overlapping_distance_meters,
                    status
                ) VALUES (
                    template.id,
                    request_id,
                    COALESCE((match_result->>'match_score')::NUMERIC, 0),
                    0,
                    COALESCE((match_result->>'match_score')::NUMERIC, 0),
                    COALESCE((match_result->>'detour_added_meters')::INTEGER, 0),
                    COALESCE((match_result->>'detour_added_meters')::INTEGER, 0),
                    COALESCE((match_result->>'overlapping_distance_meters')::NUMERIC, 0),
                    'pending'
                );

                suggestions_created := suggestions_created + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN suggestions_created;
END;
$$;


-- Regenerate matches for existing template
CREATE OR REPLACE FUNCTION regenerate_matches_for_template(template_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    matches_found INTEGER;
BEGIN
    DELETE FROM match_suggestions
    WHERE ride_template_id = template_id
    AND status IN ('pending', 'shown');

    matches_found := generate_match_suggestions_for_ride_template(template_id);

    RAISE NOTICE 'Regenerated % matches for template %', matches_found, template_id;

    RETURN matches_found;
END;
$$;


-- Regenerate matches for existing request
CREATE OR REPLACE FUNCTION regenerate_matches_for_request(request_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    matches_found INTEGER;
BEGIN
    DELETE FROM match_suggestions
    WHERE ride_request_id = request_id
    AND status IN ('pending', 'shown');

    matches_found := generate_match_suggestions_for_ride_request(request_id);

    RAISE NOTICE 'Regenerated % matches for request %', matches_found, request_id;

    RETURN matches_found;
END;
$$;


-- Generate all matches (bulk)
CREATE OR REPLACE FUNCTION generate_all_matches()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    template_count INTEGER;
    request_count INTEGER;
    total_matches INTEGER := 0;
    template_rec RECORD;
BEGIN
    SELECT COUNT(*) INTO template_count FROM ride_templates WHERE status = 'active';
    SELECT COUNT(*) INTO request_count FROM ride_requests WHERE status = 'active';

    FOR template_rec IN SELECT id FROM ride_templates WHERE status = 'active'
    LOOP
        total_matches := total_matches + generate_match_suggestions_for_ride_template(template_rec.id);
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'templates_processed', template_count,
        'requests_count', request_count,
        'total_matches_created', total_matches
    );
END;
$$;
