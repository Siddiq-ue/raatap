-- =================================================================
-- PREVENT MULTI-POD MEMBERSHIP
-- =================================================================
-- Adds validation to prevent a rider from having multiple active
-- memberships across different pods
-- =================================================================

-- Update the confirm_rider_ride function to check for existing active memberships
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
    v_existing_count INTEGER;
BEGIN
    -- Check if rider already has an active membership in another pod
    SELECT COUNT(*) INTO v_existing_count
    FROM pod_members pm
    JOIN pods p ON pm.pod_id = p.id
    WHERE pm.rider_id = p_rider_id
    AND pm.status IN ('active', 'pending_rider', 'pending_host')
    AND p.status = 'active';

    IF v_existing_count > 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'You already have an active ride. Please leave that pod first.'
        );
    END IF;

    -- Check if this ride_request is already in any active pod
    SELECT COUNT(*) INTO v_existing_count
    FROM pod_members pm
    JOIN pods p ON pm.pod_id = p.id
    WHERE pm.ride_request_id = p_ride_request_id
    AND pm.status IN ('active', 'pending_rider', 'pending_host')
    AND p.status = 'active';

    IF v_existing_count > 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'This ride request is already part of an active pod.'
        );
    END IF;

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

-- Add a trigger to prevent inserts that would create duplicate active memberships
CREATE OR REPLACE FUNCTION prevent_duplicate_active_membership()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_count INTEGER;
BEGIN
    -- Only check for active statuses
    IF NEW.status IN ('active', 'pending_rider', 'pending_host') THEN
        -- Check if rider already has another active membership
        SELECT COUNT(*) INTO v_existing_count
        FROM pod_members pm
        JOIN pods p ON pm.pod_id = p.id
        WHERE pm.rider_id = NEW.rider_id
        AND pm.status IN ('active', 'pending_rider', 'pending_host')
        AND p.status = 'active'
        AND pm.pod_id != NEW.pod_id;

        IF v_existing_count > 0 THEN
            RAISE EXCEPTION 'Rider already has an active membership in another pod. Please leave that pod first.';
        END IF;

        -- Check if ride_request is already in another active pod
        SELECT COUNT(*) INTO v_existing_count
        FROM pod_members pm
        JOIN pods p ON pm.pod_id = p.id
        WHERE pm.ride_request_id = NEW.ride_request_id
        AND pm.status IN ('active', 'pending_rider', 'pending_host')
        AND p.status = 'active'
        AND pm.pod_id != NEW.pod_id;

        IF v_existing_count > 0 THEN
            RAISE EXCEPTION 'This ride request is already part of an active pod.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS trg_prevent_duplicate_active_membership ON pod_members;
CREATE TRIGGER trg_prevent_duplicate_active_membership
    BEFORE INSERT ON pod_members
    FOR EACH ROW
    EXECUTE FUNCTION prevent_duplicate_active_membership();

-- Create partial unique index as additional safety net
-- This ensures a rider can only have one active membership
DROP INDEX IF EXISTS idx_unique_active_rider_membership;
CREATE UNIQUE INDEX idx_unique_active_rider_membership 
ON pod_members(rider_id) 
WHERE status IN ('active', 'pending_rider', 'pending_host');

-- And for ride_request uniqueness
DROP INDEX IF EXISTS idx_unique_active_ride_request;
CREATE UNIQUE INDEX idx_unique_active_ride_request 
ON pod_members(ride_request_id) 
WHERE status IN ('active', 'pending_rider', 'pending_host');

COMMENT ON FUNCTION prevent_duplicate_active_membership IS 
    'Prevents a rider from having multiple active memberships across different pods';
COMMENT ON TRIGGER trg_prevent_duplicate_active_membership ON pod_members IS 
    'Fires before insert to prevent duplicate active memberships';
COMMENT ON INDEX idx_unique_active_rider_membership IS 
    'Ensures unique active rider membership per rider';
COMMENT ON INDEX idx_unique_active_ride_request IS 
    'Ensures unique active membership per ride request';
