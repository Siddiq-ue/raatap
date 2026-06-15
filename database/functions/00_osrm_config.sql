-- =================================================================
-- OSRM MATCHING CONFIGURATION
-- =================================================================
-- Configure OSRM server URL and other settings
-- =================================================================

-- ----------------------------------------------------------------
-- Set OSRM Server URL
-- ----------------------------------------------------------------
-- Option 1: Use public OSRM demo server (default, no config needed)
--   https://router.project-osrm.org
--
-- Option 2: Use self-hosted OSRM (recommended for production)
--   See: SELF_HOST_OSRM_GUIDE.md for setup instructions

-- Set custom OSRM URL (uncomment and modify if using self-hosted)
-- ALTER DATABASE postgres SET "app.settings.osrm_url" = 'http://your-osrm-server:5000';

-- Example: Local Docker OSRM
-- ALTER DATABASE postgres SET "app.settings.osrm_url" = 'http://host.docker.internal:5000';

-- Example: Oracle Cloud / AWS / GCP
-- ALTER DATABASE postgres SET "app.settings.osrm_url" = 'http://your-cloud-ip:5000';

-- View current setting
-- SHOW app.settings.osrm_url;


-- ----------------------------------------------------------------
-- Enable pg_http Extension (Required for OSRM API calls)
-- ----------------------------------------------------------------
-- Note: This may already be enabled in Supabase

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Grant permissions for all roles
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO postgres, anon, authenticated;


-- ----------------------------------------------------------------
-- Test OSRM Connection
-- ----------------------------------------------------------------
-- Run this to verify OSRM API is accessible from database

-- Test with a simple route (Hyderabad CBIT to MGIT)
/*
SELECT 
    (extensions.http_get(
        'https://router.project-osrm.org/route/v1/driving/78.3194368,17.3919735;78.3220892,17.391051?overview=false'
    )->'content')::text::json->'routes'->0->>'distance' as distance_meters,
    (extensions.http_get(
        'https://router.project-osrm.org/route/v1/driving/78.3194368,17.3919735;78.3220892,17.391051?overview=false'
    )->'content')::text::json->'routes'->0->>'duration' as duration_seconds;
*/

-- Expected output:
-- distance_meters: ~250 (meters)
-- duration_seconds: ~60 (seconds)


-- ----------------------------------------------------------------
-- Performance Tuning (Optional)
-- ----------------------------------------------------------------
-- For better performance with many matches, consider:

-- 1. Add timeout settings (prevent hanging on slow OSRM)
-- ALTER DATABASE postgres SET "app.settings.osrm_timeout_ms" = '5000';

-- 2. Add retry logic (handled in function with EXCEPTION block)

-- 3. Use connection pooling (handled by Supabase)

-- 4. Cache frequently used routes (future optimization)


-- ----------------------------------------------------------------
-- Deployment Checklist
-- ----------------------------------------------------------------
/*
□ pg_http extension enabled
□ Permissions granted to all roles
□ OSRM URL configured (or using default)
□ Connection test successful
□ Functions deployed (08_osrm_matching.sql)
□ Match generation deployed (09_osrm_match_generation.sql)
□ Triggers deployed (10_osrm_instant_triggers.sql)
□ Test match creation successful
*/
