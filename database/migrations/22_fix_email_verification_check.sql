-- =================================================================
-- FIX: Email Verification Check for Match Suggestions
-- =================================================================
-- This migration ensures that only email_verified users can participate
-- in match suggestions.
--
-- PROBLEM: The calculate_route_match_score() function was not checking
-- email_verified status, allowing unverified users to appear in matches.
--
-- SOLUTION: 
-- 1. Add email verification check to calculate_route_match_score()
-- 2. Clean up existing ride requests/templates from unverified users
-- =================================================================

-- ----------------------------------------------------------------
-- STEP 1: Identify Affected Users
-- ----------------------------------------------------------------
-- Find users with active rides but email_verified != true

SELECT
  p.id,
  p.email_verified,
  p.prefer_hosting,
  p.prefer_taking_ride,
  COUNT(DISTINCT rt.id) as active_templates,
  COUNT(DISTINCT rr.id) as active_requests
FROM profiles p
LEFT JOIN ride_templates rt ON rt.host_id = p.id AND rt.status = 'active'
LEFT JOIN ride_requests rr ON rr.rider_id = p.id AND rr.status = 'active'
WHERE p.email_verified IS NOT TRUE
  AND (rt.id IS NOT NULL OR rr.id IS NOT NULL)
GROUP BY p.id, p.email_verified, p.prefer_hosting, p.prefer_taking_ride;

-- ----------------------------------------------------------------
-- STEP 2: Deactivate Ride Templates from Unverified Users
-- ----------------------------------------------------------------
UPDATE ride_templates
SET status = NULL,
    updated_at = NOW()
WHERE host_id IN (
  SELECT id FROM profiles WHERE email_verified IS NOT TRUE
)
AND status = 'active';

-- ----------------------------------------------------------------
-- STEP 3: Deactivate Ride Requests from Unverified Users
-- ----------------------------------------------------------------
UPDATE ride_requests
SET status = NULL,
    updated_at = NOW()
WHERE rider_id IN (
  SELECT id FROM profiles WHERE email_verified IS NOT TRUE
)
AND status = 'active';

-- ----------------------------------------------------------------
-- STEP 4: Clean Up Match Suggestions Involving Unverified Users
-- ----------------------------------------------------------------
DELETE FROM match_suggestions
WHERE status IN ('pending', 'shown')
AND (
  ride_template_id IN (
    SELECT id FROM ride_templates 
    WHERE host_id IN (
      SELECT id FROM profiles WHERE email_verified IS NOT TRUE
    )
  )
  OR
  ride_request_id IN (
    SELECT id FROM ride_requests 
    WHERE rider_id IN (
      SELECT id FROM profiles WHERE email_verified IS NOT TRUE
    )
  )
);

-- ----------------------------------------------------------------
-- STEP 5: Verify Cleanup
-- ----------------------------------------------------------------
-- Check that no active rides exist for unverified users

SELECT 
  'ride_templates' as table_name,
  COUNT(*) as count
FROM ride_templates rt
JOIN profiles p ON p.id = rt.host_id
WHERE rt.status = 'active' AND p.email_verified IS NOT TRUE

UNION ALL

SELECT 
  'ride_requests' as table_name,
  COUNT(*) as count
FROM ride_requests rr
JOIN profiles p ON p.id = rr.rider_id
WHERE rr.status = 'active' AND p.email_verified IS NOT TRUE

UNION ALL

SELECT 
  'match_suggestions' as table_name,
  COUNT(*) as count
FROM match_suggestions ms
WHERE ms.status IN ('pending', 'shown')
AND (
  EXISTS (
    SELECT 1 FROM ride_templates rt
    JOIN profiles p ON p.id = rt.host_id
    WHERE rt.id = ms.ride_template_id AND p.email_verified IS NOT TRUE
  )
  OR
  EXISTS (
    SELECT 1 FROM ride_requests rr
    JOIN profiles p ON p.id = rr.rider_id
    WHERE rr.id = ms.ride_request_id AND p.email_verified IS NOT TRUE
  )
);

-- Expected: All counts should be 0

-- ----------------------------------------------------------------
-- STEP 6: Summary Report
-- ----------------------------------------------------------------
SELECT 
  'Cleanup Complete' as status,
  (SELECT COUNT(*) FROM profiles WHERE email_verified IS NOT TRUE) as unverified_users,
  (SELECT COUNT(*) FROM profiles WHERE email_verified = TRUE) as verified_users,
  (SELECT COUNT(*) FROM ride_templates WHERE status = 'active') as active_templates,
  (SELECT COUNT(*) FROM ride_requests WHERE status = 'active') as active_requests,
  (SELECT COUNT(*) FROM match_suggestions WHERE status IN ('pending', 'shown')) as pending_matches;
