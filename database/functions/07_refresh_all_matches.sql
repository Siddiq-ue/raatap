-- =================================================================
-- REFRESH ALL MATCHES
-- =================================================================
-- Clears ALL match_suggestions and regenerates them from scratch
-- Use this for testing or to reset the matching system
-- =================================================================

CREATE OR REPLACE FUNCTION refresh_all_matches()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    template_count INTEGER;
    request_count INTEGER;
    deleted_count INTEGER;
    new_matches_count INTEGER;
    template_record RECORD;
    request_record RECORD;
BEGIN
    -- Log function execution
    PERFORM log_activity(
        'INFO',
        'refresh_all_matches',
        'Starting full match refresh',
        NULL,
        NULL,
        NULL,
        jsonb_build_object()
    );

    -- Count existing templates and requests
    SELECT COUNT(*) INTO template_count 
    FROM ride_templates 
    WHERE status = 'active';

    SELECT COUNT(*) INTO request_count 
    FROM ride_requests 
    WHERE status = 'active';

    -- Delete ALL match suggestions
    DELETE FROM match_suggestions;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- Log deletion
    PERFORM log_activity(
        'INFO',
        'refresh_all_matches',
        'Cleared all match suggestions',
        NULL,
        NULL,
        NULL,
        jsonb_build_object('deleted_count', deleted_count)
    );

    -- Regenerate matches for all active ride templates
    new_matches_count := 0;
    FOR template_record IN 
        SELECT id FROM ride_templates WHERE status = 'active'
    LOOP
        -- This will create matches against all active ride requests
        PERFORM generate_match_suggestions_for_ride_template(template_record.id);
    END LOOP;

    -- Count new matches (ride_requests are already matched via template generation)
    SELECT COUNT(*) INTO new_matches_count FROM match_suggestions;

    -- Log completion
    PERFORM log_activity(
        'INFO',
        'refresh_all_matches',
        'Match refresh completed',
        NULL,
        NULL,
        NULL,
        jsonb_build_object(
            'templates_processed', template_count,
            'requests_processed', request_count,
            'matches_deleted', deleted_count,
            'matches_created', new_matches_count
        )
    );

    RETURN json_build_object(
        'success', true,
        'message', 'All matches refreshed successfully',
        'templates_processed', template_count,
        'requests_processed', request_count,
        'matches_deleted', deleted_count,
        'matches_created', new_matches_count
    );

EXCEPTION WHEN OTHERS THEN
    -- Log error
    PERFORM log_error(
        p_function_name := 'refresh_all_matches',
        p_action := 'Failed to refresh matches',
        p_error_message := SQLERRM,
        p_user_id := NULL,
        p_entity_type := NULL,
        p_entity_id := NULL,
        p_details := jsonb_build_object('sql_state', SQLSTATE)
    );

    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- ================================================================
-- USAGE
-- ================================================================
/*
-- Refresh all matches (clears and regenerates)
SELECT refresh_all_matches();

-- View the results
-- Returns: {success, message, templates_processed, requests_processed, matches_deleted, matches_created}

-- Check match count after refresh
SELECT COUNT(*) FROM match_suggestions;

-- View recent match activity
SELECT * FROM recent_activity_logs 
WHERE function_name = 'refresh_all_matches' 
ORDER BY log_time DESC 
LIMIT 5;

-- View all current matches
SELECT 
    ms.id,
    ms.status,
    rt.from_location,
    rt.to_location,
    rr.pickup_location,
    rr.drop_location,
    ms.created_at
FROM match_suggestions ms
JOIN ride_templates rt ON ms.ride_template_id = rt.id
JOIN ride_requests rr ON ms.ride_request_id = rr.id
ORDER BY ms.created_at DESC
LIMIT 20;
*/

-- ================================================================
-- QUICK TEST
-- ================================================================
/*
-- Run this to test:
SELECT refresh_all_matches();

-- Expected output:
-- {
--   "success": true,
--   "message": "All matches refreshed successfully",
--   "templates_processed": 5,
--   "requests_processed": 10,
--   "matches_deleted": 15,
--   "matches_created": 25
-- }
*/
