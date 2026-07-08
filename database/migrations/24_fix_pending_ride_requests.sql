-- =================================================================
-- FIX: Update ride_requests with status='pending' to status='active'
-- =================================================================
-- PROBLEM: The OTP verify and admin verify routes were inserting
-- ride_requests with status='pending', but the find_intersecting_requests
-- SQL function only looks for status='active'. This made new riders
-- completely invisible to the matching engine.
--
-- SOLUTION: Update all 'pending' ride_requests for verified users to
-- 'active' so they can be discovered by the spatial matching function.
-- =================================================================

-- Step 1: Show affected records before fix
SELECT 
  'Before Fix' as phase,
  COUNT(*) as pending_requests,
  COUNT(*) FILTER (WHERE p.email_verified = TRUE) as from_verified_users
FROM ride_requests rr
JOIN profiles p ON p.id = rr.rider_id
WHERE rr.status = 'pending';

-- Step 2: Update pending ride_requests to active (only for verified users)
UPDATE ride_requests
SET status = 'active',
    updated_at = NOW()
WHERE status = 'pending'
  AND rider_id IN (
    SELECT id FROM profiles WHERE email_verified = TRUE
  );

-- Step 3: Verify the fix
SELECT 
  'After Fix' as phase,
  COUNT(*) FILTER (WHERE rr.status = 'active') as active_requests,
  COUNT(*) FILTER (WHERE rr.status = 'pending') as remaining_pending_requests
FROM ride_requests rr
JOIN profiles p ON p.id = rr.rider_id
WHERE p.email_verified = TRUE;
