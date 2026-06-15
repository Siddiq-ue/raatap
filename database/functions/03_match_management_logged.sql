-- =====================================================
-- MATCH MANAGEMENT FUNCTIONS WITH LOGGING
-- =====================================================
-- Drop function first if it exists (to allow parameter name changes)
DROP FUNCTION IF EXISTS confirm_match_suggestion(uuid, uuid);
DROP FUNCTION IF EXISTS accept_match_suggestion(uuid, uuid, text);

-- Function for host to accept a match (creates pod) WITH LOGGING
CREATE OR REPLACE FUNCTION accept_match_suggestion(
    match_id UUID,
    host_id UUID,
    pod_name TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    match_record RECORD;
    template_record RECORD;
    existing_pod UUID;
    new_pod UUID;
    available_seats INTEGER;
    log_id UUID;
    pod_member_id UUID;
BEGIN
    -- Log function entry
    log_id := log_activity(
        'INFO',
        'accept_match_suggestion',
        'Host attempting to accept match',
        host_id,
        'match',
        match_id,
        jsonb_build_object('pod_name', pod_name)
    );

    -- Get match suggestion and verify ownership
    SELECT ms.*, rt.host_id, rt.available_seats, rt.seats_taken, rt.departure_time, rt.return_time,
           rt.from_location, rt.to_location, rt.days_available
    INTO match_record
    FROM match_suggestions ms
    JOIN ride_templates rt ON ms.ride_template_id = rt.id
    WHERE ms.id = match_id
    AND ms.status = 'pending'
    AND rt.host_id = host_id;

    IF NOT FOUND THEN
        -- Log error: match not found
        PERFORM log_error(
            p_function_name := 'accept_match_suggestion',
            p_action := 'Match not found or not accessible',
            p_error_message := 'Match ID not found or user is not the host',
            p_user_id := host_id,
            p_entity_type := 'match',
            p_entity_id := match_id,
            p_details := jsonb_build_object('attempted_pod_name', pod_name)
        );
        
        RETURN json_build_object('success', false, 'error', 'Match not found or not accessible');
    END IF;

    -- Log match details retrieved
    PERFORM log_activity(
        'DEBUG',
        'accept_match_suggestion',
        'Match details retrieved',
        host_id,
        'match',
        match_id,
        jsonb_build_object(
            'template_id', match_record.ride_template_id,
            'request_id', match_record.ride_request_id,
            'available_seats', match_record.available_seats,
            'seats_taken', match_record.seats_taken,
            'from_location', match_record.from_location,
            'to_location', match_record.to_location
        )
    );

    -- Check if there are available seats
    available_seats := match_record.available_seats - match_record.seats_taken;
    IF available_seats <= 0 THEN
        -- Log error: no seats available
        PERFORM log_error(
            p_function_name := 'accept_match_suggestion',
            p_action := 'No available seats',
            p_error_message := 'All seats are already taken',
            p_user_id := host_id,
            p_entity_type := 'match',
            p_entity_id := match_id,
            p_details := jsonb_build_object(
                'available_seats', match_record.available_seats,
                'seats_taken', match_record.seats_taken
            )
        );
        
        RETURN json_build_object('success', false, 'error', 'No available seats');
    END IF;

    -- Log seat availability
    PERFORM log_activity(
        'DEBUG',
        'accept_match_suggestion',
        'Seats available check passed',
        host_id,
        'match',
        match_id,
        jsonb_build_object(
            'total_seats', match_record.available_seats,
            'seats_taken', match_record.seats_taken,
            'remaining_seats', available_seats
        )
    );

    -- Check if pod already exists for this template
    SELECT id INTO existing_pod
    FROM pods
    WHERE ride_template_id = match_record.ride_template_id
    AND status = 'active';

    IF existing_pod IS NULL THEN
        -- Create new pod
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
            host_id,
            COALESCE(pod_name, 'Daily Commute - ' || match_record.from_location),
            match_record.days_available,
            match_record.departure_time,
            match_record.from_location,
            match_record.to_location,
            'active'
        ) RETURNING id INTO new_pod;

        -- Log pod creation
        PERFORM log_activity(
            'INFO',
            'accept_match_suggestion',
            'New pod created',
            host_id,
            'pod',
            new_pod,
            jsonb_build_object(
                'name', COALESCE(pod_name, 'Daily Commute - ' || match_record.from_location),
                'days_active', match_record.days_available,
                'departure_time', match_record.departure_time,
                'origin', match_record.from_location,
                'destination', match_record.to_location
            )
        );
    ELSE
        new_pod := existing_pod;

        -- Log using existing pod
        PERFORM log_activity(
            'DEBUG',
            'accept_match_suggestion',
            'Using existing pod',
            host_id,
            'pod',
            existing_pod,
            jsonb_build_object('pod_name', pod_name)
        );
    END IF;

    -- Update match suggestion status
    UPDATE match_suggestions
    SET status = 'accepted',
        host_action_at = NOW()
    WHERE id = match_id;

    -- Log match status update
    PERFORM log_activity(
        'INFO',
        'accept_match_suggestion',
        'Match status updated to accepted',
        host_id,
        'match',
        match_id,
        jsonb_build_object('pod_id', new_pod)
    );

    -- Increment seats taken on template (temporary seat lock)
    UPDATE ride_templates
    SET seats_taken = seats_taken + 1
    WHERE id = match_record.ride_template_id;

    -- Log seat increment
    PERFORM log_activity(
        'DEBUG',
        'accept_match_suggestion',
        'Seats taken incremented',
        host_id,
        'ride_template',
        match_record.ride_template_id,
        jsonb_build_object('new_seats_taken', match_record.seats_taken + 1)
    );

    -- Get rider ID for pod member creation
    SELECT rr.rider_id INTO match_record
    FROM ride_requests rr
    WHERE rr.id = match_record.ride_request_id;

    -- Create pod member in pending_rider status
    INSERT INTO pod_members (
        pod_id,
        rider_id,
        ride_request_id,
        pickup_location,
        pickup_lat,
        pickup_lng,
        pickup_point,
        status
    )
    SELECT
        new_pod,
        rr.rider_id,
        rr.id,
        rr.pickup_location,
        rr.pickup_lat,
        rr.pickup_lng,
        rr.pickup_point,
        'pending_rider'
    FROM ride_requests rr
    WHERE rr.id = match_record.ride_request_id
    RETURNING id INTO pod_member_id;

    -- Log pod member creation
    PERFORM log_activity(
        'INFO',
        'accept_match_suggestion',
        'Pod member created (pending rider confirmation)',
        host_id,
        'pod_member',
        pod_member_id,
        jsonb_build_object(
            'pod_id', new_pod,
            'rider_id', match_record.rider_id,
            'pickup_location', match_record.pickup_location,
            'status', 'pending_rider'
        )
    );

    -- Log success
    PERFORM log_activity(
        'INFO',
        'accept_match_suggestion',
        'Match accepted successfully',
        host_id,
        'match',
        match_id,
        jsonb_build_object(
            'pod_id', new_pod,
            'pod_member_id', pod_member_id,
            'rider_id', match_record.rider_id,
            'success', true
        )
    );

    RETURN json_build_object(
        'success', true,
        'pod_id', new_pod,
        'pod_member_id', pod_member_id,
        'match_id', match_id,
        'message', 'Match accepted. Waiting for rider confirmation.'
    );

