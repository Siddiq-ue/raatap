-- =====================================================
-- FIX: ACCEPT MATCH SUGGESTION FUNCTION
-- =====================================================
-- This fixes the "column reference host_id is ambiguous" error
-- Run this in Supabase SQL Editor
-- =====================================================

-- Drop existing function to allow parameter rename
DROP FUNCTION IF EXISTS accept_match_suggestion(uuid, uuid, text);

-- =====================================================
-- ACCEPT MATCH SUGGESTION (Host Action)
-- =====================================================
-- Creates pod, locks seat, creates pending pod member
-- Rider must confirm to complete the matc

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
    AND rt.host_id = p_host_id;  -- ✅ Using p_host_id to avoid ambiguity

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
-- VERIFICATION
-- =====================================================
-- Run this to verify the function was created:

SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'accept_match_suggestion';

-- =====================================================
-- TEST THE FUNCTION
-- =====================================================
-- Replace with your actual match ID and host ID:

-- SELECT accept_match_suggestion(
--     'your-match-id-uuid',
--     'your-host-id-uuid',
--     'Test Pod'
-- );

-- Expected output:
-- {"success": true, "pod_id": "...", "message": "Match accepted..."}
