-- Performance indexes for dashboard loading
-- Run this in Supabase SQL Editor

-- Index for pod_members by rider_id and status
CREATE INDEX IF NOT EXISTS idx_pod_members_rider_status 
ON pod_members(rider_id, status);

-- Index for pod_members by pod_id and status
CREATE INDEX IF NOT EXISTS idx_pod_members_pod_status 
ON pod_members(pod_id, status);

-- Index for pods by host_id and status
CREATE INDEX IF NOT EXISTS idx_pods_host_status 
ON pods(host_id, status);

-- Index for match_suggestions by status and score
CREATE INDEX IF NOT EXISTS idx_match_suggestions_status_score 
ON match_suggestions(status, overall_score DESC);

-- Index for ride_templates by host_id
CREATE INDEX IF NOT EXISTS idx_ride_templates_host_id 
ON ride_templates(host_id);

-- Index for ride_requests by rider_id
CREATE INDEX IF NOT EXISTS idx_ride_requests_rider_id 
ON ride_requests(rider_id);

-- Analyze tables to update statistics
ANALYZE pod_members;
ANALYZE pods;
ANALYZE match_suggestions;
ANALYZE ride_templates;
ANALYZE ride_requests;
