import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const placeId = searchParams.get("place_id");

  if (!placeId) {
    return NextResponse.json({ error: "Missing place_id" }, { status: 400 });
  }

  const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!googleApiKey) {
    return NextResponse.json(
      { error: "Google Maps API key not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?` +
        new URLSearchParams({
          place_id: placeId,
          key: googleApiKey,
        })
    );

    if (!response.ok) {
      throw new Error("Google Geocoding API request failed");
    }

    const data = await response.json();

    if (data.status !== "OK" || !data.results?.length) {
      return NextResponse.json(
        { error: `Geocoding failed: ${data.status}` },
        { status: 404 }
      );
    }

    const result = data.results[0];
    const location = result.geometry.location;

    return NextResponse.json({
      lat: location.lat,
      lng: location.lng,
      formatted_address: result.formatted_address,
      place_id: placeId,
    });
  } catch (error) {
    console.error("Geocoding error:", error);
    return NextResponse.json(
      { error: "Failed to geocode location" },
      { status: 500 }
    );
  }
}