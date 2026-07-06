import { NextRequest, NextResponse } from "next/server";

// Simple in-memory cache for Nominatim to respect the 1 request/sec rate limit
let lastNominatimRequestTime = 0;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  const locationIqApiKey = process.env.LOCATIONIQ_API_KEY;

  // Try LocationIQ API first (Primary provider)
  if (locationIqApiKey) {
    try {
      const locationIqResponse = await fetch(
        `https://api.locationiq.com/v1/autocomplete.php?` +
          new URLSearchParams({
            q: query,
            key: locationIqApiKey,
            countrycodes: "in", // Restrict to India
            limit: "5",
            format: "json",
          }),
      );

      if (locationIqResponse.ok) {
        const data = await locationIqResponse.json();
        
        if (Array.isArray(data) && data.length > 0) {
          // Transform LocationIQ results to our format
          const results = data.map((prediction: any) => ({
            place_id: prediction.place_id,
            display_name: prediction.display_name,
            lat: prediction.lat,
            lon: prediction.lon,
            main_text: prediction.address?.name || prediction.display_name.split(',')[0],
            secondary_text: prediction.display_name,
          }));
          return NextResponse.json(results);
        }
      } else {
         console.warn(`LocationIQ returned status: ${locationIqResponse.status}`);
      }
    } catch (error) {
      console.error("LocationIQ API error:", error);
    }
  }

  // Fallback to OpenStreetMap Nominatim (free)
  try {
    // Respect Nominatim 1 request per second policy
    const now = Date.now();
    const timeSinceLastRequest = now - lastNominatimRequestTime;
    
    if (timeSinceLastRequest < 1000) {
      // Delay to ensure we respect 1req/sec
      await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLastRequest));
    }
    lastNominatimRequestTime = Date.now();

    const searchQueries = [
      query,
      `${query}, Hyderabad, India`,
      `${query}, Telangana, India`,
    ];

    const allResults: Array<{
      place_id: number;
      display_name: string;
      lat: string;
      lon: string;
    }> = [];

    for (const searchQuery of searchQueries) {
      if (allResults.length >= 6) break;

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
            new URLSearchParams({
              format: "json",
              q: searchQuery,
              limit: "5",
              addressdetails: "1",
              "accept-language": "en",
            }),
          {
            headers: {
              "User-Agent": "RaatapApp/1.0 (https://raatap.com)",
            },
          },
        );

        if (!response.ok) continue;

        const data = await response.json();
        for (const result of data) {
          if (!allResults.find((r) => r.place_id === result.place_id)) {
            allResults.push(result);
          }
        }
      } catch (e) {
        console.error("Nominatim search failed:", searchQuery, e);
      }
    }

    return NextResponse.json(allResults.slice(0, 8));
  } catch (error) {
    console.error("Location search error:", error);
    return NextResponse.json(
      { error: "Failed to search locations" },
      { status: 500 },
    );
  }
}
