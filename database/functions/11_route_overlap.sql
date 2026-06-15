-- Calculate route overlap between host and rider using actual road geometries
-- Uses PostGIS spatial operations for accurate overlap calculation

CREATE OR REPLACE FUNCTION calculate_route_overlap(
    p_host_geometry GEOGRAPHY,
    p_rider_geometry GEOGRAPHY,
    p_buffer_meters FLOAT DEFAULT 50
)
RETURNS FLOAT AS $$
DECLARE
    v_overlap_distance FLOAT := 0;
    v_rider_length FLOAT;
    v_host_length FLOAT;
BEGIN
    -- Handle NULL geometries
    IF p_host_geometry IS NULL OR p_rider_geometry IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Get route lengths
    SELECT ST_Length(p_rider_geometry) INTO v_rider_length;
    SELECT ST_Length(p_host_geometry) INTO v_host_length;
    
    -- Handle zero-length routes
    IF v_rider_length < 1 OR v_host_length < 1 THEN
        RETURN 0;
    END IF;
    
    -- Find overlapping segments:
    -- 1. Buffer host route by threshold (creates a polygon around the route)
    -- 2. Intersect rider route with buffered host route
    -- 3. Calculate length of intersection
    SELECT ST_Length(
        ST_Intersection(
            p_rider_geometry::geometry,
            ST_Buffer(p_host_geometry::geometry, p_buffer_meters)::geometry
        )::geography
    ) INTO v_overlap_distance;
    
    -- Handle NULL intersection (no overlap)
    IF v_overlap_distance IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Cap overlap at rider's total distance (can't overlap more than you travel)
    v_overlap_distance := LEAST(v_overlap_distance, v_rider_length);
    
    RETURN ROUND(v_overlap_distance);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_route_overlap IS 
'Calculates overlapping distance between host and rider route geometries using PostGIS spatial operations';

-- Helper function: Calculate overlap ratio (0-1)
CREATE OR REPLACE FUNCTION calculate_overlap_ratio(
    p_host_geometry GEOGRAPHY,
    p_rider_geometry GEOGRAPHY,
    p_buffer_meters FLOAT DEFAULT 50
)
RETURNS FLOAT AS $$
DECLARE
    v_overlap_distance FLOAT;
    v_rider_length FLOAT;
BEGIN
    v_overlap_distance := calculate_route_overlap(p_host_geometry, p_rider_geometry, p_buffer_meters);
    SELECT ST_Length(p_rider_geometry) INTO v_rider_length;
    
    IF v_rider_length < 1 THEN
        RETURN 0;
    END IF;
    
    RETURN ROUND(v_overlap_distance / v_rider_length, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_overlap_ratio IS 
'Calculates overlap ratio (0-1) between host and rider route geometries';
