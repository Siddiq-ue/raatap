-- Updated match scoring with proper overlapping distance calculation
-- This replaces the logic in COMPLETE_MATCHING_UPDATE.sql

CREATE OR REPLACE FUNCTION calculate_route_match_score_v2(
  p_ride_template_id UUID,
  p_ride_request_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_template RECORD;
  v_ride_request RECORD;
  
  -- Distance variables
  v_pickup_distance NUMERIC;
  v_destination_distance NUMERIC;
  v_host_route_distance NUMERIC;
  v_overlapping_distance NUMERIC;
  v_overlap_ratio NUMERIC;
  
  -- Score variables
  v_match_score NUMERIC;
  v_gender_compatible BOOLEAN := TRUE;
  v_same_college BOOLEAN := FALSE;
  v_compatible BOOLEAN := TRUE;
  v_reason VARCHAR := 'Compatible route found';
  
  -- Angle/bearing variables
  v_host_bearing NUMERIC;
  v_rider_angle NUMERIC;
  v_angle_diff NUMERIC;
  
  -- Constants
  c_max_detour_meters CONSTANT NUMERIC := 2000;
  c_max_destination_meters CONSTANT NUMERIC := 1000;
BEGIN
  -- Fetch host template
  SELECT 
    rt.id,
    rt.from_point,
    rt.to_point,
    rt.gender_preference,
    rt.institution,
    ST_Distance(rt.from_point::geography, rt.to_point::geography, true) as route_distance
  INTO v_template
  FROM ride_templates rt
  WHERE rt.id = p_ride_template_id;
  
  -- Fetch rider request
  SELECT 
    rr.id,
    rr.pickup_point,
    rr.destination_point,
    rr.gender_preference,
    rr.institution,
    rr.drop_point
  INTO v_ride_request
  FROM ride_requests rr
  WHERE rr.id = p_ride_request_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'compatible', false,
      'reason', 'Template or request not found'
    );
  END IF;
  
  -- Calculate pickup distance (from host start to rider pickup)
  v_pickup_distance := ST_Distance(
    v_template.from_point::geography, 
    COALESCE(v_ride_request.pickup_point, v_ride_request.destination_point)::geography, 
    true
  );
  
  -- Calculate destination distance (from host end to rider destination)
  v_destination_distance := ST_Distance(
    v_template.to_point::geography, 
    COALESCE(v_ride_request.destination_point, v_ride_request.drop_point)::geography, 
    true
  );
  
  v_host_route_distance := v_template.route_distance;
  
  -- 1. GENDER COMPATIBILITY CHECK
  IF v_template.gender_preference != 'both' AND v_ride_request.gender_preference != 'both' THEN
    IF v_template.gender_preference != v_ride_request.gender_preference THEN
      v_gender_compatible := FALSE;
      v_compatible := FALSE;
      v_reason := 'Gender preference mismatch';
    END IF;
  END IF;
  
  -- 2. PICKUP DISTANCE CHECK
  IF v_pickup_distance > c_max_detour_meters THEN
    v_compatible := FALSE;
    v_reason := format('Pickup too far (%skm)', ROUND(v_pickup_distance/1000, 2));
  END IF;
  
  -- 3. DESTINATION DISTANCE CHECK
  IF v_destination_distance > c_max_destination_meters THEN
    v_compatible := FALSE;
    v_reason := format('Destination too far (%skm)', ROUND(v_destination_distance/1000, 2));
  END IF;
  
  -- 4. SAME COLLEGE CHECK
  IF v_template.institution IS NOT NULL AND v_ride_request.institution IS NOT NULL THEN
    v_same_college := LOWER(TRIM(v_template.institution)) = LOWER(TRIM(v_ride_request.institution));
  END IF;
  
  -- 5. PROPER OVERLAPPING DISTANCE CALCULATION
  -- Use the actual route points to calculate shared distance
  v_overlapping_distance := calculate_overlapping_distance(
    ST_Y(v_template.from_point::geometry),  -- host_from_lat
    ST_X(v_template.from_point::geometry),  -- host_from_lng
    ST_Y(v_template.to_point::geometry),    -- host_to_lat
    ST_X(v_template.to_point::geometry),    -- host_to_lng
    ST_Y(COALESCE(v_ride_request.pickup_point, v_ride_request.destination_point)::geometry),  -- rider_pickup_lat
    ST_X(COALESCE(v_ride_request.pickup_point, v_ride_request.destination_point)::geometry),  -- rider_pickup_lng
    ST_Y(COALESCE(v_ride_request.destination_point, v_ride_request.drop_point)::geometry),   -- rider_dest_lat
    ST_X(COALESCE(v_ride_request.destination_point, v_ride_request.drop_point)::geometry)    -- rider_dest_lng
  );
  
  -- Calculate overlap ratio based on actual overlapping distance
  IF v_host_route_distance > 0 THEN
    v_overlap_ratio := ROUND(v_overlapping_distance / v_host_route_distance, 4);
  ELSE
    v_overlap_ratio := 0;
  END IF;
  
  -- Clamp overlap ratio
  v_overlap_ratio := GREATEST(0, LEAST(1, v_overlap_ratio));
  
  -- 6. CALCULATE MATCH SCORE
  IF v_compatible THEN
    v_match_score := (
      (1.0 - (v_pickup_distance / c_max_detour_meters)) * 0.50 +
      (1.0 - (v_destination_distance / c_max_destination_meters)) * 0.30 +
      v_overlap_ratio * 0.20
    ) * 100;
    
    -- Add college bonus
    IF v_same_college THEN
      v_match_score := v_match_score + 10;
    END IF;
    
    v_match_score := GREATEST(0, LEAST(110, v_match_score));
    v_match_score := ROUND(v_match_score, 2);
  ELSE
    v_match_score := 0;
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'compatible', v_compatible,
    'match_score', v_match_score,
    'pickup_distance_meters', ROUND(v_pickup_distance),
    'pickup_distance_km', ROUND(v_pickup_distance / 1000.0, 2),
    'destination_distance_meters', ROUND(v_destination_distance),
    'destination_distance_km', ROUND(v_destination_distance / 1000.0, 2),
    'overlapping_distance_meters', ROUND(v_overlapping_distance),
    'overlapping_distance_km', ROUND(v_overlapping_distance / 1000.0, 2),
    'overlap_ratio', v_overlap_ratio,
    'host_route_distance_meters', ROUND(v_host_route_distance),
    'host_route_distance_km', ROUND(v_host_route_distance / 1000.0, 2),
    'same_college', v_same_college,
    'reason', v_reason
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
