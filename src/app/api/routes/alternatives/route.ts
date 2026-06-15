import { NextRequest, NextResponse } from "next/server";
import { getAlternativeRoutes } from "@/lib/osrm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fromLat = parseFloat(searchParams.get("fromLat") || "0");
    const fromLng = parseFloat(searchParams.get("fromLng") || "0");
    const toLat = parseFloat(searchParams.get("toLat") || "0");
    const toLng = parseFloat(searchParams.get("toLng") || "0");

    if (!fromLat || !fromLng || !toLat || !toLng) {
      return NextResponse.json(
        { error: "Missing or invalid coordinates" },
        { status: 400 }
      );
    }

    const result = await getAlternativeRoutes(
      { lat: fromLat, lng: fromLng },
      { lat: toLat, lng: toLng },
      3
    );

    if (!result) {
      return NextResponse.json(
        { error: "No routes found" },
        { status: 404 }
      );
    }

    const routes = result.routes.map((route) => ({
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry,
    }));

    return NextResponse.json({ routes });
  } catch (error) {
    console.error("Error in routes/alternatives API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
