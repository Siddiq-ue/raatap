-- =================================================================
-- INSTANT MATCHING TRIGGERS
-- =================================================================
-- Automatically generates matches when:
-- 1. New ride template is created (host)
-- 2. New ride request is created (rider)
--
-- This makes matching INSTANT - no manual refresh needed!
-- =================================================================

-- ================================================================
-- 1. Trigger: Auto-match when ride template created
-- ================================================================

CREATE OR REPLACE FUNCTION trigger_auto_match_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    matches_found INTEGER;
BEGIN
    -- Generate matches for all active ride requests
    matches_found := generate_match_suggestions_for_ride_template(NEW.id);

    -- Log results
    RAISE NOTICE 'Auto-generated % matches for new ride template %', matches_found, NEW.id;

    RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_ride_template_created_auto_match ON ride_templates;

-- Create trigger
CREATE TRIGGER on_ride_template_created_auto_match
AFTER INSERT ON ride_templates
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_match_template();

COMMENT ON TRIGGER on_ride_template_created_auto_match ON ride_templates IS
'Automatically generates match suggestions when a new ride template is created';


-- ================================================================
-- 2. Trigger: Auto-match when ride request created
-- ================================================================

CREATE OR REPLACE FUNCTION trigger_auto_match_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    matches_found INTEGER;
BEGIN
    -- Generate matches for all active ride templates
    matches_found := generate_match_suggestions_for_ride_request(NEW.id);

    -- Log results
    RAISE NOTICE 'Auto-generated % matches for new ride request %', matches_found, NEW.id;

    RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_ride_request_created_auto_match ON ride_requests;

-- Create trigger
CREATE TRIGGER on_ride_request_created_auto_match
AFTER INSERT ON ride_requests
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_match_request();

COMMENT ON TRIGGER on_ride_request_created_auto_match ON ride_requests IS
'Automatically generates match suggestions when a new ride request is created';


-- ================================================================
-- TESTING
-- ================================================================
/*
-- Test instant matching for template:
SELECT regenerate_matches_for_template('your-template-id');

-- Test instant matching for request:
SELECT regenerate_matches_for_request('your-request-id');

-- Check triggers exist:
SELECT tgname FROM pg_trigger WHERE tgname = 'on_ride_template_created_auto_match';
SELECT tgname FROM pg_trigger WHERE tgname = 'on_ride_request_created_auto_match';

-- View recent match suggestions:
SELECT * FROM match_suggestions 
ORDER BY created_at DESC 
LIMIT 10;
*/
