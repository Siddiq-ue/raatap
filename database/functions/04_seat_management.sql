-- Helper function to decrement seats_taken (used when host skips a match)
CREATE OR REPLACE FUNCTION decrement_seats_taken(ride_template_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE ride_templates
    SET seats_taken = GREATEST(0, seats_taken - 1)
    WHERE id = ride_template_id;
END;
$$;

-- Function to validate and lock seats (prevent overbooking)
CREATE OR REPLACE FUNCTION validate_and_lock_seat(
    template_id UUID,
    operation TEXT -- 'lock' for acceptance, 'unlock' for skipping
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    template RECORD;
    active_pod_members INTEGER;
    available_seats INTEGER;
BEGIN
    -- Get template info
    SELECT * INTO template
    FROM ride_templates
    WHERE id = template_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Template not found');
    END IF;
    
    -- Count active pod members
    SELECT COUNT(*) INTO active_pod_members
    FROM pod_members pm
    JOIN pods p ON pm.pod_id = p.id
    WHERE p.ride_template_id = template_id
    AND pm.status = 'active';
    
    available_seats := template.available_seats - active_pod_members;
    
    IF operation = 'lock' THEN
        IF available_seats <= 0 THEN
            RETURN json_build_object('success', false, 'error', 'No available seats');
        END IF;
        
        -- Increment seats_taken (temporary lock)
        UPDATE ride_templates
        SET seats_taken = seats_taken + 1
        WHERE id = template_id;
        
        RETURN json_build_object(
            'success', true,
            'message', 'Seat locked successfully',
            'remaining_seats', available_seats - 1
        );
        
    ELSIF operation = 'unlock' THEN
        -- Decrement seats_taken (release lock)
        UPDATE ride_templates
        SET seats_taken = GREATEST(0, seats_taken - 1)
        WHERE id = template_id;
        
        RETURN json_build_object(
            'success', true,
            'message', 'Seat unlocked successfully',
            'remaining_seats', available_seats + 1
        );
        
    ELSE
        RETURN json_build_object('success', false, 'error', 'Invalid operation');
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false, 
        'error', SQLERRM
    );
END;
$$;

-- Function to cleanup expired matches and release seat locks
CREATE OR REPLACE FUNCTION cleanup_expired_matches()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    expired_matches INTEGER := 0;
    template_id UUID;
BEGIN
    -- Find and update expired matches
    UPDATE match_suggestions 
    SET status = 'expired'
    WHERE status IN ('pending', 'accepted')
    AND expires_at < NOW()
    RETURNING ride_template_id INTO template_id;
    
    GET DIAGNOSTICS expired_matches = ROW_COUNT;
    
    -- Release seat locks for expired accepted matches
    IF expired_matches > 0 THEN
        UPDATE ride_templates 
        SET seats_taken = GREATEST(0, seats_taken - (
            SELECT COUNT(*) 
            FROM match_suggestions ms 
            WHERE ms.ride_template_id = ride_templates.id
            AND ms.status = 'expired'
            AND ms.expires_at < NOW()
            AND ms.host_action_at IS NOT NULL
        ))
        WHERE id IN (
            SELECT DISTINCT ride_template_id 
            FROM match_suggestions 
            WHERE status = 'expired' 
            AND expires_at < NOW()
            AND host_action_at IS NOT NULL
        );
    END IF;
    
    -- Remove pending pod members for expired matches
    DELETE FROM pod_members 
    WHERE status = 'pending_rider'
    AND ride_request_id IN (
        SELECT ride_request_id 
        FROM match_suggestions 
        WHERE status = 'expired'
        AND expires_at < NOW()
    );
    
    -- Reset ride requests that expired without confirmation
    UPDATE ride_requests 
    SET status = 'active'
    WHERE status = 'matched'
    AND id IN (
        SELECT ride_request_id 
        FROM match_suggestions 
        WHERE status = 'expired'
        AND expires_at < NOW()
    )
    AND NOT EXISTS (
        SELECT 1 FROM pod_members 
        WHERE ride_request_id = ride_requests.id 
        AND status = 'active'
    );
    
    RETURN expired_matches;
END;
$$;

-- Function to get user's active rides and matches
CREATE OR REPLACE FUNCTION get_user_rides(
    user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_profile RECORD;
    hosting_info JSON;
    riding_info JSON;
    pending_matches JSON;
BEGIN
    -- Get user profile
    SELECT * INTO user_profile
    FROM profiles
    WHERE id = user_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'User not found');
    END IF;
    
    -- Get hosting info (if user is host)
    IF user_profile.prefer_hosting THEN
        SELECT json_agg(
            json_build_object(
                'template_id', rt.id,
                'from_location', rt.from_location,
                'to_location', rt.to_location,
                'departure_time', rt.departure_time,
                'days_available', rt.days_available,
                'vehicle_type', rt.vehicle_type,
                'available_seats', rt.available_seats,
                'seats_taken', rt.seats_taken,
                'pod_info', (
                    SELECT json_build_object(
                        'pod_id', p.id,
                        'name', p.name,
                        'active_members', COUNT(pm.id) FILTER (WHERE pm.status = 'active')
                    )
                    FROM pods p
                    LEFT JOIN pod_members pm ON p.id = pm.pod_id AND pm.status = 'active'
                    WHERE p.ride_template_id = rt.id AND p.status = 'active'
                )
            )
        ) INTO hosting_info
        FROM ride_templates rt
        WHERE rt.host_id = user_id AND rt.status = 'active';
    END IF;
    
    -- Get riding info (if user is rider)
    IF user_profile.prefer_taking_ride THEN
        SELECT json_agg(
            json_build_object(
                'request_id', rr.id,
                'pickup_location', rr.pickup_location,
                'destination_location', rr.destination_location,
                'preferred_arrival_time', rr.preferred_arrival_time,
                'days_needed', rr.days_needed,
                'status', rr.status,
                'pod_member_info', (
                    SELECT json_build_object(
                        'pod_id', pm.pod_id,
                        'status', pm.status,
                        'pickup_location', pm.pickup_location,
                        'rider_confirmed_at', pm.rider_confirmed_at,
                        'host_approved_at', pm.host_approved_at
                    )
                    FROM pod_members pm
                    WHERE pm.ride_request_id = rr.id
                )
            )
        ) INTO riding_info
        FROM ride_requests rr
        WHERE rr.rider_id = user_id AND rr.status IN ('active', 'matched');
    END IF;
    
    -- Get pending/active matches (Host-First Logic)
    SELECT json_agg(
        json_build_object(
            'match_id', ms.id,
            'role', CASE 
                WHEN ms.ride_template_id IN (SELECT id FROM ride_templates WHERE host_id = user_id) THEN 'host'
                WHEN ms.ride_request_id IN (SELECT id FROM ride_requests WHERE rider_id = user_id) THEN 'rider'
            END,
            'overall_score', ms.overall_score,
            'pickup_distance_meters', ms.pickup_distance_meters,
            'status', ms.status,
            'created_at', ms.created_at,
            'expires_at', ms.expires_at,
            'template_info', (
                SELECT json_build_object(
                    'host_id', rt.host_id,
                    'from_location', rt.from_location,
                    'to_location', rt.to_location,
                    'departure_time', rt.departure_time,
                    'vehicle_type', rt.vehicle_type,
                    'available_seats', rt.available_seats
                )
                FROM ride_templates rt WHERE rt.id = ms.ride_template_id
            ),
            'request_info', (
                SELECT json_build_object(
                    'rider_id', rr.rider_id,
                    'pickup_location', rr.pickup_location,
                    'preferred_arrival_time', rr.preferred_arrival_time
                )
                FROM ride_requests rr WHERE rr.id = ms.ride_request_id
            )
        )
    ) INTO pending_matches
    FROM match_suggestions ms
    WHERE 
        -- HOST VISIBILITY: Can see pending, accepted, shown
        (ms.ride_template_id IN (SELECT id FROM ride_templates WHERE host_id = user_id) 
         AND ms.status IN ('pending', 'accepted', 'shown'))
        OR
        -- RIDER VISIBILITY: Can ONLY see accepted or shown (NOT pending)
        (ms.ride_request_id IN (SELECT id FROM ride_requests WHERE rider_id = user_id) 
         AND ms.status IN ('accepted', 'shown'));
    
    RETURN json_build_object(
        'success', true,
        'hosting_info', hosting_info,
        'riding_info', riding_info,
        'pending_matches', pending_matches,
        'user_role', CASE 
            WHEN user_profile.prefer_hosting THEN 'host'
            WHEN user_profile.prefer_taking_ride THEN 'rider'
        END
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false, 
        'error', SQLERRM
    );
END;
$$;