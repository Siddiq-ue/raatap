-- Backfill ride_requests for all email_verified riders who don't have one
-- Run this in Supabase SQL Editor

-- Insert ride_requests for verified riders without existing requests
INSERT INTO ride_requests (
  rider_id,
  pickup_location,
  pickup_lat,
  pickup_lng,
  pickup_point,
  destination_location,
  destination_lat,
  destination_lng,
  destination_point,
  preferred_arrival_time,
  days_needed,
  gender_preference,
  status,
  created_at
)
SELECT
  p.id AS rider_id,
  p.from_location AS pickup_location,
  p.from_lat AS pickup_lat,
  p.from_lng AS pickup_lng,
  ST_SetSRID(ST_MakePoint(p.from_lng, p.from_lat), 4326)::geography AS pickup_point,
  p.to_location AS destination_location,
  p.to_lat AS destination_lat,
  p.to_lng AS destination_lng,
  ST_SetSRID(ST_MakePoint(p.to_lng, p.to_lat), 4326)::geography AS destination_point,
  p.leave_home_time AS preferred_arrival_time,
  p.days_of_commute AS days_needed,
  COALESCE(p.comfortable_with, 'any')::text AS gender_preference,
  'active'::text AS status,
  NOW() AS created_at
FROM profiles p
LEFT JOIN ride_requests rr ON rr.rider_id = p.id
WHERE
  p.email_verified = TRUE
  AND p.prefer_taking_ride = TRUE
  AND rr.id IS NULL
  AND p.from_lat IS NOT NULL
  AND p.from_lng IS NOT NULL
  AND p.to_lat IS NOT NULL
  AND p.to_lng IS NOT NULL;

-- Show how many were created
SELECT COUNT(*) AS ride_requests_created FROM ride_requests;
