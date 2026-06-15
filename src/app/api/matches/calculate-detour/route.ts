import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateDetour } from "@/lib/osrm";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { template_id, request_id } = await request.json();

    if (!template_id || !request_id) {
      return NextResponse.json(
        { error: "Missing required fields: template_id, request_id" },
        { status: 400 }
      );
    }

    // Get template and request details
    const [templateResult, requestResult] = await Promise.all([
      supabase
        .from("ride_templates")
        .select("from_point, to_point, max_detour_meters")
        .eq("id", template_id)
        .single(),
      supabase
        .from("ride_requests")
        .select("pickup_point")
        .eq("id", request_id)
        .single(),
    ]);

    if (templateResult.error || requestResult.error) {
      return NextResponse.json(
        { error: "Template or request not found" },
        { status: 404 }
      );
    }

    const template = templateResult.data;
    const rideRequest = requestResult.data;

    // Extract coordinates from PostGIS points
    // Format: "POINT(lng lat)"
    const parsePoint = (point: string) => {
      const match = point.match(/POINT\((-?\d+\.\d+)\s+(-?\d+\.\d+)\)/);
      if (!match) return null;
      return {
        lng: parseFloat(match[1]),
        lat: parseFloat(match[2]),
      };
    };

    const from = parsePoint(template.from_point);
    const to = parsePoint(template.to_point);
    const pickup = parsePoint(rideRequest.pickup_point);

    if (!from || !to || !pickup) {
      return NextResponse.json(
        { error: "Invalid location data" },
        { status: 400 }
      );
    }

    // Calculate real detour using OSRM
    const detour = await calculateDetour(from, to, pickup);

    if (!detour) {
      return NextResponse.json(
        { 
          error: "Could not calculate route",
          fallback: "Using straight-line distance"
        },
        { status: 500 }
      );
    }

    // Calculate match score with real detour
    const isWithinDetour = detour.detourAdded <= template.max_detour_meters;
    const routeMatchScore = isWithinDetour
      ? Math.max(0, 1.0 - (detour.detourAdded / template.max_detour_meters))
      : 0;

    return NextResponse.json({
      compatible: isWithinDetour,
      detour: {
        original_distance_meters: Math.round(detour.originalDistance),
        detour_distance_meters: Math.round(detour.detourDistance),
        detour_added_meters: Math.round(detour.detourAdded),
        extra_time_seconds: Math.round(detour.extraTime),
      },
      route_match_score: routeMatchScore,
      max_detour_meters: template.max_detour_meters,
    });
  } catch (error) {
    console.error("Error calculating detour:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
