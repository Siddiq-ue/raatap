-- ================================================================
-- DELETE Match Suggestions for Unverified Users
-- ================================================================
-- Run this in Supabase SQL Editor to clean up remaining matches
-- ================================================================

-- -------------------------------------------------------------
-- STEP 1: Check what exists BEFORE deletion
-- -------------------------------------------------------------
SELECT 
  'BEFORE CLEANUP' as status,
  COUNT(*) as total_matches,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM ride_templates rt
      JOIN profiles p ON p.id = rt.host_id
      WHERE rt.id = match_suggestions.ride_template_id 
        AND p.email_verified IS NOT TRUE
    )
  ) as matches_with_unverified_host,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM ride_requests rr
      JOIN profiles p ON p.id = rr.rider_id
      WHERE rr.id = match_suggestions.ride_request_id 
        AND p.email_verified IS NOT TRUE
    )
  ) as matches_with_unverified_rider
FROM match_suggestions
WHERE status IN ('pending', 'shown', 'pending_host_approval', 'pending_rider_approval');


-- -------------------------------------------------------------
-- STEP 2: DELETE matches involving unverified users
-- -------------------------------------------------------------
-- This deletes ALL pending/shown matches where EITHER host OR rider is unverified

DELETE FROM match_suggestions
WHERE status IN ('pending', 'shown', 'pending_host_approval', 'pending_rider_approval')
AND (
  -- Unverified HOST
  ride_template_id IN (
    SELECT rt.id FROM ride_templates rt
    JOIN profiles p ON p.id = rt.host_id
    WHERE p.email_verified IS NOT TRUE
  )
  OR
  -- Unverified RIDER
  ride_request_id IN (
    SELECT rr.id FROM ride_requests rr
    JOIN profiles p ON p.id = rr.rider_id
    WHERE p.email_verified IS NOT TRUE
  )
);


-- -------------------------------------------------------------
-- STEP 3: Verify deletion worked
-- -------------------------------------------------------------
SELECT 
  'AFTER CLEANUP' as status,
  COUNT(*) as total_matches,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM ride_templates rt
      JOIN profiles p ON p.id = rt.host_id
      WHERE rt.id = match_suggestions.ride_template_id 
        AND p.email_verified IS NOT TRUE
    )
  ) as matches_with_unverified_host,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM ride_requests rr
      JOIN profiles p ON p.id = rr.rider_id
      WHERE rr.id = match_suggestions.ride_request_id 
        AND p.email_verified IS NOT TRUE
    )
  ) as matches_with_unverified_rider
FROM match_suggestions
WHERE status IN ('pending', 'shown', 'pending_host_approval', 'pending_rider_approval');

-- Expected: All counts should be 0


-- -------------------------------------------------------------
-- STEP 4: Show remaining matches (should all be verified users)
-- -------------------------------------------------------------
SELECT 
  ms.id as match_id,
  ms.status,
  ms.overall_score,
  host_p.email_verified as host_verified,
  rider_p.email_verified as rider_verified
FROM match_suggestions ms
JOIN ride_templates rt ON rt.id = ms.ride_template_id
JOIN ride_requests rr ON rr.id = ms.ride_request_id
JOIN profiles host_p ON host_p.id = rt.host_id
JOIN profiles rider_p ON rider_p.id = rr.rider_id
WHERE ms.status IN ('pending', 'shown', 'pending_host_approval', 'pending_rider_approval')
ORDER BY ms.overall_score DESC
LIMIT 10;

-- All should show host_verified = true AND rider_verified = true
