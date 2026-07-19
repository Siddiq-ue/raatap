import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateMatchScoreWithRoadDistance } from "@/lib/matching";
import { getRouteGeometry } from "@/lib/osrm";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Calculate length of a LineString from coordinates (in meters)
 * Uses Haversine formula for each segment
 */
function calculateLineStringLength(coords: [number, number][]): number {
  const R = 6371000; // Earth radius in meters
  let totalLength = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];

    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const deltaLat = (lat2 - lat1) * Math.PI / 180;
    const deltaLng = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) *
      Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    totalLength += R * c;
  }

  return totalLength;
}

/**
 * Create a ride request (Rider)
 * API-First Architecture: Handles profile fetching, insertion, and matching native TS logic.
 */
export async function POST(request: NextRequest) {
  try {
    const { 
      userId, 
      preferredArrivalTime, 
      timeFlexibilityMins = 15, 
      vehiclePreference = 'any', 
      genderPreference = 'both' 
    } = await request.json();

    if (!userId || !preferredArrivalTime) {
      return NextResponse.json(
        { error: "Missing required fields: userId, preferredArrivalTime" },
        { status: 400 }
      );
    }

    console.log(`[Request API] Received Rider request creation for user: ${userId}`);

    // 1. Fetch Rider Profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.error("[Request API] Error fetching profile:", profileError);
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (!profile.prefer_taking_ride) {
      return NextResponse.json({ error: "User is not a rider" }, { status: 400 });
    }

    if (!profile.from_lat || !profile.to_lat) {
      return NextResponse.json({ error: "Profile coordinates missing" }, { status: 400 });
    }

    if (!profile.email_verified) {
      return NextResponse.json({ error: "Email not verified. Please verify your email to request a ride." }, { status: 403 });
    }

    console.log(`[Request API] Fetched Rider coordinates from profiles table`);

    // 2. Check for existing active ride_request (prevent duplicates)
    const { data: existingRequest } = await supabase
      .from("ride_requests")
      .select("id")
      .eq("rider_id", userId)
      .eq("status", "active")
      .single();

    if (existingRequest) {
      console.log(`[Request API] Rider already has active request: ${existingRequest.id}. Skipping creation.`);
      return NextResponse.json({
        success: true,
        ride_request_id: existingRequest.id,
        message: "You already have an active ride request."
      });
    }

    // 3. Fetch OSRM route geometry for rider's journey
    console.log(`[Request API] Fetching OSRM route geometry for rider's journey...`);
    const riderRouteGeometry = await getRouteGeometry(
      { lat: profile.from_lat, lng: profile.from_lng },
      { lat: profile.to_lat, lng: profile.to_lng }
    );

    let routeGeometryWkt: string | null = null;
    let routeDistanceMeters: number | null = null;

    if (riderRouteGeometry) {
      // Convert GeoJSON LineString to WKT
      const coords = riderRouteGeometry.coordinates as [number, number][];
      const lineString = coords.map(c => `${c[0]} ${c[1]}`).join(',');
      routeGeometryWkt = `LINESTRING(${lineString})`;
      
      // Calculate route distance from geometry
      routeDistanceMeters = calculateLineStringLength(coords);
      console.log(`[Request API] OSRM route distance: ${routeDistanceMeters.toFixed(0)} meters`);
    } else {
      console.warn(`[Request API] OSRM route fetch failed, will use straight-line distance`);
    }

    // 3. Check for existing active ride_request (prevent duplicates)
    const { data: existingRequest } = await supabase
      .from("ride_requests")
      .select("id")
      .eq("rider_id", userId)
      .eq("status", "active")
      .single();

    if (existingRequest) {
      console.log(`[Request API] Rider already has active request: ${existingRequest.id}. Skipping creation.`);
      return NextResponse.json({ 
        success: true, 
        ride_request_id: existingRequest.id, 
        message: "You already have an active ride request." 
      });
    }

    // 4. Insert Ride Request with geometry
    const { data: requestRecord, error: insertError } = await supabase
      .from("ride_requests")
      .insert({
        rider_id: userId,
        pickup_location: profile.from_location,
        pickup_lat: profile.from_lat,
        pickup_lng: profile.from_lng,
        pickup_point: `POINT(${profile.from_lng} ${profile.from_lat})`,
        pickup_landmark: profile.pickup_landmark,
        destination_location: profile.to_location,
        destination_lat: profile.to_lat,
        destination_lng: profile.to_lng,
        destination_point: `POINT(${profile.to_lng} ${profile.to_lat})`,
        route_geometry: routeGeometryWkt ? `SRID=4326;${routeGeometryWkt}` : null,
        route_distance_meters: routeDistanceMeters,
        preferred_arrival_time: preferredArrivalTime,
        time_flexibility_mins: timeFlexibilityMins,
        days_needed: profile.days_of_commute,
        vehicle_preference: vehiclePreference,
        gender_preference: genderPreference,
        status: 'active'
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[Request API] Error inserting request:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    console.log(`[Request API] Saved ride_request to database. ID: ${requestRecord.id}`);
    console.log(`[Request API] Executing PostGIS spatial query for intersecting ride_templates...`);

    // 3. Find matches via Spatial Query
    // Query looks for templates whose route intersects pickup and dropoff points
    const pickupPointWkt = `POINT(${profile.from_lng} ${profile.from_lat})`;
    const destinationPointWkt = `POINT(${profile.to_lng} ${profile.to_lat})`;
    
    const { data: matches, error: matchError } = await supabase
      .rpc("find_intersecting_templates", {
        p_pickup_point: pickupPointWkt,
        p_destination_point: destinationPointWkt
      });

    if (matchError) {
      console.error("[Request API] Error finding spatial matches:", matchError);
      return NextResponse.json({ success: true, ride_request_id: requestRecord.id, message: "Request created, but matching failed" });
    }

    if (matches && matches.length > 0) {
      console.log(`[Request API] Found ${matches.length} overlapping routes. Generating scores...`);

      const suggestionsToInsert = [];

      for (const match of matches) {
        // Fetch Host Profile for gender preference comparison
        const { data: hostProfile } = await supabase
          .from("profiles")
          .select("comfortable_with")
          .eq("id", match.host_id)
          .single();

        // Fetch Host's template coordinates (BUG FIX: was using rider's coords for both)
        const { data: hostTemplate } = await supabase
          .from("ride_templates")
          .select("from_lat, from_lng, to_lat, to_lng, route_geometry, max_detour_meters")
          .eq("id", match.template_id)
          .single();

        console.log(`[Request API] DEBUG - Match details:`, {
          hostTemplateCoords: hostTemplate,
          riderCoords: { from: profile.from_lat, from_lng: profile.from_lng, to: profile.to_lat, to_lng: profile.to_lng },
          riderTotalJourneyMeters: match.rider_total_journey_meters
        });

        if (!hostTemplate) {
          console.warn(`[Request API] Could not find host template ${match.template_id}, skipping...`);
          continue;
        }

        // Use OSRM-calculated rider route distance if available, fallback to DB value
        const riderJourneyDistance = routeDistanceMeters || match.rider_total_journey_meters;
        console.log(`[Request API] Rider journey: ${riderJourneyDistance.toFixed(0)}m (OSRM: ${!!routeDistanceMeters})`);

        const score = await calculateMatchScoreWithRoadDistance({
          hostFrom: { lat: hostTemplate.from_lat, lng: hostTemplate.from_lng },
          hostTo: { lat: hostTemplate.to_lat, lng: hostTemplate.to_lng },
          riderPickup: { lat: profile.from_lat, lng: profile.from_lng },
          riderDestination: { lat: profile.to_lat, lng: profile.to_lng },
          riderTotalJourneyMeters: riderJourneyDistance,
          hostGenderPreference: hostProfile?.comfortable_with || 'both',
          riderGenderPreference: genderPreference,
          maxDetourMeters: hostTemplate.max_detour_meters ?? 2000,
          maxDestinationMeters: 1000,
          hostRouteGeometry: hostTemplate.route_geometry
        });

        console.log(`[Request API] Match score details:`, {
          templateId: match.template_id,
          pickupDistance: score.pickup_distance_meters,
          destinationDistance: score.destination_distance_meters,
          overlappingDistance: score.overlapping_distance_meters,
          matchScore: score.match_score,
          sameCollege: score.same_college,
          reason: score.reason
        });

        if (score.compatible) {
          suggestionsToInsert.push({
            ride_template_id: match.template_id,
            ride_request_id: requestRecord.id,
            route_match_score: score.match_score,
            overall_score: score.match_score,
            detour_distance_meters: score.pickup_distance_meters,
            pickup_distance_meters: score.pickup_distance_meters,
            overlapping_distance_meters: score.overlapping_distance_meters,
            status: 'pending_host_approval' // Host-First Flow: Only host sees initially
          });
        }
      }

      if (suggestionsToInsert.length > 0) {
        console.log(`[Request API] Inserted ${suggestionsToInsert.length} match_suggestions pending host approval.`);
        const { error: insertMatchError } = await supabase
          .from("match_suggestions")
          .insert(suggestionsToInsert);

        if (insertMatchError) {
          console.error("[Request API] Error inserting matches:", insertMatchError);
        }
      } else {
        console.log(`[Request API] No compatible matches found after scoring.`);
      }
    } else {
      console.log(`[Request API] No intersecting templates found.`);
    }

    console.log(`[Request API] Ride creation complete.`);
    
    return NextResponse.json({
      success: true,
      ride_request_id: requestRecord.id,
      message: "Ride request created successfully"
    });

  } catch (error) {
    console.error("[Request API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}