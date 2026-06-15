-- =====================================================
-- DATABASE LOGGING SYSTEM
-- =====================================================
-- Creates tables and functions for comprehensive logging
-- Run this FIRST before other functions

-- =====================================================
-- 1. Create Activity Log Table
-- =====================================================
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    log_time TIMESTAMPTZ DEFAULT NOW(),
    log_level TEXT DEFAULT 'INFO' CHECK (log_level IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    function_name TEXT NOT NULL,
    action TEXT NOT NULL,
    user_id UUID,
    entity_type TEXT, -- 'ride_template', 'ride_request', 'match', 'pod', etc.
    entity_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_time ON activity_logs(log_time DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_level ON activity_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_activity_logs_function ON activity_logs(function_name);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_details ON activity_logs USING GIN(details);

-- =====================================================
-- 2. Create Log Function (used by all other functions)
-- =====================================================
CREATE OR REPLACE FUNCTION log_activity(
    p_log_level TEXT,
    p_function_name TEXT,
    p_action TEXT,
    p_user_id UUID DEFAULT NULL,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO activity_logs (
        log_level,
        function_name,
        action,
        user_id,
        entity_type,
        entity_id,
        details
    ) VALUES (
        p_log_level,
        p_function_name,
        p_action,
        p_user_id,
        p_entity_type,
        p_entity_id,
        p_details
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$;

-- =====================================================
-- 3. Create Error Log Function (shortcut)
-- =====================================================
CREATE OR REPLACE FUNCTION log_error(
    p_function_name TEXT,
    p_action TEXT,
    p_error_message TEXT,
    p_user_id UUID DEFAULT NULL,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    log_id UUID;
    full_details JSONB;
BEGIN
    -- Add error message to details
    full_details := p_details || jsonb_build_object('error_message', p_error_message);
    
    INSERT INTO activity_logs (
        log_level,
        function_name,
        action,
        user_id,
        entity_type,
        entity_id,
        details
    ) VALUES (
        'ERROR',
        p_function_name,
        p_action,
        p_user_id,
        p_entity_type,
        p_entity_id,
        full_details
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$;

-- =====================================================
-- 4. Create View for Recent Logs
-- =====================================================
CREATE OR REPLACE VIEW recent_activity_logs AS
SELECT 
    id,
    log_time,
    log_level,
    function_name,
    action,
    user_id,
    entity_type,
    entity_id,
    details,
    EXTRACT(EPOCH FROM (NOW() - log_time))::INTEGER as seconds_ago
FROM activity_logs
ORDER BY log_time DESC
LIMIT 1000;

-- =====================================================
-- 5. Create Function to Get Logs by Entity
-- =====================================================
CREATE OR REPLACE FUNCTION get_entity_logs(
    p_entity_type TEXT,
    p_entity_id UUID,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    log_time TIMESTAMPTZ,
    log_level TEXT,
    function_name TEXT,
    action TEXT,
    user_id UUID,
    details JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.id,
        al.log_time,
        al.log_level,
        al.function_name,
        al.action,
        al.user_id,
        al.details
    FROM activity_logs al
    WHERE al.entity_type = p_entity_type 
      AND al.entity_id = p_entity_id
    ORDER BY al.log_time DESC
    LIMIT p_limit;
END;
$$;

-- =====================================================
-- 6. Create Function to Get User Activity
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_activity(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    log_time TIMESTAMPTZ,
    log_level TEXT,
    function_name TEXT,
    action TEXT,
    entity_type TEXT,
    entity_id UUID,
    details JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.id,
        al.log_time,
        al.log_level,
        al.function_name,
        al.action,
        al.entity_type,
        al.entity_id,
        al.details
    FROM activity_logs al
    WHERE al.user_id = p_user_id
    ORDER BY al.log_time DESC
    LIMIT p_limit;
END;
$$;

-- =====================================================
-- 7. Create Function to Get Error Logs
-- =====================================================
CREATE OR REPLACE FUNCTION get_error_logs(
    p_hours INTEGER DEFAULT 24,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    log_time TIMESTAMPTZ,
    function_name TEXT,
    action TEXT,
    user_id UUID,
    entity_type TEXT,
    entity_id UUID,
    error_message TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.id,
        al.log_time,
        al.function_name,
        al.action,
        al.user_id,
        al.entity_type,
        al.entity_id,
        (al.details->>'error_message')::TEXT as error_message
    FROM activity_logs al
    WHERE al.log_level IN ('ERROR', 'CRITICAL')
      AND al.log_time > NOW() - (p_hours || ' hours')::INTERVAL
    ORDER BY al.log_time DESC
    LIMIT p_limit;
END;
$$;

-- =====================================================
-- 8. Create Cleanup Function (auto-delete old logs)
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_old_logs(
    p_days_to_keep INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM activity_logs
    WHERE log_time < NOW() - (p_days_to_keep || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the cleanup
    PERFORM log_activity(
        'INFO',
        'cleanup_old_logs',
        'Cleaned up old activity logs',
        NULL,
        NULL,
        NULL,
        jsonb_build_object('deleted_count', deleted_count, 'days_kept', p_days_to_keep)
    );
    
    RETURN deleted_count;
END;
$$;

-- =====================================================
-- 9. Create Trigger to Auto-Log Table Changes
-- =====================================================
CREATE OR REPLACE FUNCTION audit_table_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    log_details JSONB;
    entity_type TEXT;
    entity_id UUID;
    user_id UUID;
BEGIN
    -- Determine entity type from table name
    entity_type := TG_TABLE_NAME;
    
    -- Get entity ID based on operation
    IF TG_OP = 'DELETE' THEN
        entity_id := OLD.id;
        log_details := to_jsonb(OLD);
    ELSE
        entity_id := NEW.id;
        log_details := to_jsonb(NEW);
    END IF;
    
    -- Try to get user_id if column exists
    BEGIN
        IF TG_OP = 'DELETE' THEN
            user_id := OLD.user_id;
        ELSE
            user_id := NEW.user_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        user_id := NULL;
    END;
    
    -- Log the change
    PERFORM log_activity(
        'INFO',
        TG_TABLE_NAME || '_trigger',
        TG_OP,
        user_id,
        entity_type,
        entity_id,
        log_details
    );
    
    RETURN NULL; -- For AFTER triggers
END;
$$;

COMMENT ON FUNCTION audit_table_changes() IS 'Generic audit trigger for logging table changes';

-- =====================================================
-- 10. Grant Permissions
-- =====================================================
-- Allow authenticated users to view their own logs
GRANT SELECT ON activity_logs TO authenticated;
GRANT SELECT ON recent_activity_logs TO authenticated;
GRANT EXECUTE ON FUNCTION get_entity_logs TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_activity TO authenticated;

-- Only service role can insert/delete logs
GRANT ALL ON activity_logs TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- =====================================================
-- 11. Create Sample Usage Comments
-- =====================================================
/*
-- Usage Examples:

-- 1. Log an action
SELECT log_activity(
    'INFO',
    'create_ride_template',
    'Ride template created successfully',
    user_id := '123...',
    entity_type := 'ride_template',
    entity_id := '456...',
    details := '{"vehicle_type": "4_wheeler", "seats": 3}'::jsonb
);

-- 2. Log an error
SELECT log_error(
    function_name := 'calculate_match_score',
    action := 'Failed to calculate match',
    error_message := 'Template not found',
    user_id := '123...',
    entity_type := 'ride_template',
    entity_id := '456...',
    details := '{"template_id": "456..."}'::jsonb
);

-- 3. Get logs for specific entity
SELECT * FROM get_entity_logs('match', '789...', 50);

-- 4. Get user activity
SELECT * FROM get_user_activity('123...', 100);

-- 5. Get recent errors
SELECT * FROM get_error_logs(24, 50); -- Last 24 hours

-- 6. Cleanup old logs
SELECT cleanup_old_logs(30); -- Keep 30 days

-- 7. View recent logs
SELECT * FROM recent_activity_logs;
*/
