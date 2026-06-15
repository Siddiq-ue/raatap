-- CRITICAL PATCH: Concurrency Safety for Launch
-- This function replaces the previous confirm_match_suggestion with a version that
-- uses Row Level Locking (FOR UPDATE) to prevent overbooking race conditions.

-- Drop existing function first (cannot change parameter names otherwise)
DROP FUNCTION IF EXISTS confirm_match_suggestion(uuid, uuid);

CREATE OR REPLACE FUNCTION confirm_match_suggestion(
    match_id UUID,
    p_rider_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    match_record RECORD;
    pod_member_id UUID;
    v_ride_template_id UUID;
    v_available_seats INT;
    v_seats_taken INT;
BEGIN
    -- 1. Get match info and verify ownership
    SELECT ms.*, rr.rider_id
    INTO match_record
    FROM match_suggestions ms
    JOIN ride_requests rr ON ms.ride_request_id = rr.id
    WHERE ms.id = match_id 
    AND ms.status = 'accepted' -- Must be accepted by host
    AND rr.rider_id = p_rider_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Match not found or not ready');
    END IF;

    v_ride_template_id := match_record.ride_template_id;

    -- 2. LOCK the Ride Template Row (Prevents concurrent confirmations)
    -- This waits if another transaction is confirming for the same ride
    SELECT available_seats, seats_taken 
    INTO v_available_seats, v_seats_taken
    FROM ride_templates 
    WHERE id = v_ride_template_id
    FOR UPDATE; -- <--- MAGIC LOCKING KEYWORD

    -- 3. Double Check Capacity inside the Lock
    IF v_seats_taken >= v_available_seats THEN
        -- Integrity Check: Seat already taken by race condition
        -- Expire this match as it's no longer valid
        UPDATE match_suggestions SET status = 'expired' WHERE id = match_id;
        RETURN json_build_object('success', false, 'error', 'Ride is full. Seat was just taken.');
    END IF;

    -- 4. Proceed with Confirmation (Atomic Updates)
    
    -- Increment Seat Count
    UPDATE ride_templates 
    SET seats_taken = seats_taken + 1
    WHERE id = v_ride_template_id;

    -- Activate Pod Member
    UPDATE pod_members 
    SET status = 'active',
        rider_confirmed_at = NOW(),
        joined_at = NOW()
    WHERE ride_request_id = match_record.ride_request_id
    AND status = 'pending_rider'
    RETURNING id INTO pod_member_id;

    IF NOT FOUND THEN
        -- Should not happen if logic is correct, but safe fallback
        RETURN json_build_object('success', false, 'error', 'Pod member record missing');
    END IF;

    -- Update Match Status
    UPDATE match_suggestions 
    SET status = 'confirmed'
    WHERE id = match_id;

    -- 5. Cleanup: Expire competing matches
    
    -- Expire other matches for THIS rider (they can't be in two places)
    UPDATE match_suggestions
    SET status = 'expired'
    WHERE ride_request_id = match_record.ride_request_id
    AND id != match_id
    AND status IN ('pending', 'shown', 'accepted');

    -- Expire other matches for THIS ride if NOW full
    IF (v_seats_taken + 1) >= v_available_seats THEN
        UPDATE match_suggestions
        SET status = 'expired'
        WHERE ride_template_id = v_ride_template_id
        AND status IN ('pending', 'shown'); -- Don't expire 'accepted' ones yet? Actually yes, if full, we can't take them.
        -- If we expire 'accepted' ones, those riders need to know "Ride Full". 
        -- For now 'expired' is fine.
    END IF;

    RETURN json_build_object(
        'success', true,
        'pod_member_id', pod_member_id,
        'match_id', match_id,
        'message', 'Match confirmed! You are now part of the ride.'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
