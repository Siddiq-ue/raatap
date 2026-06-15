-- Function to create ride_template from profile (HOST only)
-- Requires: prefer_hosting = true AND email_verified = true
CREATE OR REPLACE FUNCTION create_ride_template_from_profile(
    user_id UUID,
    p_vehicle_type TEXT,
    p_available_seats INTEGER DEFAULT NULL,  -- NULL = auto-calculate from vehicle_type
    p_max_detour_meters INTEGER DEFAULT 2000,
    p_return_time TIME DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_profile RECORD;
    new_ride_template UUID;
    role_check BOOLEAN;
    calculated_seats INTEGER;
BEGIN
    -- Validate user role (must be host)
    SELECT prefer_hosting INTO role_check
    FROM profiles
    WHERE id = user_id;

    IF role_check != true THEN
        RETURN json_build_object('success', false, 'error', 'Only hosts can create ride templates');
    END IF;

    -- Get profile data
    SELECT * INTO user_profile
    FROM profiles
    WHERE id = user_id AND prefer_hosting = true;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Profile not found or not a host');
    END IF;

    -- Check email verification
    IF user_profile.email_verified != true THEN
        RETURN json_build_object('success', false, 'error', 'Email verification required. Please verify your institutional email.');
    END IF;

    -- Validate required fields
    IF user_profile.from_lat IS NULL OR user_profile.from_lng IS NULL OR
       user_profile.to_lat IS NULL OR user_profile.to_lng IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Profile coordinates are required');
    END IF;

    IF user_profile.leave_home_time IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Leave home time is required');
    END IF;

    IF user_profile.days_of_commute IS NULL OR array_length(user_profile.days_of_commute, 1) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Days of commute are required');
    END IF;

    -- Auto-calculate available seats based on vehicle type if not provided
    IF p_available_seats IS NULL OR p_available_seats < 1 THEN
        IF p_vehicle_type = '2_wheeler' THEN
            calculated_seats := 1;  -- Bike: 1 passenger seat
        ELSIF p_vehicle_type = '4_wheeler' THEN
            calculated_seats := 3;  -- Car: 3 passenger seats
        ELSE
            calculated_seats := 1;  -- Default fallback
        END IF;
    ELSE
        calculated_seats := p_available_seats;
    END IF;

    -- Create ride_template
    INSERT INTO ride_templates (
        host_id,
        from_location,
        from_lat,
        from_lng,
        from_point,
        to_location,
        to_lat,
        to_lng,
        to_point,
        departure_time,
        return_time,
        days_available,
        vehicle_type,
        available_seats,
        max_detour_meters,
        gender_preference
    ) VALUES (
        user_id,
        user_profile.from_location,
        user_profile.from_lat,
        user_profile.from_lng,
        ST_GeomFromText('POINT(' || user_profile.from_lng || ' ' || user_profile.from_lat || ')', 4326),
        user_profile.to_location,
        user_profile.to_lat,
        user_profile.to_lng,
        ST_GeomFromText('POINT(' || user_profile.to_lng || ' ' || user_profile.to_lat || ')', 4326),
        user_profile.leave_home_time,
        p_return_time,
        user_profile.days_of_commute,
        p_vehicle_type,
        calculated_seats,
        p_max_detour_meters,
        COALESCE(user_profile.comfortable_with, 'both')
    ) RETURNING id INTO new_ride_template;

    -- Trigger matching for existing ride_requests
    -- PERFORM generate_match_suggestions_for_ride_template(new_ride_template);

    RETURN json_build_object(
        'success', true,
        'ride_template_id', new_ride_template,
        'message', 'Ride template created successfully'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Function to create ride_request from profile (RIDER only)
-- Requires: prefer_taking_ride = true AND email_verified = true
CREATE OR REPLACE FUNCTION create_ride_request_from_profile(
    user_id UUID,
    p_preferred_arrival_time TIME,
    p_time_flexibility_mins INTEGER DEFAULT 15,
    p_vehicle_preference TEXT DEFAULT 'any',
    p_gender_preference TEXT DEFAULT 'both'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_profile RECORD;
    new_ride_request UUID;
    role_check BOOLEAN;
BEGIN
    -- Validate user role (must be rider)
    SELECT prefer_taking_ride INTO role_check
    FROM profiles
    WHERE id = user_id;

    IF role_check != true THEN
        RETURN json_build_object('success', false, 'error', 'Only riders can create ride requests');
    END IF;

    -- Get profile data
    SELECT * INTO user_profile
    FROM profiles
    WHERE id = user_id AND prefer_taking_ride = true;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Profile not found or not a rider');
    END IF;

    -- Check email verification
    IF user_profile.email_verified != true THEN
        RETURN json_build_object('success', false, 'error', 'Email verification required. Please verify your institutional email.');
    END IF;

    -- Validate required fields
    IF user_profile.from_lat IS NULL OR user_profile.from_lng IS NULL OR
       user_profile.to_lat IS NULL OR user_profile.to_lng IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Profile coordinates are required');
    END IF;

    IF user_profile.days_of_commute IS NULL OR array_length(user_profile.days_of_commute, 1) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Days of commute are required');
    END IF;

    -- Create ride_request
    INSERT INTO ride_requests (
        rider_id,
        pickup_location,
        pickup_lat,
        pickup_lng,
        pickup_point,
        pickup_landmark,
        destination_location,
        destination_lat,
        destination_lng,
        destination_point,
        preferred_arrival_time,
        time_flexibility_mins,
        days_needed,
        vehicle_preference,
        gender_preference
    ) VALUES (
        user_id,
        user_profile.from_location,
        user_profile.from_lat,
        user_profile.from_lng,
        ST_GeomFromText('POINT(' || user_profile.from_lng || ' ' || user_profile.from_lat || ')', 4326),
        user_profile.pickup_landmark,
        user_profile.to_location,
        user_profile.to_lat,
        user_profile.to_lng,
        ST_GeomFromText('POINT(' || user_profile.to_lng || ' ' || user_profile.to_lat || ')', 4326),
        p_preferred_arrival_time,
        p_time_flexibility_mins,
        user_profile.days_of_commute,
        p_vehicle_preference,
        p_gender_preference
    ) RETURNING id INTO new_ride_request;

    -- Trigger matching for existing ride_templates
    -- PERFORM generate_match_suggestions_for_ride_request(new_ride_request);

    RETURN json_build_object(
        'success', true,
        'ride_request_id', new_ride_request,
        'message', 'Ride request created successfully'
    );

    -- (No exception handling for debug purposes)
END;
$$;
