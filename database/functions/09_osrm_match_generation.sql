-- =================================================================
-- MATCH GENERATION FUNCTIONS FOR OSRM MATCHING
-- =================================================================
-- These functions generate match_suggestions using the OSRM-based
-- calculate_route_match_score function
-- =================================================================

-- ----------------------------------------------------------------
-- Generate matches for a new ride template (host)
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
    -- Get the template
    SELECT * INTO template
    FROM ride_templates
    WHERE id = template_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Loop through all active ride requests
    FOR request IN
        SELECT * FROM ride_requests
        WHERE status = 'active'
        AND rider_id != template.host_id
    LOOP
        -- Check if match already exists
        SELECT id INTO existing_match
        FROM match_suggestions
        WHERE ride_template_id = template_id
        AND ride_request_id = request.id
        AND status NOT IN ('rejected', 'skipped', 'expired');

        IF existing_match IS NULL THEN
            -- Calculate match using OSRM-based function
            match_result := calculate_route_match_score(template_id, request.id);

            IF (match_result->>'compatible')::BOOLEAN = true THEN
                -- Create match suggestion (handle unique constraint violation)
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
                        COALESCE((match_result->>'original_distance_meters')::NUMERIC, 0),
                        'pending_host_approval'
                    );
                    suggestions_created := suggestions_created + 1;
                EXCEPTION WHEN unique_violation THEN
                    -- Match already exists, skip silently
                    NULL;
                END;
            END IF;
        END IF;
    END LOOP;

    RETURN suggestions_created;
END;
$$;

COMMENT ON FUNCTION generate_match_suggestions_for_ride_template IS
'Generates match suggestions for a ride template using OSRM-based matching.
Returns the number of suggestions created.';


-- ----------------------------------------------------------------
-- Generate matches for a new ride request (rider)
-- ----------------------------------------------------------------
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
    -- Get the request
    SELECT * INTO request
    FROM ride_requests
    WHERE id = request_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Loop through all active ride templates
    FOR template IN
        SELECT * FROM ride_templates
        WHERE status = 'active'
        AND host_id != request.rider_id
    LOOP
        -- Check if match already exists
        SELECT id INTO existing_match
        FROM match_suggestions
        WHERE ride_template_id = template.id
        AND ride_request_id = request_id
        AND status NOT IN ('rejected', 'skipped', 'expired');

        IF existing_match IS NULL THEN
            -- Calculate match using OSRM-based function
            match_result := calculate_route_match_score(template.id, request_id);

            IF (match_result->>'compatible')::BOOLEAN = true THEN
                -- Create match suggestion (handle unique constraint violation)
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
                        COALESCE((match_result->>'original_distance_meters')::NUMERIC, 0),
                        'pending_host_approval'
                    );
                    suggestions_created := suggestions_created + 1;
                EXCEPTION WHEN unique_violation THEN
                    -- Match already exists, skip silently
                    NULL;
                END;
            END IF;
        END IF;
    END LOOP;

    RETURN suggestions_created;
END;
$$;

COMMENT ON FUNCTION generate_match_suggestions_for_ride_request IS
'Generates match suggestions for a ride request using OSRM-based matching.
Returns the number of suggestions created.';


-- ----------------------------------------------------------------
-- Regenerate matches for existing template (for testing/debugging)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION regenerate_matches_for_template(template_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    matches_found INTEGER;
BEGIN
    -- Delete old pending matches for this template
    DELETE FROM match_suggestions
    WHERE ride_template_id = template_id
    AND status IN ('pending', 'shown', 'pending_host_approval', 'pending_rider_approval');

    -- Regenerate matches
    matches_found := generate_match_suggestions_for_ride_template(template_id);

    -- Log regeneration
    RAISE NOTICE 'Regenerated % matches for template %', matches_found, template_id;

    RETURN matches_found;
END;
$$;


-- ----------------------------------------------------------------
-- Regenerate matches for existing request (for testing/debugging)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION regenerate_matches_for_request(request_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    matches_found INTEGER;
BEGIN
    -- Delete old pending matches for this request
    DELETE FROM match_suggestions
    WHERE ride_request_id = request_id
    AND status IN ('pending', 'shown', 'pending_host_approval', 'pending_rider_approval');

    -- Regenerate matches
    matches_found := generate_match_suggestions_for_ride_request(request_id);

    -- Log regeneration
    RAISE NOTICE 'Regenerated % matches for request %', matches_found, request_id;

    RETURN matches_found;
END;
$$;


-- ----------------------------------------------------------------
-- Generate all matches (bulk regeneration)
-- ----------------------------------------------------------------
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
    -- Count active templates and requests
    SELECT COUNT(*) INTO template_count FROM ride_templates WHERE status = 'active';
    SELECT COUNT(*) INTO request_count FROM ride_requests WHERE status = 'active';

    -- Generate matches for all active templates
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

COMMENT ON FUNCTION generate_all_matches IS
'Generates matches for all active ride templates.
Returns summary of matches created.';
