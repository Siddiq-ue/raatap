-- =================================================================
-- FIX: Rider cost estimate used the host's FULL route distance
-- =================================================================
-- Bug: generate_match_suggestions_for_ride_template/_request stored
-- match_result->>'original_distance_meters' (the host's entire from->to
-- route distance) into match_suggestions.overlapping_distance_meters.
-- The frontend multiplies overlapping_distance_meters by cost/km to show
-- "Rider pays: ₹X", so riders were being charged for the host's whole
-- trip instead of just their own pickup -> dropoff segment.
--
-- Fix: calculate_route_match_score now also computes the rider's actual
-- overlapping segment (via calculate_overlapping_distance, which projects
-- pickup/dropoff onto the host route) and the generation functions store
-- that value instead.
-- =================================================================

-- ----------------------------------------------------------------
-- 1. Overlapping distance helper (rider's pickup -> dropoff segment
--    projected onto the host's route)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_overlapping_distance(
    p_host_from_lat FLOAT,
    p_host_from_lng FLOAT,
    p_host_to_lat FLOAT,
    p_host_to_lng FLOAT,
    p_rider_pickup_lat FLOAT,
    p_rider_pickup_lng FLOAT,
    p_rider_dest_lat FLOAT,
    p_rider_dest_lng FLOAT
)
RETURNS NUMERIC AS $$
DECLARE
    v_overlapping_distance NUMERIC := 0;
    v_rider_distance NUMERIC := 0;
    v_host_distance NUMERIC := 0;
    v_osrm_url TEXT;
    v_pickup_on_route BOOLEAN;
    v_dest_on_route BOOLEAN;
    v_pickup_fraction NUMERIC;
    v_dest_fraction NUMERIC;
BEGIN
    v_osrm_url := COALESCE(
        current_setting('app.settings.osrm_url', true),
        'https://router.project-osrm.org'
    );

    -- Get rider's actual route distance via OSRM (pickup -> destination)
    SELECT (routes->>'distance')::NUMERIC INTO v_rider_distance
    FROM (
        SELECT (content::json->'routes'->0) AS routes
        FROM extensions.http_get(
            v_osrm_url || '/route/v1/driving/' ||
            p_rider_pickup_lng || ',' || p_rider_pickup_lat || ';' ||
            p_rider_dest_lng || ',' || p_rider_dest_lat || '?overview=false'
        )
    ) AS t
    WHERE t.routes IS NOT NULL;

    -- If OSRM fails, fall back to straight-line
    IF v_rider_distance IS NULL OR v_rider_distance = 0 THEN
        v_rider_distance := ST_Distance(
            ST_MakePoint(p_rider_pickup_lng, p_rider_pickup_lat)::geography,
            ST_MakePoint(p_rider_dest_lng, p_rider_dest_lat)::geography,
            true
        );
    END IF;

    v_host_distance := ST_Distance(
        ST_MakePoint(p_host_from_lng, p_host_from_lat)::geography,
        ST_MakePoint(p_host_to_lng, p_host_to_lat)::geography,
        true
    );

    -- Check if pickup/destination are near host route line (500m threshold)
    v_pickup_on_route := ST_DWithin(
        ST_MakeLine(
            ST_MakePoint(p_host_from_lng, p_host_from_lat)::geometry,
            ST_MakePoint(p_host_to_lng, p_host_to_lat)::geometry
        )::geography,
        ST_MakePoint(p_rider_pickup_lng, p_rider_pickup_lat)::geography,
        500
    );

    v_dest_on_route := ST_DWithin(
        ST_MakeLine(
            ST_MakePoint(p_host_from_lng, p_host_from_lat)::geometry,
            ST_MakePoint(p_host_to_lng, p_host_to_lat)::geometry
        )::geography,
        ST_MakePoint(p_rider_dest_lng, p_rider_dest_lat)::geography,
        500
    );

    -- Both points must be near host route for overlap
    IF NOT v_pickup_on_route OR NOT v_dest_on_route THEN
        RETURN 0;
    END IF;

    -- Calculate fractional positions along host route
    v_pickup_fraction := ST_LineLocatePoint(
        ST_MakeLine(
            ST_MakePoint(p_host_from_lng, p_host_from_lat)::geometry,
            ST_MakePoint(p_host_to_lng, p_host_to_lat)::geometry
        ),
        ST_ClosestPoint(
            ST_MakeLine(
                ST_MakePoint(p_host_from_lng, p_host_from_lat)::geometry,
                ST_MakePoint(p_host_to_lng, p_host_to_lat)::geometry
            ),
            ST_MakePoint(p_rider_pickup_lng, p_rider_pickup_lat)::geometry
        )
    );

    v_dest_fraction := ST_LineLocatePoint(
        ST_MakeLine(
            ST_MakePoint(p_host_from_lng, p_host_from_lat)::geometry,
            ST_MakePoint(p_host_to_lng, p_host_to_lat)::geometry
        ),
        ST_ClosestPoint(
            ST_MakeLine(
                ST_MakePoint(p_host_from_lng, p_host_from_lat)::geometry,
                ST_MakePoint(p_host_to_lng, p_host_to_lat)::geometry
            ),
            ST_MakePoint(p_rider_dest_lng, p_rider_dest_lat)::geometry
        )
    );

    v_pickup_fraction := GREATEST(0, LEAST(1, v_pickup_fraction));
    v_dest_fraction := GREATEST(0, LEAST(1, v_dest_fraction));

    -- Calculate overlap based on fractions
    IF v_dest_fraction >= v_pickup_fraction THEN
        v_overlapping_distance := (v_dest_fraction - v_pickup_fraction) * v_host_distance;
    ELSE
        v_overlapping_distance := 0;
    END IF;

    -- Cap with rider's actual OSRM distance (rider can't overlap more than they travel)
    v_overlapping_distance := LEAST(v_overlapping_distance, v_rider_distance);

    RETURN ROUND(v_overlapping_distance);
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- 2. calculate_route_match_score: now also returns overlapping_distance_meters
--    computed from the rider's actual pickup -> dropoff segment, instead of
--    only the host's full route distance.
-- ----------------------------------------------------------------
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

    osrm_url := COALESCE(
        current_setting('app.settings.osrm_url', true),
        'https://router.project-osrm.org'
    );

    -- Call OSRM API - Original Route (Host: from -> to)
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

    -- Call OSRM API - Detour Route (Host + Rider: from -> pickup -> to)
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

    detour_added := detour_distance - original_distance;

    IF detour_added > 5000 THEN
        RETURN json_build_object(
            'compatible', false,
            'reason', 'Detour too long (' || ROUND(detour_added/1000, 2) || 'km extra)',
            'error_code', 'DETOUR_TOO_LONG',
            'detour_added_meters', ROUND(detour_added)
        );
    END IF;

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

    match_score := GREATEST(0, 100 - (detour_added / 50));

    IF destination_distance < 1000 THEN
        match_score := LEAST(100, match_score + 10);
    END IF;

    -- Rider's actual overlapping segment (pickup -> dropoff) along the host
    -- route. This, NOT the host's full route distance, is what the rider
    -- should be charged for.
    overlapping_distance := calculate_overlapping_distance(
        template.from_lat, template.from_lng,
        template.to_lat, template.to_lng,
        ride_request.pickup_lat, ride_request.pickup_lng,
        ride_request.destination_lat, ride_request.destination_lng
    );

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
'OSRM-based matching. Uses actual road distances to calculate detour, and
calculate_overlapping_distance() to determine the rider''s billable segment
(NOT the host''s full route).';

