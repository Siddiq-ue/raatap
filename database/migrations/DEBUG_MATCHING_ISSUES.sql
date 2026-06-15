-- ================================================================
-- MATCHING DEBUG - ANALYZE WHY RIDE_REQUESTS WERE NOT MATCHED
-- ================================================================
-- Run this to see exactly why each ride_request did/didn't get matches
-- ================================================================

-- ================================================================
-- 1. Check Active Requests
-- ================================================================

SELECT 
    id,
    rider_id,
    pickup_location,
    destination_location,
    gender_preference,
    vehicle_preference,
    status,
    created_at
FROM ride_requests 
WHERE status = 'active'
ORDER BY created_at DESC;


-- ================================================================
-- 2. Check Active Templates
-- ================================================================

SELECT 
    id,
    host_id,
    from_location,
    to_location,
    gender_preference,
    vehicle_type,
    status,
    created_at
FROM ride_templates 
WHERE status = 'active'
ORDER BY created_at DESC;


-- ================================================================
-- 3. Check Existing Matches
-- ================================================================

SELECT 
    ms.ride_request_id,
    ms.ride_template_id,
    ms.overall_score,
    ms.pickup_distance_meters,
    ms.overlapping_distance_meters,
    ms.status,
    rr.rider_id,
    rt.host_id
FROM match_suggestions ms
JOIN ride_requests rr ON ms.ride_request_id = rr.id
JOIN ride_templates rt ON ms.ride_template_id = rt.id
WHERE ms.status IN ('pending', 'shown', 'accepted')
ORDER BY ms.created_at DESC;


-- ================================================================
-- 4. Manual Match Test for Each Request
-- ================================================================
-- This will show you exactly why each request matches or fails

SELECT 
    rr.id as request_id,
    rr.rider_id,
    rr.pickup_location,
    rr.destination_location,
    rr.gender_preference as rider_gender,
    rt.id as template_id,
    rt.host_id,
    rt.from_location,
    rt.to_location,
    rt.gender_preference as host_gender,
    -- Test gender compatibility
    CASE 
        WHEN rt.gender_preference = 'both' OR rr.gender_preference = 'both' 
             OR rt.gender_preference = rr.gender_preference 
        THEN '✓ Gender OK'
        ELSE '✗ Gender MISMATCH'
    END as gender_check,
    -- Calculate pickup distance
    ROUND((ST_Distance(rt.from_point::geography, rr.pickup_point::geography) / 1000.0)::NUMERIC, 2) as pickup_km,
    -- Check if pickup is within 2km
    CASE 
        WHEN ST_Distance(rt.from_point::geography, rr.pickup_point::geography) <= 2000 
        THEN '✓ Within 2km'
        ELSE '✗ Too FAR (>2km)'
    END as pickup_check,
    -- Calculate angle difference
    ROUND((
        CASE 
            WHEN ABS(ST_Azimuth(rt.from_point::geography, rt.to_point::geography) * 180 / PI() 
                   - ST_Azimuth(rt.from_point::geography, rr.pickup_point::geography) * 180 / PI()) > 180
            THEN 360 - ABS(ST_Azimuth(rt.from_point::geography, rt.to_point::geography) * 180 / PI() 
                         - ST_Azimuth(rt.from_point::geography, rr.pickup_point::geography) * 180 / PI())
            ELSE ABS(ST_Azimuth(rt.from_point::geography, rt.to_point::geography) * 180 / PI() 
                   - ST_Azimuth(rt.from_point::geography, rr.pickup_point::geography) * 180 / PI())
        END
    )::NUMERIC, 0) as angle_degrees,
    -- Check if rider is on the way
    CASE 
        WHEN ABS(ST_Azimuth(rt.from_point::geography, rt.to_point::geography) * 180 / PI() 
               - ST_Azimuth(rt.from_point::geography, rr.pickup_point::geography) * 180 / PI()) <= 90
             OR 
             360 - ABS(ST_Azimuth(rt.from_point::geography, rt.to_point::geography) * 180 / PI() 
                     - ST_Azimuth(rt.from_point::geography, rr.pickup_point::geography) * 180 / PI()) <= 90
        THEN '✓ On the way'
        ELSE '✗ BEHIND host'
    END as on_the_way_check,
    -- Calculate destination distance
    ROUND((ST_Distance(rt.to_point::geography, rr.destination_point::geography) / 1000.0)::NUMERIC, 2) as dest_km,
    -- Check destination
    CASE 
        WHEN ST_Distance(rt.to_point::geography, rr.destination_point::geography) <= 1000 
        THEN '✓ Within 1km'
        ELSE '✗ Too FAR (>1km)'
    END as dest_check,
    -- Overall result
    CASE 
        WHEN (rt.gender_preference = 'both' OR rr.gender_preference = 'both' 
              OR rt.gender_preference = rr.gender_preference)
             AND ST_Distance(rt.from_point::geography, rr.pickup_point::geography) <= 2000
             AND (
                 ABS(ST_Azimuth(rt.from_point::geography, rt.to_point::geography) * 180 / PI() 
                   - ST_Azimuth(rt.from_point::geography, rr.pickup_point::geography) * 180 / PI()) <= 90
                 OR 
                 360 - ABS(ST_Azimuth(rt.from_point::geography, rt.to_point::geography) * 180 / PI() 
                         - ST_Azimuth(rt.from_point::geography, rr.pickup_point::geography) * 180 / PI()) <= 90
             )
             AND ST_Distance(rt.to_point::geography, rr.destination_point::geography) <= 1000
        THEN '✅ MATCH'
        ELSE '❌ NO MATCH'
    END as match_result
