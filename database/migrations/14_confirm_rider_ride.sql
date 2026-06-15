-- =================================================================
-- CONFIRM RIDER RIDE
-- =================================================================
-- Allows a rider to confirm their pod membership
-- Updates status from 'pending_rider' to 'active'
-- =================================================================

CREATE OR REPLACE FUNCTION confirm_rider_ride(
    p_ride_request_id UUID,
    p_rider_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pod_member_id UUID;
    v_match_suggestion_id UUID;
BEGIN
    -- Log function execution
    PERFORM log_activity(
        'INFO',
        'confirm_rider_ride',
        'Rider confirming pod membership',
        p_rider_id,
        'ride_request',
        p_ride_request_id,
        jsonb_build_object()
    );

    -- Verify the rider owns this ride request
    IF NOT EXISTS (
        SELECT 1 FROM ride_requests 
        WHERE id = p_ride_request_id 
        AND rider_id = p_rider_id
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Ride request not found or not accessible'
        );
    END IF;

    -- Find the match suggestion for this ride request that has been accepted
    SELECT ms.id INTO v_match_suggestion_id
    FROM match_suggestions ms
    WHERE ms.ride_request_id = p_ride_request_id
    AND ms.status = 'accepted';

    -- Update the pod member status to active
    UPDATE pod_members
    SET 
        status = 'active',
        rider_confirmed_at = NOW(),
        joined_at = NOW()
    WHERE ride_request_id = p_ride_request_id
    AND status = 'pending_rider'
    RETURNING id INTO v_pod_member_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No pending pod membership found'
        );
    END IF;

    -- Update the match suggestion status to 'shown' (if it exists)
    IF v_match_suggestion_id IS NOT NULL THEN
        UPDATE match_suggestions
        SET status = 'shown'
        WHERE id = v_match_suggestion_id;
    END IF;

    -- Log success
    PERFORM log_activity(
        'INFO',
        'confirm_rider_ride',
        'Pod membership confirmed',
        p_rider_id,
        'pod_member',
        v_pod_member_id,
        jsonb_build_object(
            'ride_request_id', p_ride_request_id,
            'match_suggestion_id', v_match_suggestion_id
        )
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Ride confirmed! You are now part of the pod.',
        'pod_member_id', v_pod_member_id
    );

EXCEPTION WHEN OTHERS THEN
    -- Log error
    PERFORM log_error(
        p_function_name := 'confirm_rider_ride',
        p_action := 'Failed to confirm rider ride',
        p_error_message := SQLERRM,
        p_user_id := p_rider_id,
        p_entity_type := 'ride_request',
        p_entity_id := p_ride_request_id,
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
-- Confirm a rider's pending ride:
SELECT confirm_rider_ride('ride-request-id', 'rider-user-id');

-- Returns:
-- {
--   "success": true,
--   "message": "Ride confirmed! You are now part of the pod.",
--   "pod_member_id": "uuid"
-- }

-- View recent confirmations:
SELECT * FROM recent_activity_logs
WHERE function_name = 'confirm_rider_ride'
ORDER BY log_time DESC
LIMIT 10;
*/
