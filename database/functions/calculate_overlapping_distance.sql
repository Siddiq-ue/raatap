-- Calculate overlapping distance using OSRM for actual rider route
-- Returns the distance (in meters) that both host and rider share
CREATE OR REPLACE FUNCTION calculate_overlapping_distance(
    p_host_from_lat FLOAT,
    p_host_from_lng FLOAT,
    p_host_to_lat FLOAT,
    p_host_to_lng FLOAT,
    p_rider_pickup_lat FLOAT,
    p_rider_pickup_lng FLOAT,
    p_rider_dest_lat FLOAT,
    p_rider_dest_lng FLOAT
)
RETURNS NUMERIC AS $$
DECLARE
    v_overlapping_distance NUMERIC := 0;
    v_rider_distance NUMERIC := 0;
    v_host_distance NUMERIC := 0;
    v_osrm_url TEXT;
    v_pickup_on_route BOOLEAN;
    v_dest_on_route BOOLEAN;
    v_pickup_fraction NUMERIC;
    v_dest_fraction NUMERIC;
BEGIN
    v_osrm_url := COALESCE(
        current_setting('app.settings.osrm_url', true),
        'https://router.project-osrm.org'
    );

    -- Get rider's actual route distance via OSRM (pickup -> destination)
    SELECT (routes->>'distance')::NUMERIC INTO v_rider_distance
    FROM (
        SELECT (content::json->'routes'->0) AS routes
        FROM extensions.http_get(
            v_osrm_url || '/route/v1/driving/' ||
            p_rider_pickup_lng || ',' || p_rider_pickup_lat || ';' ||
            p_rider_dest_lng || ',' || p_rider_dest_lat || '?overview=false'
        )
    ) AS t
    WHERE t.routes IS NOT NULL;

    -- If OSRM fails, fall back to straight-line
    IF v_rider_distance IS NULL OR v_rider_distance = 0 THEN
        v_rider_distance := ST_Distance(
            ST_MakePoint(p_rider_pickup_lng, p_rider_pickup_lat)::geography,
            ST_MakePoint(p_rider_dest_lng, p_rider_dest_lat)::geography,
            true
        );
    END IF;

    v_host_distance := ST_Distance(
        ST_MakePoint(p_host_from_lng, p_host_from_lat)::geography,
        ST_MakePoint(p_host_to_lng, p_host_to_lat)::geography,
        true
    );

    -- Check if pickup/destination are near host route line (500m threshold)
    v_pickup_on_route := ST_DWithin(
        ST_MakeLine(
            ST_MakePoint(p_host_from_lng, p_host_from_lat)::geometry,
            ST_MakePoint(p_host_to_lng, p_host_to_lat)::geometry
        )::geography,
        ST_MakePoint(p_rider_pickup_lng, p_rider_pickup_lat)::geography,
        500
    );

    v_dest_on_route := ST_DWithin(
        ST_MakeLine(
            ST_MakePoint(p_host_from_lng, p_host_from_lat)::geometry,
            ST_MakePoint(p_host_to_lng, p_host_to_lat)::geometry
        )::geography,
        ST_MakePoint(p_rider_dest_lng, p_rider_dest_lat)::geography,
        500
    );

    -- Both points must be near host route for overlap
    IF NOT v_pickup_on_route OR NOT v_dest_on_route THEN
        RETURN 0;
    END IF;

    -- Calculate fractional positions along host route
    v_pickup_fraction := ST_LineLocatePoint(
        ST_MakeLine(
            ST_MakePoint(p_host_from_lng, p_host_from_lat)::geometry,
            ST_MakePoint(p_host_to_lng, p_host_to_lat)::geometry
        ),
        ST_ClosestPoint(
            ST_MakeLine(
                ST_MakePoint(p_host_from_lng, p_host_from_lat)::geometry,
                ST_MakePoint(p_host_to_lng, p_host_to_lat)::geometry
            ),
            ST_MakePoint(p_rider_pickup_lng, p_rider_pickup_lat)::geometry
        )
    );

    v_dest_fraction := ST_LineLocatePoint(
        ST_MakeLine(
            ST_MakePoint(p_host_from_lng, p_host_from_lat)::geometry,
            ST_MakePoint(p_host_to_lng, p_host_to_lat)::geometry
        ),
        ST_ClosestPoint(
            ST_MakeLine(
                ST_MakePoint(p_host_from_lng, p_host_from_lat)::geometry,
                ST_MakePoint(p_host_to_lng, p_host_to_lat)::geometry
            ),
            ST_MakePoint(p_rider_dest_lng, p_rider_dest_lat)::geometry
        )
    );

    v_pickup_fraction := GREATEST(0, LEAST(1, v_pickup_fraction));
    v_dest_fraction := GREATEST(0, LEAST(1, v_dest_fraction));

    -- Calculate overlap based on fractions
    IF v_dest_fraction >= v_pickup_fraction THEN
        v_overlapping_distance := (v_dest_fraction - v_pickup_fraction) * v_host_distance;
    ELSE
        v_overlapping_distance := 0;
    END IF;

    -- Cap with rider's actual OSRM distance (rider can't overlap more than they travel)
    v_overlapping_distance := LEAST(v_overlapping_distance, v_rider_distance);

    RETURN ROUND(v_overlapping_distance);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
