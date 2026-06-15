-- =================================================================
-- Trigger Function: Auto-Create Ride Template/Request from Profile
-- =================================================================

CREATE OR REPLACE FUNCTION trigger_auto_create_ride_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    res JSON;
    calculated_seats INTEGER;
BEGIN
    -- 1. Handling HOST creation
    -- Check if prefer_hosting is TRUE and necessary fields are present
    IF NEW.prefer_hosting = true AND
       NEW.from_lat IS NOT NULL AND NEW.from_lng IS NOT NULL AND
       NEW.to_lat IS NOT NULL AND NEW.to_lng IS NOT NULL AND
       NEW.days_of_commute IS NOT NULL AND array_length(NEW.days_of_commute, 1) > 0 THEN

        -- Check if an active template already exists to avoid duplicates
        IF NOT EXISTS (SELECT 1 FROM ride_templates WHERE host_id = NEW.id AND status = 'active') THEN
            -- Auto-calculate seats based on user's vehicle type preference
            IF NEW.vehicle_type = '2_wheeler' THEN
                calculated_seats := 1;  -- Bike: 1 passenger seat
            ELSE
                calculated_seats := 3;  -- Car: 3 passenger seats (default)
            END IF;
            
            -- Call creation function with user's actual vehicle type and calculated seats
            PERFORM create_ride_template_from_profile(
                NEW.id,
                COALESCE(NEW.vehicle_type, '4_wheeler'),  -- Use user's vehicle type or default
                calculated_seats,                          -- Auto-calculated from vehicle type
                5000,
                '18:00:00'
            );
        END IF;
    END IF;

    -- 2. Handling RIDER creation
    -- Check if prefer_taking_ride is TRUE and necessary fields are present
    IF NEW.prefer_taking_ride = true AND
       NEW.from_lat IS NOT NULL AND NEW.from_lng IS NOT NULL AND
       NEW.to_lat IS NOT NULL AND NEW.to_lng IS NOT NULL AND
       NEW.days_of_commute IS NOT NULL AND array_length(NEW.days_of_commute, 1) > 0 THEN

        -- Check if an active request already exists
        IF NOT EXISTS (SELECT 1 FROM ride_requests WHERE rider_id = NEW.id AND status = 'active') THEN
            -- Call creation function
            -- Defaults: 09:00 arrival, 30m flex, 'any' vehicle, 'both' gender
            PERFORM create_ride_request_from_profile(
                NEW.id,
                '09:00:00',
                30,
                'any',
                'both'
            );
            
            -- Trigger match generation for existing ride_templates (hosts)
            PERFORM generate_all_matches();
        END IF;
    END IF;

    -- 3. Handling HOST match generation
    -- If host just created a template, generate matches for existing ride_requests
    IF NEW.prefer_hosting = true AND
       NEW.from_lat IS NOT NULL AND NEW.from_lng IS NOT NULL AND
       NEW.to_lat IS NOT NULL AND NEW.to_lng IS NOT NULL AND
       NEW.days_of_commute IS NOT NULL AND array_length(NEW.days_of_commute, 1) > 0 THEN

        -- Check if an active template already exists
        IF NOT EXISTS (SELECT 1 FROM ride_templates WHERE host_id = NEW.id AND status = 'active') THEN
            -- Trigger match generation for existing ride_requests (riders)
            PERFORM generate_all_matches();
        END IF;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the profile update
    RAISE WARNING 'Auto-creation failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_profile_update_create_ride ON profiles;

-- Create Trigger
CREATE TRIGGER on_profile_update_create_ride
AFTER INSERT OR UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_create_ride_from_profile();
