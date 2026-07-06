import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const placeId = searchParams.get("place_id");
  const query = searchParams.get("q");

  if (!placeId && !query) {
    return NextResponse.json({ error: "Missing place_id or q" }, { status: 400 });
  }

  const locationIqApiKey = process.env.LOCATIONIQ_API_KEY;

  if (!locationIqApiKey) {
    return NextResponse.json(
      { error: "LocationIQ API key not configured" },
      { status: 500 }
    );
  }

  try {
    const searchStr = query || placeId || "";
    
    const response = await fetch(
      `https://us1.locationiq.com/v1/search.php?` +
        new URLSearchParams({
          q: searchStr,
          key: locationIqApiKey,
          format: "json",
          limit: "1"
        })
    );

    if (!response.ok) {
      throw new Error("LocationIQ Geocoding API request failed");
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: `Geocoding failed: No results` },
        { status: 404 }
      );
    }

    const result = data[0];

    return NextResponse.json({
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon), // Note the renaming from lon to lng for our frontend
      formatted_address: result.display_name,
      place_id: result.place_id,
    });
  } catch (error) {
    console.error("Geocoding error:", error);
    return NextResponse.json(
      { error: "Failed to geocode location" },
      { status: 500 }
    );
  }
}