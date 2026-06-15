import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRouteGeometry } from "@/lib/osrm";
import { calculateMatchScore, checkRedFlag } from "@/lib/matching";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Create a ride template (Host)
 * API-First Architecture: Handles profile fetching, geometry, insertion, and matching native TS logic.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, vehicleType, availableSeats, maxDetourMeters = 2000, returnTime, routeGeometry } = await request.json();

    if (!userId || !vehicleType) {
      return NextResponse.json(
        { error: "Missing required fields: userId, vehicleType" },
        { status: 400 }
      );
    }

    console.log(`[Template API] Received Host ride creation request for user: ${userId}`);

    // 1. Fetch Host Profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.error("[Template API] Error fetching profile:", profileError);
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (!profile.prefer_hosting) {
      return NextResponse.json({ error: "User is not a host" }, { status: 400 });
    }

    if (!profile.from_lat || !profile.to_lat) {
      return NextResponse.json({ error: "Profile coordinates missing" }, { status: 400 });
    }

    if (!profile.email_verified) {
      return NextResponse.json({ error: "Email not verified. Please verify your email to create a ride." }, { status: 403 });
    }

    console.log(`[Template API] Fetched Host coordinates from profiles table`);

    // 2. Get Route Geometry - use passed geometry or fetch from OSRM
    let geometry;
    if (routeGeometry && routeGeometry.coordinates) {
      console.log(`[Template API] Using pre-selected route geometry from client`);
      geometry = routeGeometry;
    } else {
      console.log(`[Template API] Requesting Route Geometry from Routing Provider...`);
      geometry = await getRouteGeometry(
        { lat: profile.from_lat, lng: profile.from_lng },
        { lat: profile.to_lat, lng: profile.to_lng }
      );

      if (!geometry) {
        console.error("[Template API] Failed to get route geometry");
        return NextResponse.json({ error: "Failed to calculate route geometry" }, { status: 500 });
      }
    }

    console.log(`[Template API] Received valid Route Geometry (LineString). Saving to database...`);
    
    // PostGIS expects WKT (Well-Known Text) for Geography inserts
    // OSRM returns GeoJSON geometry coordinates: [[lng, lat], [lng, lat], ...]
    const wktCoordinates = geometry.coordinates.map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(', ');
    const wktGeometry = `LINESTRING(${wktCoordinates})`;
    const wktForRpc = `LINESTRING(${wktCoordinates})`;

    // Calculate seats if not provided
    let calculatedSeats = availableSeats;
    if (!calculatedSeats || calculatedSeats < 1) {
      calculatedSeats = vehicleType === '2_wheeler' ? 1 : (vehicleType === '4_wheeler' ? 3 : 1);
    }

    // 3. Check for existing active ride_template (prevent duplicates)
    const { data: existingTemplate } = await supabase
      .from("ride_templates")
      .select("id")
      .eq("host_id", userId)
      .eq("status", "active")
      .single();

    if (existingTemplate) {
      console.log(`[Template API] Host already has active template: ${existingTemplate.id}. Skipping creation.`);
      return NextResponse.json({ 
        success: true, 
        ride_template_id: existingTemplate.id, 
        message: "You already have an active ride template. Please update it instead." 
      });
    }

    // 4. Insert Ride Template
    const { data: template, error: insertError } = await supabase
      .from("ride_templates")
      .insert({
        host_id: userId,
        from_location: profile.from_location,
        from_lat: profile.from_lat,
        from_lng: profile.from_lng,
        from_point: `POINT(${profile.from_lng} ${profile.from_lat})`,
        to_location: profile.to_location,
        to_lat: profile.to_lat,
        to_lng: profile.to_lng,
        to_point: `POINT(${profile.to_lng} ${profile.to_lat})`,
        departure_time: profile.leave_home_time,
        return_time: returnTime || null,
        days_available: profile.days_of_commute,
        vehicle_type: vehicleType,
        available_seats: calculatedSeats,
        max_detour_meters: maxDetourMeters,
        gender_preference: profile.comfortable_with || 'both',
        route_geometry: wktGeometry,
        status: 'active'
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[Template API] Error inserting template:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    console.log(`[Template API] Successfully saved ride_template. ID: ${template.id}`);
    console.log(`[Template API] Executing PostGIS spatial query for matching ride_requests...`);

    // 4. Find matches via Spatial Query
    const { data: matches, error: matchError } = await supabase
      .rpc("find_intersecting_requests", {
        p_route_geometry: wktForRpc,
        p_max_detour_meters: maxDetourMeters
      });

    if (matchError) {
      console.error("[Template API] Error finding spatial matches:", matchError);
      // Don't fail the ride creation just because matching failed
      return NextResponse.json({ success: true, ride_template_id: template.id, message: "Ride created, but matching failed" });
    }

    // Check seat availability
    const { data: rideTemplate } = await supabase
      .from("ride_templates")
      .select("available_seats, seats_taken")
      .eq("id", template.id)
      .single();

    const remainingSeats = rideTemplate ? (rideTemplate.available_seats - (rideTemplate.seats_taken || 0)) : 0;
    
    if (matches && matches.length > 0 && remainingSeats > 0) {
      console.log(`[Template API] Found ${matches.length} overlapping requests. Generating scores...`);
      
      const suggestionsToInsert = [];

      for (const match of matches) {
        // Fetch Rider Profile for gender preference and institution
        const { data: riderProfile } = await supabase
          .from("profiles")
          .select("comfortable_with, institution")
          .eq("id", match.rider_id)
          .single();

        // Check for red flags - skip if blocked
        const { hasRedFlag, reason: blockReason } = await checkRedFlag(supabase as any, userId, match.rider_id);
        if (hasRedFlag) {
          console.log(`[Template API] Skipping rider ${match.rider_id} - red flag (${blockReason})`);
          continue;
        }

        // BUG FIX: Extract rider's pickup/destination coords from match (geography) - was using host's coords
        // match.pickup_point and match.destination_point are GEOGRAPHY, we need to extract lat/lng
        const pickupPoint = match.pickup_point as any;
        const destPoint = match.destination_point as any;
        const riderPickupLat = pickupPoint?.coordinates?.[1] ?? null;
        const riderPickupLng = pickupPoint?.coordinates?.[0] ?? null;
        const riderDestLat = destPoint?.coordinates?.[1] ?? null;
        const riderDestLng = destPoint?.coordinates?.[0] ?? null;

        console.log(`[Template API] DEBUG - Match details:`, {
          hostCoords: { from: profile.from_lat, from_lng: profile.from_lng, to: profile.to_lat, to_lng: profile.to_lng },
          riderCoords: { pickupLat: riderPickupLat, pickupLng: riderPickupLng, destLat: riderDestLat, destLng: riderDestLng },
          riderTotalJourneyMeters: match.rider_total_journey_meters
        });

        if (!riderPickupLat || !riderDestLat) {
          console.warn(`[Template API] Could not extract rider coordinates from match, skipping...`);
          continue;
        }

        const score = calculateMatchScore({
          hostFrom: { lat: profile.from_lat, lng: profile.from_lng },
          hostTo: { lat: profile.to_lat, lng: profile.to_lng },
          riderPickup: { lat: riderPickupLat, lng: riderPickupLng },
          riderDestination: { lat: riderDestLat, lng: riderDestLng },
          riderTotalJourneyMeters: match.rider_total_journey_meters,
          hostGenderPreference: profile.comfortable_with || 'both',
          riderGenderPreference: riderProfile?.comfortable_with || 'both',
          hostCollege: profile.institution,
          riderCollege: riderProfile?.institution,
          maxDetourMeters: maxDetourMeters,
          maxDestinationMeters: 1000
        });

        if (score.compatible) {
          suggestionsToInsert.push({
            ride_template_id: template.id,
            ride_request_id: match.request_id,
            route_match_score: score.match_score,
            overall_score: score.match_score,
            detour_distance_meters: score.pickup_distance_meters, // Legacy column name mapping
            pickup_distance_meters: score.pickup_distance_meters,
            overlapping_distance_meters: score.overlapping_distance_meters,
            status: 'pending_host_approval'
          });
        }
      }

      // Sort by score (highest first) and limit to available seats
      suggestionsToInsert.sort((a, b) => b.overall_score - a.overall_score);
      const finalSuggestions = suggestionsToInsert.slice(0, remainingSeats);

      if (finalSuggestions.length > 0) {
        console.log(`[Template API] Inserting top ${finalSuggestions.length} match suggestions (host has ${remainingSeats} seats)...`);
        console.log(`[Template API] Inserting ${suggestionsToInsert.length} valid match_suggestions pending host approval...`);
        const { error: insertMatchError } = await supabase
          .from("match_suggestions")
          .insert(finalSuggestions);

        if (insertMatchError) {
          console.error("[Template API] Error inserting matches:", insertMatchError);
        }
      } else {
        console.log(`[Template API] No compatible matches found after scoring.`);
      }
    } else if (remainingSeats <= 0) {
      console.log(`[Template API] Host has no available seats, skipping match suggestions.`);
    } else {
      console.log(`[Template API] No intersecting requests found.`);
    }

    console.log(`[Template API] Ride creation complete.`);
    
    return NextResponse.json({
      success: true,
      ride_template_id: template.id,
      message: "Ride template created successfully"
    });

  } catch (error) {
    console.error("[Template API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
