-- =====================================================
-- MATCH MANAGEMENT FUNCTIONS
-- Consolidated and fixed version
-- =====================================================

DROP FUNCTION IF EXISTS accept_match_suggestion(uuid, uuid, text);
DROP FUNCTION IF EXISTS confirm_match_suggestion(uuid, uuid);
DROP FUNCTION IF EXISTS skip_match_suggestion(uuid, uuid, text);

-- =====================================================
-- 1. ACCEPT MATCH SUGGESTION (Host Action)
-- =====================================================

CREATE OR REPLACE FUNCTION accept_match_suggestion(
    match_id UUID,
    p_host_id UUID,
    pod_name TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    match_record RECORD;
    existing_pod UUID;
    new_pod UUID;
    available_seats INTEGER;
BEGIN
    -- Get match suggestion and verify ownership
    SELECT ms.*, rt.host_id, rt.available_seats, rt.seats_taken, rt.departure_time, rt.return_time,
           rt.from_location, rt.to_location, rt.days_available
    INTO match_record
    FROM match_suggestions ms
    JOIN ride_templates rt ON ms.ride_template_id = rt.id
    WHERE ms.id = match_id
    AND ms.status = 'pending'
    AND rt.host_id = p_host_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Match not found or not accessible');
    END IF;

    -- Check if there are available seats
    available_seats := match_record.available_seats - match_record.seats_taken;
    IF available_seats <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'No available seats');
    END IF;

    -- Check if pod already exists for this template
    SELECT id INTO existing_pod
    FROM pods
    WHERE ride_template_id = match_record.ride_template_id
    AND status = 'active';

    IF existing_pod IS NULL THEN
        INSERT INTO pods (
            ride_template_id,
            host_id,
            name,
            days_active,
            departure_time,
            origin_location,
            destination_location,
            status
        ) VALUES (
            match_record.ride_template_id,
            p_host_id,
            COALESCE(pod_name, 'Daily Commute - ' || match_record.from_location),
            match_record.days_available,
            match_record.departure_time,
            match_record.from_location,
            match_record.to_location,
            'active'
        ) RETURNING id INTO new_pod;
    ELSE
        new_pod := existing_pod;
    END IF;

    -- Update match suggestion status
    UPDATE match_suggestions
    SET status = 'accepted',
        host_action_at = NOW()
    WHERE id = match_id;

    -- Increment seats taken on template (temporary seat lock)
    UPDATE ride_templates
    SET seats_taken = seats_taken + 1
    WHERE id = match_record.ride_template_id;

    -- Create pod member in pending_rider status
    INSERT INTO pod_members (
        pod_id,
        rider_id,
        ride_request_id,
        pickup_location,
        pickup_lat,
        pickup_lng,
        pickup_point,
        pickup_landmark,
        status,
        host_approved_at
    ) SELECT
        new_pod,
        rr.rider_id,
        rr.id,
        rr.pickup_location,
        rr.pickup_lat,
        rr.pickup_lng,
        rr.pickup_point,
        rr.pickup_landmark,
        'pending_rider',
        NOW()
    FROM ride_requests rr
    WHERE rr.id = match_record.ride_request_id;

    -- Update ride request status
    UPDATE ride_requests
    SET status = 'matched'
    WHERE id = match_record.ride_request_id;

    RETURN json_build_object(
        'success', true,
        'pod_id', new_pod,
        'match_id', match_id,
        'message', 'Match accepted. Waiting for rider confirmation.'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- =====================================================
-- 2. CONFIRM MATCH SUGGESTION (Rider Action)
-- =====================================================

CREATE OR REPLACE FUNCTION confirm_match_suggestion(
    match_id UUID,
    rider_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    match_record RECORD;
    pod_member_id UUID;
    available_seats INTEGER;
BEGIN
    -- Lock the ride_template row to prevent race conditions
    SELECT ms.*, rr.rider_id, rt.available_seats, rt.seats_taken
    INTO match_record
    FROM match_suggestions ms
    JOIN ride_requests rr ON ms.ride_request_id = rr.id
    JOIN ride_templates rt ON ms.ride_template_id = rt.id
    WHERE ms.id = match_id
    AND ms.status = 'accepted'
    AND rr.rider_id = rider_id
    FOR UPDATE OF rt;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Match not found or not accessible');
    END IF;

    -- Re-check seats after lock (seats may have changed)
    SELECT rt.available_seats - rt.seats_taken INTO available_seats
    FROM ride_templates rt
    WHERE rt.id = match_record.ride_template_id;

    IF available_seats <= 0 THEN
        -- Delete the match suggestion and reset ride request
        UPDATE match_suggestions SET status = 'expired' WHERE id = match_id;
        UPDATE ride_requests SET status = 'active' WHERE id = match_record.ride_request_id;
        DELETE FROM pod_members WHERE ride_request_id = match_record.ride_request_id;
        RETURN json_build_object('success', false, 'error', 'Pod is full. Your ride request has been reactivated.');
    END IF;

    -- Find and update the pod member
    UPDATE pod_members
    SET status = 'active',
        rider_confirmed_at = NOW(),
        joined_at = NOW()
    WHERE ride_request_id = match_record.ride_request_id
    AND status = 'pending_rider'
    RETURNING id INTO pod_member_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Pod member not found');
    END IF;

    -- Update match suggestion status
    UPDATE match_suggestions
    SET status = 'confirmed'
    WHERE id = match_id;

    RETURN json_build_object(
        'success', true,
        'pod_member_id', pod_member_id,
        'match_id', match_id,
        'message', 'Match confirmed. You are now part of the carpool!'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- =====================================================
-- 3. SKIP MATCH SUGGESTION (Host or Rider Action)
-- =====================================================

CREATE OR REPLACE FUNCTION skip_match_suggestion(
    match_id UUID,
    user_id UUID,
    user_role TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    match_record RECORD;
    is_owner BOOLEAN := false;
    pod_member_status TEXT;
BEGIN
    IF user_role = 'host' THEN
        SELECT ms.*, rt.host_id
        INTO match_record
        FROM match_suggestions ms
        JOIN ride_templates rt ON ms.ride_template_id = rt.id
        WHERE ms.id = match_id AND rt.host_id = user_id;

        is_owner := FOUND;

    ELSIF user_role = 'rider' THEN
        SELECT ms.*, rr.rider_id
        INTO match_record
        FROM match_suggestions ms
        JOIN ride_requests rr ON ms.ride_request_id = rr.id
        WHERE ms.id = match_id AND rr.rider_id = user_id;

        is_owner := FOUND;
    ELSE
        RETURN json_build_object('success', false, 'error', 'Invalid user role');
    END IF;

    IF NOT FOUND OR NOT is_owner THEN
        RETURN json_build_object('success', false, 'error', 'Match not found or not accessible');
    END IF;

    -- Get current pod member status if exists
    SELECT status INTO pod_member_status
    FROM pod_members
    WHERE ride_request_id = match_record.ride_request_id;

    -- Update match status
    UPDATE match_suggestions
    SET status = 'skipped'
    WHERE id = match_id;

    -- Release seat lock if:
    -- 1. Host skips (always release)
    -- 2. Rider skips while still pending_rider
    IF user_role = 'host' OR pod_member_status = 'pending_rider' THEN
        UPDATE ride_templates
        SET seats_taken = GREATEST(0, seats_taken - 1)
        WHERE id = match_record.ride_template_id;

        -- Remove pending pod member
        DELETE FROM pod_members
        WHERE ride_request_id = match_record.ride_request_id
        AND status = 'pending_rider';

        -- Reset ride request to active
        UPDATE ride_requests
        SET status = 'active'
        WHERE id = match_record.ride_request_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'message', 'Match skipped'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- =====================================================
-- 4. LEAVE POD (Rider leaves active pod)
-- =====================================================

CREATE OR REPLACE FUNCTION leave_pod(
    pod_member_id UUID,
    rider_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    pod_member RECORD;
    ride_template_id UUID;
BEGIN
    -- Verify ownership
    SELECT pm.*, p.ride_template_id INTO pod_member
    FROM pod_members pm
    JOIN pods p ON pm.pod_id = p.id
    WHERE pm.id = pod_member_id
    AND pm.rider_id = rider_id
    AND pm.status = 'active';

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Pod membership not found');
    END IF;

    ride_template_id := pod_member.ride_template_id;

    -- Remove pod member
    DELETE FROM pod_members WHERE id = pod_member_id;

    -- Release seat
    UPDATE ride_templates
    SET seats_taken = GREATEST(0, seats_taken - 1)
    WHERE id = ride_template_id;

    -- Reset ride request to active
    UPDATE ride_requests
    SET status = 'active'
    WHERE id = pod_member.ride_request_id;

    -- Expire match suggestions for this rider-template pair
    UPDATE match_suggestions
    SET status = 'expired'
    WHERE ride_template_id = ride_template_id
    AND ride_request_id = pod_member.ride_request_id;

    RETURN json_build_object(
        'success', true,
        'message', 'You have left the pod'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;
