import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Active ride_requests/ride_templates with zero match_suggestions rows -
 * riders/hosts who are still waiting for a compatible route to show up,
 * as opposed to having been matched and rejected/expired.
 */
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

    const [{ data: matchedRequestRows }, { data: matchedTemplateRows }] = await Promise.all([
      supabase.from("match_suggestions").select("ride_request_id"),
      supabase.from("match_suggestions").select("ride_template_id"),
    ]);

    const matchedRequestIds = [...new Set((matchedRequestRows ?? []).map((r) => r.ride_request_id).filter(Boolean))];
    const matchedTemplateIds = [...new Set((matchedTemplateRows ?? []).map((r) => r.ride_template_id).filter(Boolean))];

    let riderQuery = supabase
      .from("ride_requests")
      .select(`
        id,
        pickup_location,
        destination_location,
        route_distance_meters,
        created_at,
        profiles!inner(id, full_name, phone_number, institution)
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (matchedRequestIds.length > 0) {
      riderQuery = riderQuery.not("id", "in", `(${matchedRequestIds.join(",")})`);
    }

    let hostQuery = supabase
      .from("ride_templates")
      .select(`
        id,
        from_location,
        to_location,
        departure_time,
        available_seats,
        created_at,
        profiles!inner(id, full_name, phone_number, institution)
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (matchedTemplateIds.length > 0) {
      hostQuery = hostQuery.not("id", "in", `(${matchedTemplateIds.join(",")})`);
    }

    const [{ data: riders, error: riderError }, { data: hosts, error: hostError }] = await Promise.all([
      riderQuery,
      hostQuery,
    ]);

    if (riderError || hostError) {
      console.error("Error fetching unmatched:", riderError || hostError);
      return NextResponse.json({ error: (riderError || hostError)?.message }, { status: 500 });
    }

    return NextResponse.json({
      unmatchedRiders: (riders ?? []).map((r: any) => ({
        id: r.id,
        name: r.profiles?.full_name,
        phone: r.profiles?.phone_number,
        institution: r.profiles?.institution,
        pickup_location: r.pickup_location,
        destination_location: r.destination_location,
        route_distance_meters: r.route_distance_meters,
        created_at: r.created_at,
      })),
      unmatchedHosts: (hosts ?? []).map((h: any) => ({
        id: h.id,
        name: h.profiles?.full_name,
        phone: h.profiles?.phone_number,
        institution: h.profiles?.institution,
        from_location: h.from_location,
        to_location: h.to_location,
        departure_time: h.departure_time,
        available_seats: h.available_seats,
        created_at: h.created_at,
      })),
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
