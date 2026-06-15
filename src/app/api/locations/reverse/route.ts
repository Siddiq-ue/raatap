import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json({ error: "Missing lat/lon" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?` +
        new URLSearchParams({
          format: "json",
          lat: lat,
          lon: lon,
          addressdetails: "1",
          "accept-language": "en",
        }),
      {
        headers: {
          "User-Agent": "RaatapApp/1.0 (https://raatap.com)",
        },
      },
    );

    if (!response.ok) {
      throw new Error("Reverse geocoding failed");
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return NextResponse.json(
      { error: "Failed to get address" },
      { status: 500 },
    );
  }
}
