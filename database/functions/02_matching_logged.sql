-- Core PostGIS matching function WITH LOGGING
CREATE OR REPLACE FUNCTION calculate_route_match_score(
    template_id UUID,
    request_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    template RECORD;
    ride_request RECORD;
    host_route_line GEOMETRY;
    route_distance NUMERIC;
    pickup_distance NUMERIC;
    time_compatibility NUMERIC;
    day_overlap NUMERIC;
    route_match_score NUMERIC;
    schedule_match_score NUMERIC;
    overall_score NUMERIC;
    gender_compatible BOOLEAN;
    vehicle_compatible BOOLEAN;
    days_overlap_count INTEGER;
    total_days INTEGER;
    time_diff_minutes INTEGER;
    time_window_minutes INTEGER;
    log_id UUID;
BEGIN
    -- Log function entry
    log_id := log_activity(
        'DEBUG',
        'calculate_route_match_score',
        'Starting match calculation',
        NULL,
        'match',
        NULL,
        jsonb_build_object('template_id', template_id, 'request_id', request_id)
    );

    -- Get ride template
    SELECT * INTO template
    FROM ride_templates
    WHERE id = template_id AND status = 'active';

    IF NOT FOUND THEN
        -- Log error: template not found
        PERFORM log_error(
            p_function_name := 'calculate_route_match_score',
            p_action := 'Template not found or inactive',
            p_error_message := 'Template ID not found or not active',
            p_user_id := NULL,
            p_entity_type := 'ride_template',
            p_entity_id := template_id,
            p_details := jsonb_build_object('request_id', request_id)
        );
        
        RETURN json_build_object('compatible', false, 'reason', 'Template not found or inactive');
    END IF;

    -- Log template found
    PERFORM log_activity(
        'DEBUG',
        'calculate_route_match_score',
        'Template found',
        template.host_id,
        'ride_template',
        template_id,
        jsonb_build_object(
            'from_location', template.from_location,
            'to_location', template.to_location,
            'departure_time', template.departure_time,
            'days_available', template.days_available
        )
    );

    -- Get ride request
    SELECT * INTO ride_request
    FROM ride_requests
    WHERE id = request_id AND status = 'active';

    IF NOT FOUND THEN
        -- Log error: request not found
        PERFORM log_error(
            p_function_name := 'calculate_route_match_score',
            p_action := 'Request not found or inactive',
            p_error_message := 'Request ID not found or not active',
            p_user_id := NULL,
            p_entity_type := 'ride_request',
            p_entity_id := request_id,
            p_details := jsonb_build_object('template_id', template_id)
        );
        
        RETURN json_build_object('compatible', false, 'reason', 'Request not found or inactive');
    END IF;

    -- Log request found
    PERFORM log_activity(
        'DEBUG',
        'calculate_route_match_score',
        'Request found',
        ride_request.rider_id,
        'ride_request',
        request_id,
        jsonb_build_object(
            'pickup_location', ride_request.pickup_location,
            'drop_location', ride_request.drop_location,
            'preferred_arrival_time', ride_request.preferred_arrival_time
        )
    );

    -- Check gender compatibility
    gender_compatible := (
        (template.gender_preference = 'both') OR
        (template.gender_preference = ride_request.gender_preference) OR
        (ride_request.gender_preference = 'both') OR
        (ride_request.gender_preference = template.gender_preference)
    );

    IF NOT gender_compatible THEN
        -- Log gender mismatch
        PERFORM log_activity(
            'INFO',
            'calculate_route_match_score',
            'Gender preference mismatch',
            NULL,
            'match',
            NULL,
            jsonb_build_object(
                'template_id', template_id,
                'request_id', request_id,
                'template_gender', template.gender_preference,
                'request_gender', ride_request.gender_preference
            )
        );
        
        RETURN json_build_object('compatible', false, 'reason', 'Gender preference mismatch');
    END IF;

    -- Check vehicle compatibility
    vehicle_compatible := (
        ride_request.vehicle_preference = 'any' OR
        ride_request.vehicle_preference = template.vehicle_type
    );

    IF NOT vehicle_compatible THEN
        -- Log vehicle mismatch
        PERFORM log_activity(
            'INFO',
            'calculate_route_match_score',
            'Vehicle preference mismatch',
            NULL,
            'match',
            NULL,
            jsonb_build_object(
                'template_id', template_id,
                'request_id', request_id,
                'template_vehicle', template.vehicle_type,
                'request_vehicle', ride_request.vehicle_preference
            )
        );
        
        RETURN json_build_object('compatible', false, 'reason', 'Vehicle preference mismatch');
    END IF;

    -- Create host route line (from → to)
    host_route_line := ST_MakeLine(template.from_point::geometry, template.to_point::geometry);

    -- Calculate pickup distance from rider pickup to host route
    pickup_distance := ST_Distance(
        ride_request.pickup_point::geography,
        host_route_line::geography,
        true -- use_spheroid
    );

    -- Log pickup distance
    PERFORM log_activity(
        'DEBUG',
        'calculate_route_match_score',
        'Calculated pickup distance',
        NULL,
        'match',
        NULL,
        jsonb_build_object(
            'template_id', template_id,
            'request_id', request_id,
            'pickup_distance_meters', ROUND(pickup_distance),
            'max_detour_meters', template.max_detour_meters
        )
    );

    -- Check if pickup is within max detour
    IF pickup_distance > template.max_detour_meters THEN
        -- Log detour too far
        PERFORM log_activity(
            'INFO',
            'calculate_route_match_score',
            'Pickup too far from route',
            NULL,
            'match',
            NULL,
            jsonb_build_object(
                'template_id', template_id,
                'request_id', request_id,
                'pickup_distance_meters', ROUND(pickup_distance),
                'max_detour_meters', template.max_detour_meters,
                'excess_meters', ROUND(pickup_distance - template.max_detour_meters)
            )
        );
        
        RETURN json_build_object(
            'compatible', false, 
            'reason', 'Pickup too far from route', 
            'distance', pickup_distance
        );
    END IF;

    -- Calculate day overlap
    days_overlap_count := (
        SELECT array_length(
            ARRAY(
                SELECT unnest(template.days_available)
                INTERSECT
                SELECT unnest(ride_request.days_needed)
            ), 1
        )
    );

    total_days := GREATEST(
        array_length(template.days_available, 1),
        array_length(ride_request.days_needed, 1)
    );

    IF days_overlap_count IS NULL OR days_overlap_count = 0 THEN
        -- Log no day overlap
        PERFORM log_activity(
            'INFO',
            'calculate_route_match_score',
            'No overlapping days',
            NULL,
            'match',
            NULL,
            jsonb_build_object(
                'template_id', template_id,
                'request_id', request_id,
                'template_days', template.days_available,
                'request_days', ride_request.days_needed
            )
        );
        
        RETURN json_build_object('compatible', false, 'reason', 'No overlapping days');
    END IF;

    day_overlap := days_overlap_count::NUMERIC / total_days::NUMERIC;

    -- Log day overlap
    PERFORM log_activity(
        'DEBUG',
        'calculate_route_match_score',
        'Day overlap calculated',
        NULL,
        'match',
        NULL,
        jsonb_build_object(
            'template_id', template_id,
            'request_id', request_id,
            'overlap_count', days_overlap_count,
            'total_days', total_days,
            'overlap_ratio', ROUND(day_overlap::NUMERIC, 2)
        )
    );

    -- Calculate time compatibility
    time_diff_minutes := ABS(
        EXTRACT(HOUR FROM template.departure_time) * 60 +
        EXTRACT(MINUTE FROM template.departure_time) -
        (EXTRACT(HOUR FROM ride_request.preferred_arrival_time) * 60 +
        EXTRACT(MINUTE FROM ride_request.preferred_arrival_time))
    );

    time_window_minutes := ride_request.time_flexibility_mins;

    IF time_diff_minutes > time_window_minutes THEN
        -- Check if departure is after preferred arrival (invalid case)
        IF template.departure_time > ride_request.preferred_arrival_time THEN
            -- Log time mismatch
            PERFORM log_activity(
                'INFO',
                'calculate_route_match_score',
                'Departure after preferred arrival',
                NULL,
                'match',
                NULL,
                jsonb_build_object(
                    'template_id', template_id,
                    'request_id', request_id,
                    'departure_time', template.departure_time,
                    'preferred_arrival_time', ride_request.preferred_arrival_time
                )
            );
            
            RETURN json_build_object('compatible', false, 'reason', 'Departure after preferred arrival');
        END IF;
    END IF;

    -- Time score: perfect if within flexibility, decreases linearly outside
    IF time_diff_minutes <= time_window_minutes THEN
        time_compatibility := 1.0;
    ELSE
        time_compatibility := GREATEST(0, 1.0 - (time_diff_minutes - time_window_minutes)::NUMERIC / 60.0);
    END IF;

    -- Log time compatibility
    PERFORM log_activity(
        'DEBUG',
        'calculate_route_match_score',
        'Time compatibility calculated',
        NULL,
        'match',
        NULL,
        jsonb_build_object(
            'template_id', template_id,
            'request_id', request_id,
            'time_diff_minutes', time_diff_minutes,
            'flexibility_minutes', time_window_minutes,
            'time_compatibility', ROUND(time_compatibility::NUMERIC, 2)
        )
    );

    -- Route match score: better for closer pickup points
    route_match_score := GREATEST(0, 1.0 - (pickup_distance::NUMERIC / template.max_detour_meters::NUMERIC));

    -- Schedule match score: weighted average of time and day compatibility
    schedule_match_score := (time_compatibility * 0.7 + day_overlap * 0.3);

    -- Overall score: weighted average
    -- Route: 85% (hard to change), Schedule: 15% (people can adjust timing)
    overall_score := (route_match_score * 0.85 + schedule_match_score * 0.15);

    -- Log final scores
    PERFORM log_activity(
        'INFO',
        'calculate_route_match_score',
        'Match calculation completed',
        NULL,
        'match',
        NULL,
        jsonb_build_object(
            'template_id', template_id,
            'request_id', request_id,
            'route_match_score', ROUND(route_match_score::NUMERIC, 3),
            'schedule_match_score', ROUND(schedule_match_score::NUMERIC, 3),
            'overall_score', ROUND(overall_score::NUMERIC, 3),
            'pickup_distance_meters', ROUND(pickup_distance),
            'day_overlap', ROUND(day_overlap::NUMERIC, 2),
            'time_compatibility', ROUND(time_compatibility::NUMERIC, 2),
            'compatible', true
        )
    );

    RETURN json_build_object(
        'compatible', true,
        'route_match_score', route_match_score,
        'schedule_match_score', schedule_match_score,
        'overall_score', overall_score,
        'pickup_distance_meters', ROUND(pickup_distance),
        'day_overlap', day_overlap,
        'time_compatibility', time_compatibility,
        'days_overlap_count', days_overlap_count
    );

EXCEPTION WHEN OTHERS THEN
    -- Log unexpected error
    PERFORM log_error(
        p_function_name := 'calculate_route_match_score',
        p_action := 'Unexpected error in match calculation',
        p_error_message := SQLERRM,
        p_user_id := NULL,
        p_entity_type := 'match',
        p_entity_id := NULL,
        p_details := jsonb_build_object(
            'template_id', template_id,
            'request_id', request_id,
            'sql_state', SQLSTATE
        )
    );
    
    RETURN json_build_object(
        'compatible', false, 
        'reason', 'Internal error during match calculation',
        'error', SQLERRM
    );
END;
$$;