EXCEPTION WHEN OTHERS THEN
    -- Log unexpected error
    PERFORM log_error(
        p_function_name := 'accept_match_suggestion',
        p_action := 'Unexpected error accepting match',
        p_error_message := SQLERRM,
        p_user_id := host_id,
        p_entity_type := 'match',
        p_entity_id := match_id,
        p_details := jsonb_build_object(
            'sql_state', SQLSTATE,
            'pod_name', pod_name
        )
    );
    
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Function for rider to confirm a match WITH LOGGING
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
    log_id UUID;
    pod_id UUID;
BEGIN
    -- Log function entry
    log_id := log_activity(
        'INFO',
        'confirm_match_suggestion',
        'Rider attempting to confirm match',
        rider_id,
        'match',
        match_id,
        jsonb_build_object()
    );

    -- Get match suggestion and verify ownership
    SELECT ms.*, rr.rider_id, ms.ride_template_id, ms.ride_request_id
    INTO match_record
    FROM match_suggestions ms
    JOIN ride_requests rr ON ms.ride_request_id = rr.id
    WHERE ms.id = match_id
    AND ms.status = 'accepted'
    AND rr.rider_id = rider_id;

    IF NOT FOUND THEN
        -- Log error: match not found
        PERFORM log_error(
            p_function_name := 'confirm_match_suggestion',
            p_action := 'Match not found or not accessible',
            p_error_message := 'Match not found, not in accepted status, or user is not the rider',
            p_user_id := rider_id,
            p_entity_type := 'match',
            p_entity_id := match_id,
            p_details := jsonb_build_object()
        );
        
        RETURN json_build_object('success', false, 'error', 'Match not found or not accessible');
    END IF;

    -- Log match details retrieved
    PERFORM log_activity(
        'DEBUG',
        'confirm_match_suggestion',
        'Match details retrieved',
        rider_id,
        'match',
        match_id,
        jsonb_build_object(
            'template_id', match_record.ride_template_id,
            'request_id', match_record.ride_request_id,
            'status', match_record.status
        )
    );

    -- Get pod member record
    SELECT pm.id, pm.pod_id INTO pod_member_id, pod_id
    FROM pod_members pm
    WHERE pm.ride_request_id = match_record.ride_request_id
    AND pm.status = 'pending_rider';

    IF pod_member_id IS NULL THEN
        -- Log error: pod member not found
        PERFORM log_error(
            p_function_name := 'confirm_match_suggestion',
            p_action := 'Pod member not found',
            p_error_message := 'No pending pod member found for this match',
            p_user_id := rider_id,
            p_entity_type := 'match',
            p_entity_id := match_id,
            p_details := jsonb_build_object('ride_request_id', match_record.ride_request_id)
        );
        
        RETURN json_build_object('success', false, 'error', 'Pod member not found');
    END IF;

    -- Update pod member status to active
    UPDATE pod_members
    SET status = 'active',
        rider_confirmed_at = NOW()
    WHERE id = pod_member_id;

    -- Log pod member activation
    PERFORM log_activity(
        'INFO',
        'confirm_match_suggestion',
        'Pod member status updated to active',
        rider_id,
        'pod_member',
        pod_member_id,
        jsonb_build_object('pod_id', pod_id)
    );

    -- Update match suggestion status to confirmed
    UPDATE match_suggestions
    SET status = 'confirmed',
        rider_action_at = NOW()
    WHERE id = match_id;

    -- Log match confirmation
    PERFORM log_activity(
        'INFO',
        'confirm_match_suggestion',
        'Match status updated to confirmed',
        rider_id,
        'match',
        match_id,
        jsonb_build_object('pod_id', pod_id)
    );

    -- Expire other pending/accepted matches for this template (competing requests)
    UPDATE match_suggestions
    SET status = 'expired',
        host_action_at = NOW()
    WHERE ride_template_id = match_record.ride_template_id
    AND id != match_id
    AND status IN ('pending', 'accepted', 'shown');

    -- Log competing matches expired
    PERFORM log_activity(
        'INFO',
        'confirm_match_suggestion',
        'Competing matches expired',
        rider_id,
        'match',
        match_id,
        jsonb_build_object(
            'template_id', match_record.ride_template_id,
            'action', 'expired_competing_matches'
        )
    );

    -- Update ride request status to matched
    UPDATE ride_requests
    SET status = 'matched'
    WHERE id = match_record.ride_request_id;

    -- Log ride request update
    PERFORM log_activity(
        'INFO',
        'confirm_match_suggestion',
        'Ride request status updated to matched',
        rider_id,
        'ride_request',
        match_record.ride_request_id,
        jsonb_build_object('match_id', match_id)
    );

    -- Log success
    PERFORM log_activity(
        'INFO',
        'confirm_match_suggestion',
        'Match confirmed successfully',
        rider_id,
        'match',
        match_id,
        jsonb_build_object(
            'pod_id', pod_id,
            'pod_member_id', pod_member_id,
            'success', true
        )
    );

    RETURN json_build_object(
        'success', true,
        'pod_id', pod_id,
        'pod_member_id', pod_member_id,
        'match_id', match_id,
        'message', 'Match confirmed. You are now part of the pod!'
    );

EXCEPTION WHEN OTHERS THEN
    -- Log unexpected error
    PERFORM log_error(
        p_function_name := 'confirm_match_suggestion',
        p_action := 'Unexpected error confirming match',
        p_error_message := SQLERRM,
        p_user_id := rider_id,
        p_entity_type := 'match',
        p_entity_id := match_id,
        p_details := jsonb_build_object('sql_state', SQLSTATE)
    );
    
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;
