-- =================================================================
-- FIX: overlap calculation had its own, stricter "on route" cutoff
-- than the gate that decides whether to suggest the match at all
-- =================================================================
-- calculate_route_match_score() decides whether a match is worth
-- suggesting using its own tolerances: up to 5000m of extra driving
-- detour, up to 3000m destination distance. Once a match clears that
-- bar, it gets shown to the host as a real, ranked suggestion (closer
-- matches naturally score higher via match_score's distance terms -
-- there's no need for a second, separate rule).
--
-- But calculate_overlapping_distance() enforced its OWN, much tighter
-- "on route" cutoff (bumped 500m -> 1000m in migration 25) before it
-- would compute any overlap at all. That produced matches which were
-- good enough to suggest (passed the 5000m/3000m gate) but still
-- billed at exactly $0, because they missed the separate, stricter
-- cutoff by some margin (observed: 1461m, clearing 1000m but still
-- rejected) - even though the rider was, in every practical sense,
-- riding almost the entire route (pickup projected to ~0% along the
-- route, dropoff at ~100%).
--
-- Fix: calculate_overlapping_distance now takes the SAME thresholds
-- calculate_route_match_score already uses to decide compatibility,
-- instead of an independent hardcoded value. Anything good enough to
-- suggest to the host now also gets a real, proportional overlap/cost
-- - never a false $0 - while still correctly excluding matches that
-- were never compatible in the first place.
-- =================================================================

CREATE OR REPLACE FUNCTION calculate_overlapping_distance(
    p_host_from_lat FLOAT,
    p_host_from_lng FLOAT,
    p_host_to_lat FLOAT,
    p_host_to_lng FLOAT,
    p_rider_pickup_lat FLOAT,
    p_rider_pickup_lng FLOAT,
    p_rider_dest_lat FLOAT,
    p_rider_dest_lng FLOAT,
    p_host_route_geometry GEOGRAPHY DEFAULT NULL,
    p_pickup_threshold_meters NUMERIC DEFAULT 5000,
    p_dest_threshold_meters NUMERIC DEFAULT 3000
)
RETURNS NUMERIC AS $$
DECLARE
    v_overlapping_distance NUMERIC := 0;
    v_rider_distance NUMERIC := 0;
    v_host_distance NUMERIC := 0;
    v_osrm_url TEXT;
    v_route_line GEOMETRY;
    v_pickup_point GEOMETRY;
    v_dest_point GEOMETRY;
    v_pickup_on_route BOOLEAN;
    v_dest_on_route BOOLEAN;
    v_pickup_fraction NUMERIC;
    v_dest_fraction NUMERIC;
BEGIN
    v_osrm_url := COALESCE(
        current_setting('app.settings.osrm_url', true),
        'https://router.project-osrm.org'
    );

    -- Get rider's actual route distance via OSRM (pickup -> destination).
    -- Wrapped in EXCEPTION - an OSRM timeout/outage must degrade to the
    -- straight-line estimate below, not blow up the whole calculation.
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
        v_rider_distance := NULL;
    END;

    -- If OSRM fails, fall back to straight-line
    IF v_rider_distance IS NULL OR v_rider_distance = 0 THEN
        v_rider_distance := ST_Distance(
            ST_SetSRID(ST_MakePoint(p_rider_pickup_lng, p_rider_pickup_lat), 4326)::geography,
            ST_SetSRID(ST_MakePoint(p_rider_dest_lng, p_rider_dest_lat), 4326)::geography,
            true
        );
    END IF;

    -- Use the host's real road-following route when we have it; otherwise
    -- fall back to the straight chord between the host's endpoints.
    IF p_host_route_geometry IS NOT NULL THEN
        v_route_line := p_host_route_geometry::geometry;
    ELSE
        v_route_line := ST_SetSRID(ST_MakeLine(
            ST_MakePoint(p_host_from_lng, p_host_from_lat),
            ST_MakePoint(p_host_to_lng, p_host_to_lat)
        ), 4326);
    END IF;

    v_host_distance := ST_Length(v_route_line::geography);

    v_pickup_point := ST_SetSRID(ST_MakePoint(p_rider_pickup_lng, p_rider_pickup_lat), 4326);
    v_dest_point := ST_SetSRID(ST_MakePoint(p_rider_dest_lng, p_rider_dest_lat), 4326);

    -- Check if pickup/destination are near the route, using the SAME
    -- tolerances the caller used to decide this match was worth
    -- suggesting in the first place.
    v_pickup_on_route := ST_DWithin(
        v_route_line::geography,
        v_pickup_point::geography,
        p_pickup_threshold_meters
    );

    v_dest_on_route := ST_DWithin(
        v_route_line::geography,
        v_dest_point::geography,
        p_dest_threshold_meters
    );

    -- Both points must be near the route for overlap
    IF NOT v_pickup_on_route OR NOT v_dest_on_route THEN
        RETURN 0;
    END IF;

    -- Calculate fractional positions along the route (walks every vertex
    -- of the real polyline when geometry is available, not just the two
    -- endpoints, so a rider joining/leaving anywhere mid-route is placed
    -- correctly)
    v_pickup_fraction := ST_LineLocatePoint(v_route_line, ST_ClosestPoint(v_route_line, v_pickup_point));
    v_dest_fraction := ST_LineLocatePoint(v_route_line, ST_ClosestPoint(v_route_line, v_dest_point));

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
-- calculate_route_match_score: pass its own compatibility-gate
-- thresholds (detour_added > 5000 and destination_distance > 3000
-- reject the match a few lines above) through to
-- calculate_overlapping_distance, so the two can never drift apart
-- again.
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
    v_max_detour_meters CONSTANT NUMERIC := 5000;
    v_max_destination_meters CONSTANT NUMERIC := 3000;
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

    IF detour_added > v_max_detour_meters THEN
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

    IF destination_distance > v_max_destination_meters THEN
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

    -- Rider's actual overlapping segment (pickup -> dropoff) along the host's
    -- REAL route geometry when available, using the SAME detour/destination
    -- tolerances that just decided this match is compatible - so a match
    -- good enough to suggest never comes out to a false $0.
    overlapping_distance := calculate_overlapping_distance(
        template.from_lat, template.from_lng,
        template.to_lat, template.to_lng,
        ride_request.pickup_lat, ride_request.pickup_lng,
        ride_request.destination_lat, ride_request.destination_lng,
        template.route_geometry,
        v_max_detour_meters,
        v_max_destination_meters
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

-- Clean up interactive debug helper (see prior investigation, migration
-- history repaired for version 26 since its file was never meant to land).
DROP FUNCTION IF EXISTS debug_overlap_distances_tmp(FLOAT, FLOAT, FLOAT, FLOAT, GEOGRAPHY);
