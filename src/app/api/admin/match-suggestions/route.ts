import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const session = req.cookies.get("admin_session");

  if (!session?.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

    try {
    const decoded = Buffer.from(session.value, "base64").toString("utf-8");
    const [email, timestamp] = decoded.split(":");

    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    const sessionAge = Date.now() - parseInt(timestamp);
    const maxAge = 60 * 60 * 24 * 1000;

    if (email !== adminEmail || sessionAge >= maxAge) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = supabase
      .from("match_suggestions")
      .select(`
        id,
        status,
        route_match_score,
        schedule_match_score,
        overall_score,
        detour_distance_meters,
        pickup_distance_meters,
        overlapping_distance_meters,
        expires_at,
        shown_to_host_at,
        host_action_at,
        created_at,
        updated_at,
        ride_templates!inner(
          id,
          from_location,
          to_location,
          departure_time,
          available_seats,
          profiles!inner(id, full_name, phone_number, institution)
        ),
        ride_requests!inner(
          id,
          pickup_location,
          destination_location,
          pickup_lat,
          pickup_lng,
          profiles!inner(id, full_name, phone_number, institution)
        )
      `)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching match suggestions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let suggestions = (data || []).map((ms: any) => ({
      id: ms.id,
      status: ms.status,
      route_match_score: ms.route_match_score,
      schedule_match_score: ms.schedule_match_score,
      overall_score: ms.overall_score,
      detour_distance_meters: ms.detour_distance_meters,
      pickup_distance_meters: ms.pickup_distance_meters,
      overlapping_distance_meters: ms.overlapping_distance_meters,
      expires_at: ms.expires_at,
      shown_to_host_at: ms.shown_to_host_at,
      host_action_at: ms.host_action_at,
      created_at: ms.created_at,
      updated_at: ms.updated_at,
      host: ms.ride_templates ? {
        id: ms.ride_templates.profiles?.id,
        name: ms.ride_templates.profiles?.full_name,
        phone: ms.ride_templates.profiles?.phone_number,
        institution: ms.ride_templates.profiles?.institution,
        from_location: ms.ride_templates.from_location,
        to_location: ms.ride_templates.to_location,
        departure_time: ms.ride_templates.departure_time,
        available_seats: ms.ride_templates.available_seats,
      } : null,
      rider: ms.ride_requests ? {
        id: ms.ride_requests.profiles?.id,
        name: ms.ride_requests.profiles?.full_name,
        phone: ms.ride_requests.profiles?.phone_number,
        institution: ms.ride_requests.profiles?.institution,
        pickup_location: ms.ride_requests.pickup_location,
        destination_location: ms.ride_requests.destination_location,
        pickup_lat: ms.ride_requests.pickup_lat,
        pickup_lng: ms.ride_requests.pickup_lng,
      } : null,
    }));

    if (search) {
      const searchLower = search.toLowerCase();
      suggestions = suggestions.filter((ms: any) =>
        (ms.host?.name?.toLowerCase().includes(searchLower)) ||
        (ms.host?.phone?.includes(search)) ||
        (ms.rider?.name?.toLowerCase().includes(searchLower)) ||
        (ms.rider?.phone?.includes(search))
      );
    }

    const { count } = await supabase
      .from("match_suggestions")
      .select("*", { count: "exact", head: true });

    return NextResponse.json({
      suggestions,
      total: count || 0,
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}