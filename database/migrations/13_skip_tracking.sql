-- =====================================================
-- SKIP TRACKING MIGRATION
-- =====================================================
-- Adds skip_reason and skipped_at columns to match_suggestions
-- Run this in Supabase SQL Editor
-- =====================================================

-- Add skip tracking columns
ALTER TABLE match_suggestions
ADD COLUMN IF NOT EXISTS skip_reason TEXT,
ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ;

-- Add index for faster skip analytics
CREATE INDEX IF NOT EXISTS idx_match_suggestions_skipped 
ON match_suggestions(skipped_at DESC) 
WHERE status = 'skipped';

-- Add comment
COMMENT ON COLUMN match_suggestions.skip_reason IS 'Reason why the match was skipped (e.g., "too_far", "time_mismatch", "bad_route")';
COMMENT ON COLUMN match_suggestions.skipped_at IS 'Timestamp when the match was skipped';

-- Create view for skip analytics
CREATE OR REPLACE VIEW skip_analytics AS
SELECT 
    DATE_TRUNC('day', skipped_at) as skip_date,
    skip_reason,
    COUNT(*) as skip_count,
    COUNT(DISTINCT user_id) as unique_users
FROM (
    SELECT 
        ms.skipped_at,
        ms.skip_reason,
        CASE 
            WHEN rt.host_id IS NOT NULL THEN rt.host_id
            WHEN rr.rider_id IS NOT NULL THEN rr.rider_id
        END as user_id
    FROM match_suggestions ms
    LEFT JOIN ride_templates rt ON ms.ride_template_id = rt.id
    LEFT JOIN ride_requests rr ON ms.ride_request_id = rr.id
    WHERE ms.status = 'skipped'
      AND ms.skipped_at IS NOT NULL
) skip_data
GROUP BY DATE_TRUNC('day', skipped_at), skip_reason
ORDER BY skip_date DESC, skip_count DESC;

-- Create function to get skip statistics
CREATE OR REPLACE FUNCTION get_skip_stats(p_hours INTEGER DEFAULT 168) -- Default: 1 week
RETURNS TABLE (
    reason TEXT,
    skip_count BIGINT,
    percentage NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    total_skips BIGINT;
BEGIN
    -- Get total skips
    SELECT COUNT(*) INTO total_skips
    FROM match_suggestions
    WHERE status = 'skipped'
      AND skipped_at > NOW() - (p_hours || ' hours')::INTERVAL;

    -- Get skips by reason
    RETURN QUERY
    SELECT 
        COALESCE(ms.skip_reason, 'unspecified') as reason,
        COUNT(*) as skip_count,
        ROUND(COUNT(*) * 100.0 / NULLIF(total_skips, 0), 2) as percentage
    FROM match_suggestions ms
    WHERE ms.status = 'skipped'
      AND ms.skipped_at > NOW() - (p_hours || ' hours')::INTERVAL
    GROUP BY ms.skip_reason
    ORDER BY skip_count DESC;
END;
$$;

-- Grant permissions
GRANT SELECT ON skip_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION get_skip_stats TO authenticated;

-- Sample query to test
-- SELECT * FROM skip_analytics LIMIT 10;
-- SELECT * FROM get_skip_stats(24); -- Last 24 hours
