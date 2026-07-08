CREATE OR REPLACE FUNCTION debug_overlap_distances_tmp(
    p_rider_pickup_lat FLOAT,
    p_rider_pickup_lng FLOAT,
    p_rider_dest_lat FLOAT,
    p_rider_dest_lng FLOAT,
    p_host_route_geometry GEOGRAPHY
)
RETURNS JSON AS $$
DECLARE
    v_route_line GEOMETRY := p_host_route_geometry::geometry;
    v_pickup_point GEOMETRY := ST_SetSRID(ST_MakePoint(p_rider_pickup_lng, p_rider_pickup_lat), 4326);
    v_dest_point GEOMETRY := ST_SetSRID(ST_MakePoint(p_rider_dest_lng, p_rider_dest_lat), 4326);
BEGIN
    RETURN json_build_object(
        'pickup_perp_m', ST_Distance(v_route_line::geography, v_pickup_point::geography),
        'dest_perp_m', ST_Distance(v_route_line::geography, v_dest_point::geography),
        'pickup_fraction', ST_LineLocatePoint(v_route_line, ST_ClosestPoint(v_route_line, v_pickup_point)),
        'dest_fraction', ST_LineLocatePoint(v_route_line, ST_ClosestPoint(v_route_line, v_dest_point)),
        'route_length_m', ST_Length(v_route_line::geography),
        'first_point', ST_AsGeoJSON(ST_StartPoint(v_route_line)),
        'last_point', ST_AsGeoJSON(ST_EndPoint(v_route_line))
    );
END;
$$ LANGUAGE plpgsql;
