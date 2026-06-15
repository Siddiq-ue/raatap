-- Migration: Add route_geometry column to ride_requests
-- Enables OSRM-based route overlap calculation for accurate matching

-- Step 1: Add geometry column
ALTER TABLE ride_requests 
ADD COLUMN route_geometry GEOGRAPHY(LineString, 4326);

-- Step 2: Add route length column (cached for performance)
ALTER TABLE ride_requests
ADD COLUMN route_distance_meters FLOAT;

-- Step 3: Create index for spatial queries
CREATE INDEX IF NOT EXISTS idx_ride_requests_route_geometry 
ON ride_requests USING GIST (route_geometry);

-- Step 4: Add comment
COMMENT ON COLUMN ride_requests.route_geometry IS 'OSRM route geometry from pickup to destination (LineString)';
COMMENT ON COLUMN ride_requests.route_distance_meters IS 'Total route distance in meters (from OSRM)';

-- Note: Existing ride_requests will have NULL geometry
-- They will get populated when riders update or recreate requests
-- New ride requests will automatically get geometry from API
