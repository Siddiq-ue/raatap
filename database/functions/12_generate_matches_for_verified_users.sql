-- =================================================================
-- GENERATE MATCHES FOR VERIFIED USERS
-- =================================================================
-- Generates match_suggestions for verified users who don't have valid ones
-- Keeps existing match_suggestions intact
-- =================================================================

CREATE OR REPLACE FUNCTION generate_matches_for_verified_users()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    templates_processed INTEGER := 0;
    requests_processed INTEGER := 0;
    matches_created INTEGER := 0;
    template_rec RECORD;
    request_rec RECORD;
    v_email_verified BOOLEAN;
BEGIN
    -- Generate matches for verified users' ride templates without valid match_suggestions
    FOR template_rec IN
        SELECT rt.id, rt.host_id
        FROM ride_templates rt
        JOIN profiles p ON p.id = rt.host_id
        WHERE rt.status = 'active'
        AND p.email_verified = true
        AND NOT EXISTS (
            SELECT 1 FROM match_suggestions ms 
            WHERE ms.ride_template_id = rt.id 
            AND ms.status NOT IN ('rejected', 'skipped', 'expired')
        )
    LOOP
        matches_created := matches_created + generate_match_suggestions_for_ride_template(template_rec.id);
        templates_processed := templates_processed + 1;
    END LOOP;

    -- Generate matches for verified users' ride requests without valid match_suggestions
    FOR request_rec IN
        SELECT rr.id, rr.rider_id
        FROM ride_requests rr
        JOIN profiles p ON p.id = rr.rider_id
        WHERE rr.status = 'active'
        AND p.email_verified = true
        AND NOT EXISTS (
            SELECT 1 FROM match_suggestions ms 
            WHERE ms.ride_request_id = rr.id 
            AND ms.status NOT IN ('rejected', 'skipped', 'expired')
        )
    LOOP
        matches_created := matches_created + generate_match_suggestions_for_ride_request(request_rec.id);
        requests_processed := requests_processed + 1;
    END LOOP;

    RAISE NOTICE 'Generated % matches for % templates and % requests', 
        matches_created, templates_processed, requests_processed;

    RETURN json_build_object(
        'success', true,
        'templates_processed', templates_processed,
        'requests_processed', requests_processed,
        'matches_created', matches_created
    );
END;
$$;

COMMENT ON FUNCTION generate_matches_for_verified_users IS
'Generates match_suggestions for verified users who dont have valid ones.
Run this once to fix historical data after deploying reactivation triggers.';
