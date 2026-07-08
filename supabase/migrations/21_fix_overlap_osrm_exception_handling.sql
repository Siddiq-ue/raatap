-- =================================================================
-- FIX: calculate_overlapping_distance() had no exception handling
-- around its OSRM HTTP call
-- =================================================================
-- Migration 20 re-pointed calculate_overlapping_distance() at the host's
-- real route_geometry, but kept the pre-existing OSRM lookup for the
-- rider's own pickup->dropoff distance unguarded. Every other OSRM call
-- in this file (in calculate_route_match_score) is wrapped in
-- BEGIN...EXCEPTION WHEN OTHERS with a straight-line fallback; this one
-- wasn't, so an OSRM timeout/outage raised an unhandled exception that
-- killed the whole overlap calculation - and, via the caller, an entire
-- match-generation or backfill run (observed as "Connection timeout
-- after 1000 ms" while backfilling migration 20's pending matches).
-- =================================================================

CREATE OR REPLACE FUNCTION calculate_overlapping_distance(
    p_host_from_lat FLOAT,
    p_host_from_lng FLOAT,
    p_host_to_lat FLOAT,
    p_host_to_lng FLOAT,
    p_rider_pickup_lat FLOAT,
    p_rider_pickup_lng FLOAT,
    p_rider_dest_lat FLOAT,
    p_rider_dest_lng FLOAT,
    p_host_route_geometry GEOGRAPHY DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
    v_overlapping_distance NUMERIC := 0;
    v_rider_distance NUMERIC := 0;
    v_host_distance NUMERIC := 0;
    v_osrm_url TEXT;
    v_route_line GEOMETRY;
    v_pickup_point GEOMETRY;
    v_dest_point GEOMETRY;
    v_pickup_on_route BOOLEAN;
    v_dest_on_route BOOLEAN;
    v_pickup_fraction NUMERIC;
    v_dest_fraction NUMERIC;
BEGIN
    v_osrm_url := COALESCE(
        current_setting('app.settings.osrm_url', true),
        'https://router.project-osrm.org'
    );

    -- Get rider's actual route distance via OSRM (pickup -> destination).
    -- Wrapped in EXCEPTION like the OSRM calls in calculate_route_match_score -
    -- an OSRM timeout/outage must degrade to the straight-line estimate below,
    -- not blow up the whole overlap calculation (and, via the caller, the
    -- entire match-generation/backfill run).
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
        v_rider_distance := NULL;
    END;

    -- If OSRM fails, fall back to straight-line
    IF v_rider_distance IS NULL OR v_rider_distance = 0 THEN
        v_rider_distance := ST_Distance(
            ST_MakePoint(p_rider_pickup_lng, p_rider_pickup_lat)::geography,
            ST_MakePoint(p_rider_dest_lng, p_rider_dest_lat)::geography,
            true
        );
    END IF;

    -- Use the host's real road-following route when we have it; otherwise
    -- fall back to the straight chord between the host's endpoints.
    IF p_host_route_geometry IS NOT NULL THEN
        v_route_line := p_host_route_geometry::geometry;
    ELSE
        v_route_line := ST_MakeLine(
            ST_MakePoint(p_host_from_lng, p_host_from_lat)::geometry,
            ST_MakePoint(p_host_to_lng, p_host_to_lat)::geometry
        );
    END IF;

    v_host_distance := ST_Length(v_route_line::geography);

    v_pickup_point := ST_MakePoint(p_rider_pickup_lng, p_rider_pickup_lat)::geometry;
    v_dest_point := ST_MakePoint(p_rider_dest_lng, p_rider_dest_lat)::geometry;

    -- Check if pickup/destination are near the route (500m threshold)
    v_pickup_on_route := ST_DWithin(
        v_route_line::geography,
        v_pickup_point::geography,
        500
    );

    v_dest_on_route := ST_DWithin(
        v_route_line::geography,
        v_dest_point::geography,
        500
    );

    -- Both points must be near the route for overlap
    IF NOT v_pickup_on_route OR NOT v_dest_on_route THEN
        RETURN 0;
    END IF;

    -- Calculate fractional positions along the route (walks every vertex
    -- of the real polyline when geometry is available, not just the two
    -- endpoints, so a rider joining/leaving anywhere mid-route is placed
    -- correctly)
    v_pickup_fraction := ST_LineLocatePoint(v_route_line, ST_ClosestPoint(v_route_line, v_pickup_point));
    v_dest_fraction := ST_LineLocatePoint(v_route_line, ST_ClosestPoint(v_route_line, v_dest_point));

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
$$ LANGUAGE plpgsql;
