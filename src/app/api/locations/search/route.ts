import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Try Google Places API first (better results for colleges, buildings)
  if (googleApiKey) {
    try {
      const googleResponse = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?` +
          new URLSearchParams({
            input: query,
            key: googleApiKey,
            components: "country:in", // Restrict to India
            types: "establishment|geocode", // Include businesses and addresses
            language: "en",
          }),
      );

      const googleData = await googleResponse.json();

      if (googleData.status === "OK" && googleData.predictions?.length > 0) {
        // Transform Google results to our format
        const results = googleData.predictions.map(
          (prediction: {
            place_id: string;
            description: string;
            structured_formatting?: {
              main_text: string;
              secondary_text: string;
            };
          }) => ({
            place_id: prediction.place_id,
            display_name: prediction.description,
            main_text: prediction.structured_formatting?.main_text || "",
            secondary_text:
              prediction.structured_formatting?.secondary_text || "",
          }),
        );
        return NextResponse.json(results);
      }

      // If Google returns no results or error, fall back to Nominatim
      console.log(
        "Google Places returned no results, falling back to Nominatim",
      );
    } catch (error) {
      console.error("Google Places API error:", error);
    }
  }

  // Fallback to OpenStreetMap Nominatim (free)
  try {
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
