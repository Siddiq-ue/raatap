-- =================================================================
-- FIX: Remove duplicate ride_requests and their match_suggestions
-- =================================================================
-- PROBLEM: The requests/create and admin/verify-user routes had no
-- duplicate check, allowing multiple ride_requests per rider. This
-- caused duplicate match_suggestions for the same host-rider pair.
--
-- SOLUTION: 
-- 1. Delete match_suggestions referencing duplicate ride_requests
-- 2. Delete duplicate ride_requests, keeping only the oldest one
-- =================================================================

-- Step 1: Identify riders with duplicate active ride_requests
SELECT 
  rider_id,
  COUNT(*) as request_count,
  array_agg(id ORDER BY created_at ASC) as request_ids
FROM ride_requests
WHERE status = 'active'
GROUP BY rider_id
HAVING COUNT(*) > 1;

-- Step 2: Delete match_suggestions for the DUPLICATE (newer) ride_requests
-- Keep suggestions for the FIRST (oldest) request per rider
DELETE FROM match_suggestions
WHERE ride_request_id IN (
  SELECT id FROM (
    SELECT 
      id,
      rider_id,
      ROW_NUMBER() OVER (PARTITION BY rider_id ORDER BY created_at ASC) as rn
    FROM ride_requests
    WHERE status = 'active'
  ) ranked
  WHERE rn > 1
)
AND status = 'pending_host_approval';

-- Step 3: Delete the duplicate ride_requests themselves (keep oldest per rider)
DELETE FROM ride_requests
WHERE id IN (
  SELECT id FROM (
    SELECT 
      id,
      rider_id,
      ROW_NUMBER() OVER (PARTITION BY rider_id ORDER BY created_at ASC) as rn
    FROM ride_requests
    WHERE status = 'active'
  ) ranked
  WHERE rn > 1
);

-- Step 4: Verify — no rider should have more than 1 active request
SELECT 
  rider_id,
  COUNT(*) as request_count
FROM ride_requests
WHERE status = 'active'
GROUP BY rider_id
HAVING COUNT(*) > 1;
-- Expected: 0 rows
