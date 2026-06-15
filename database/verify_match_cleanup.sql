-- ================================================================
-- VERIFY: Match Suggestions Cleanup for Unverified Users
-- ================================================================
-- Run this in Supabase SQL Editor to confirm cleanup worked
-- ================================================================

-- -------------------------------------------------------------
-- Query 1: Check for ANY pending/shown matches involving unverified users
-- -------------------------------------------------------------
-- Should return 0 rows if cleanup was successful

SELECT 
  ms.id as match_id,
  ms.status,
  ms.overall_score,
  'UNVERIFIED HOST' as issue_type,
  p.id as user_id,
  p.email_verified,
  rt.id as template_id
FROM match_suggestions ms
JOIN ride_templates rt ON rt.id = ms.ride_template_id
JOIN profiles p ON p.id = rt.host_id
WHERE ms.status IN ('pending', 'shown', 'pending_host_approval', 'pending_rider_approval')
  AND p.email_verified IS NOT TRUE

UNION ALL

SELECT 
  ms.id as match_id,
  ms.status,
  ms.overall_score,
  'UNVERIFIED RIDER' as issue_type,
  p.id as user_id,
  p.email_verified,
  rr.id as request_id
FROM match_suggestions ms
JOIN ride_requests rr ON rr.id = ms.ride_request_id
JOIN profiles p ON p.id = rr.rider_id
WHERE ms.status IN ('pending', 'shown', 'pending_host_approval', 'pending_rider_approval')
  AND p.email_verified IS NOT TRUE;

-- Expected: 0 rows (no matches with unverified users)


-- -------------------------------------------------------------
-- Query 2: Count matches by verification status
-- -------------------------------------------------------------
-- Shows breakdown of matches involving verified vs unverified users

SELECT
  'Matches with UNVERIFIED HOST' as category,
  COUNT(*) as count
FROM match_suggestions ms
JOIN ride_templates rt ON rt.id = ms.ride_template_id
JOIN profiles p ON p.id = rt.host_id
WHERE p.email_verified IS NOT TRUE

UNION ALL

SELECT
  'Matches with UNVERIFIED RIDER' as category,
  COUNT(*) as count
FROM match_suggestions ms
JOIN ride_requests rr ON rr.id = ms.ride_request_id
JOIN profiles p ON p.id = rr.rider_id
WHERE p.email_verified IS NOT TRUE

UNION ALL

SELECT
  'Matches with VERIFIED HOST' as category,
  COUNT(*) as count
FROM match_suggestions ms
JOIN ride_templates rt ON rt.id = ms.ride_template_id
JOIN profiles p ON p.id = rt.host_id
WHERE p.email_verified = TRUE

UNION ALL

SELECT
  'Matches with VERIFIED RIDER' as category,
  COUNT(*) as count
FROM match_suggestions ms
JOIN ride_requests rr ON rr.id = ms.ride_request_id
JOIN profiles p ON p.id = rr.rider_id
WHERE p.email_verified = TRUE;

-- Expected: 0 for unverified, >0 for verified


-- -------------------------------------------------------------
-- Query 3: Check match suggestions for the 13 unverified users
-- -------------------------------------------------------------
-- Specifically checks matches for your unverified users

SELECT 
  p.id as user_id,
  p.email_verified,
  COUNT(DISTINCT ms.id) as match_count,
  COUNT(DISTINCT CASE WHEN rt.host_id = p.id THEN ms.id END) as matches_as_host,
  COUNT(DISTINCT CASE WHEN rr.rider_id = p.id THEN ms.id END) as matches_as_rider
FROM profiles p
LEFT JOIN ride_templates rt ON rt.host_id = p.id
LEFT JOIN ride_requests rr ON rr.rider_id = p.id
LEFT JOIN match_suggestions ms ON (ms.ride_template_id = rt.id OR ms.ride_request_id = rr.id)
WHERE p.email_verified IS NOT TRUE
GROUP BY p.id, p.email_verified
ORDER BY match_count DESC;

-- Expected: All counts should be 0


-- -------------------------------------------------------------
-- Query 4: Summary Report
-- -------------------------------------------------------------
-- Quick overview of current state

SELECT 
  'VERIFICATION CLEANUP SUMMARY' as report_title,
  (SELECT COUNT(*) FROM profiles WHERE email_verified IS NOT TRUE) as unverified_users,
  (SELECT COUNT(*) FROM profiles WHERE email_verified = TRUE) as verified_users,
  (SELECT COUNT(*) FROM match_suggestions WHERE status IN ('pending', 'shown')) as total_pending_matches,
  (
    -- Count matches where BOTH host AND rider are verified
    SELECT COUNT(*) 
    FROM match_suggestions ms
    JOIN ride_templates rt ON rt.id = ms.ride_template_id
    JOIN ride_requests rr ON rr.id = ms.ride_request_id
    JOIN profiles host_p ON host_p.id = rt.host_id
    JOIN profiles rider_p ON rider_p.id = rr.rider_id
    WHERE ms.status IN ('pending', 'shown')
      AND host_p.email_verified = TRUE
      AND rider_p.email_verified = TRUE
  ) as matches_between_verified_users,
  (
    -- Count matches where EITHER host OR rider is unverified (should be 0!)
    SELECT COUNT(*) 
    FROM match_suggestions ms
    JOIN ride_templates rt ON rt.id = ms.ride_template_id
    JOIN ride_requests rr ON rr.id = ms.ride_request_id
    JOIN profiles host_p ON host_p.id = rt.host_id
    JOIN profiles rider_p ON rider_p.id = rr.rider_id
    WHERE ms.status IN ('pending', 'shown')
      AND (host_p.email_verified IS NOT TRUE OR rider_p.email_verified IS NOT TRUE)
  ) as matches_involving_unverified_users;

-- Expected: 
-- - matches_between_verified_users: >0 (your 22 pending matches)
-- - matches_involving_unverified_users: 0 (cleanup was successful!)


-- -------------------------------------------------------------
-- Query 5: Activity Logs (if cleanup was logged)
-- -------------------------------------------------------------
-- Check if there are any logs about match deletion

SELECT 
  log_time,
  action,
  entity_type,
  entity_id,
  details
FROM activity_logs
WHERE action ILIKE '%delete%' 
  AND entity_type = 'match_suggestion'
ORDER BY log_time DESC
LIMIT 20;

-- This will show deletion logs if they were captured