FROM ride_requests rr
CROSS JOIN ride_templates rt
WHERE rr.status = 'active' 
  AND rt.status = 'active'
  AND rr.rider_id != rt.host_id
ORDER BY rr.created_at DESC, rt.created_at DESC;


-- ================================================================
-- 5. Summary: Why Requests Didn't Match
-- ================================================================

SELECT 
    rr.id as request_id,
    rr.rider_id,
    rr.pickup_location,
    rr.destination_location,
    COUNT(ms.id) as matches_found,
    -- Count failure reasons
    COUNT(*) FILTER (
        WHERE rt.gender_preference != 'both' 
        AND rr.gender_preference != 'both'
        AND rt.gender_preference != rr.gender_preference
    ) as gender_mismatches,
    COUNT(*) FILTER (
        WHERE ST_Distance(rt.from_point::geography, rr.pickup_point::geography) > 2000
    ) as too_far_pickup,
    COUNT(*) FILTER (
        WHERE (
            ABS(ST_Azimuth(rt.from_point::geography, rt.to_point::geography) * 180 / PI() 
              - ST_Azimuth(rt.from_point::geography, rr.pickup_point::geography) * 180 / PI()) > 90
            AND 
            360 - ABS(ST_Azimuth(rt.from_point::geography, rt.to_point::geography) * 180 / PI() 
                    - ST_Azimuth(rt.from_point::geography, rr.pickup_point::geography) * 180 / PI()) > 90
        )
    ) as behind_host,
    COUNT(*) FILTER (
        WHERE ROUND((ST_Distance(rt.to_point::geography, rr.destination_point::geography))::NUMERIC, 0) > 1000
    ) as too_far_destination
FROM ride_requests rr
LEFT JOIN match_suggestions ms ON ms.ride_request_id = rr.id AND ms.status = 'pending'
LEFT JOIN ride_templates rt ON rt.id = ms.ride_template_id
WHERE rr.status = 'active'
GROUP BY rr.id, rr.rider_id, rr.pickup_location, rr.destination_location
ORDER BY matches_found ASC, rr.created_at DESC;


-- ================================================================
-- 6. Check Debug Log (if it exists)
-- ================================================================

SELECT 
    request_id,
    template_id,
    gender_check,
    ROUND((pickup_distance_meters / 1000.0)::NUMERIC, 2) as pickup_km,
    ROUND((angle_difference)::NUMERIC, 0) as angle_deg,
    ROUND((destination_distance_meters / 1000.0)::NUMERIC, 2) as dest_km,
    match_result->>'error' as failure_reason,
    match_result->>'match_score' as score,
    match_result->>'pickup_km' as actual_pickup,
    match_result->>'destination_km' as actual_dest,
    match_result->>'overlap_km' as overlap
FROM match_debug_log
ORDER BY created_at DESC
LIMIT 50;


-- ================================================================
-- 7. Test Specific Request (Replace with your request ID)
-- ================================================================
-- Uncomment and replace 'YOUR-REQUEST-ID' with an actual request ID

/*
SELECT calculate_route_match_score(
    'TEMPLATE-ID-HERE',
    'YOUR-REQUEST-ID-HERE'
) as match_result;
*/


-- ================================================================
-- 8. Quick Summary
-- ================================================================

SELECT 
    'Active Requests' as category,
    COUNT(*) as count
FROM ride_requests WHERE status = 'active'
UNION ALL
SELECT 
    'Active Templates',
    COUNT(*)
FROM ride_templates WHERE status = 'active'
UNION ALL
SELECT 
    'Pending Matches',
    COUNT(*)
FROM match_suggestions WHERE status = 'pending'
UNION ALL
SELECT 
    'Requests with NO matches',
    COUNT(DISTINCT rr.id)
FROM ride_requests rr
LEFT JOIN match_suggestions ms ON ms.ride_request_id = rr.id AND ms.status = 'pending'
WHERE rr.status = 'active' AND ms.id IS NULL;
