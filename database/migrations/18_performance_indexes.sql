-- Add indexes for pod_members performance
CREATE INDEX IF NOT EXISTS idx_pod_members_status ON pod_members(status);
CREATE INDEX IF NOT EXISTS idx_pod_members_pod_id_status ON pod_members(pod_id, status);
CREATE INDEX IF NOT EXISTS idx_pod_members_rider_id_status ON pod_members(rider_id, status);

-- Optimize match_suggestions queries
CREATE INDEX IF NOT EXISTS idx_match_suggestions_status_ride_template ON match_suggestions(status, ride_template_id);
CREATE INDEX IF NOT EXISTS idx_match_suggestions_status_ride_request ON match_suggestions(status, ride_request_id);