-- ----------------------------------------------------------------
-- 3. Match generation functions: store overlapping_distance_meters
--    (rider''s segment) instead of original_distance_meters (host''s
--    full route) in match_suggestions.
-- ----------------------------------------------------------------
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
        AND status NOT IN ('rejected', 'skipped', 'expired');

        IF existing_match IS NULL THEN
            match_result := calculate_route_match_score(template_id, request.id);

            IF (match_result->>'compatible')::BOOLEAN = true THEN
                BEGIN
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
                        'pending_host_approval'
                    );
                    suggestions_created := suggestions_created + 1;
                EXCEPTION WHEN unique_violation THEN
                    NULL;
                END;
            END IF;
        END IF;
    END LOOP;

    RETURN suggestions_created;
END;
$$;

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
        AND status NOT IN ('rejected', 'skipped', 'expired');

        IF existing_match IS NULL THEN
            match_result := calculate_route_match_score(template.id, request_id);

            IF (match_result->>'compatible')::BOOLEAN = true THEN
                BEGIN
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
                        'pending_host_approval'
                    );
                    suggestions_created := suggestions_created + 1;
                EXCEPTION WHEN unique_violation THEN
                    NULL;
                END;
            END IF;
        END IF;
    END LOOP;

    RETURN suggestions_created;
END;
$$;

-- ----------------------------------------------------------------
-- 4. Backfill: recompute overlapping_distance_meters for existing
--    pending/unresolved match suggestions that were stored with the
--    host's full route distance, so already-created suggestions also
--    show the correct rider cost without waiting for a new match.
-- ----------------------------------------------------------------
UPDATE match_suggestions ms
SET overlapping_distance_meters = calculate_overlapping_distance(
    rt.from_lat, rt.from_lng,
    rt.to_lat, rt.to_lng,
    rr.pickup_lat, rr.pickup_lng,
    rr.destination_lat, rr.destination_lng
)
FROM ride_templates rt, ride_requests rr
WHERE ms.ride_template_id = rt.id
AND ms.ride_request_id = rr.id
AND ms.status IN ('pending', 'shown', 'pending_host_approval', 'pending_rider_approval');
