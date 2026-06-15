-- =====================================================
-- COMPLETE LOGGED DATABASE FUNCTIONS
-- =====================================================
-- This file contains all database functions with full logging
-- Run this to replace the old functions with logged versions
-- =====================================================

-- =====================================================
-- 1. LOGGING INFRASTRUCTURE (Run 00_logging.sql first)
-- =====================================================
-- The logging system must be created first by running:
-- database/functions/00_logging.sql
-- =====================================================

-- =====================================================
-- 2. MATCHING FUNCTION WITH LOGGING
-- =====================================================
-- Replaces: calculate_route_match_score()
-- File: database/functions/02_matching_logged.sql
-- =====================================================

-- (See 02_matching_logged.sql for full implementation)

-- =====================================================
-- 3. MATCH MANAGEMENT WITH LOGGING
-- =====================================================
-- Replaces: accept_match_suggestion() and confirm_match_suggestion()
-- File: database/functions/03_match_management_logged.sql
-- =====================================================

-- (See 03_match_management_logged.sql for full implementation)

-- =====================================================
-- DEPLOYMENT INSTRUCTIONS
-- =====================================================
/*
Step 1: Create logging infrastructure
  → Run: database/functions/00_logging.sql

Step 2: Update matching function
  → Run: database/functions/02_matching_logged.sql

Step 3: Update match management
  → Run: database/functions/03_match_management_logged.sql

Step 4: Verify logs are working
  → Run: SELECT * FROM recent_activity_logs LIMIT 10;

Step 5: Test with a real match
  → Create a ride template
  → Check logs: SELECT * FROM get_entity_logs('match', 'your-match-id', 20);
*/

-- =====================================================
-- QUICK TEST
-- =====================================================
-- After deployment, test logging:

SELECT log_activity(
    'INFO',
    'test_function',
    'Testing logging system',
    NULL,
    NULL,
    NULL,
    jsonb_build_object('test', true)
);

-- View the log
SELECT * FROM recent_activity_logs WHERE function_name = 'test_function';

-- =====================================================
-- EXAMPLE LOG QUERIES
-- =====================================================

-- 1. View recent activity
SELECT * FROM recent_activity_logs LIMIT 20;

-- 2. View logs for specific match
SELECT * FROM get_entity_logs('match', 'YOUR_MATCH_ID', 50);

-- 3. View user activity
SELECT * FROM get_user_activity('YOUR_USER_ID', 50);

-- 4. View recent errors
SELECT * FROM get_error_logs(24, 50);

-- 5. Get all match calculations from last hour
SELECT 
    log_time,
    details->>'overall_score' as score,
    details->>'pickup_distance_meters' as distance,
    details->>'compatible' as compatible
FROM activity_logs
WHERE function_name = 'calculate_route_match_score'
  AND log_time > NOW() - '1 hour'::INTERVAL
ORDER BY log_time DESC;

-- =====================================================
-- MONITORING QUERIES
-- =====================================================

-- Error rate by function
SELECT 
    function_name,
    COUNT(*) FILTER (WHERE log_level = 'ERROR') as errors,
    COUNT(*) as total,
    ROUND(COUNT(*) FILTER (WHERE log_level = 'ERROR') * 100.0 / COUNT(*), 2) as error_rate
FROM activity_logs
WHERE log_time > NOW() - '24 hours'::INTERVAL
GROUP BY function_name
ORDER BY error_rate DESC;

-- Most common errors
SELECT 
    function_name,
    action,
    details->>'error_message' as error,
    COUNT(*) as occurrences
FROM activity_logs
WHERE log_level = 'ERROR'
  AND log_time > NOW() - '24 hours'::INTERVAL
GROUP BY function_name, action, details->>'error_message'
ORDER BY occurrences DESC;

-- Activity by hour
SELECT 
    DATE_TRUNC('hour', log_time) as hour,
    COUNT(*) as actions,
    COUNT(*) FILTER (WHERE log_level = 'ERROR') as errors
FROM activity_logs
WHERE log_time > NOW() - '7 days'::INTERVAL
GROUP BY DATE_TRUNC('hour', log_time)
ORDER BY hour DESC;
