import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRouteGeometry } from "@/lib/osrm";
import { calculateMatchScoreWithRoadDistance } from "@/lib/matching";

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

export async function POST(request: NextRequest) {
  console.log("[OTP Verify] ============================================");
  console.log("[OTP Verify] Received OTP verification request");
  
  try {
    const { otp, userId } = await request.json();

    if (!otp || !userId) {
      console.log("[OTP Verify] Missing OTP or userId");
      return NextResponse.json(
        { error: "OTP and userId are required" },
        { status: 400 },
      );
    }

    const { data: authUserData, error: authUserError } =
      await supabase.auth.admin.getUserById(userId);

    if (authUserError || !authUserData?.user) {
      console.error("[OTP Verify] Invalid userId:", authUserError);
      return NextResponse.json(
        { error: "Session not found for this user. Please sign in again." },
        { status: 401 },
      );
    }

    const { data: otpRecord, error: fetchError } = await supabase
      .from("email_otps")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (fetchError || !otpRecord) {
      console.log("[OTP Verify] No OTP record found");
      return NextResponse.json(
        { error: "No OTP found. Please request a new one." },
        { status: 400 },
      );
    }

    if (new Date(otpRecord.expires_at) < new Date()) {
      console.log("[OTP Verify] OTP expired");
      return NextResponse.json(
        { error: "OTP has expired. Please request a new one." },
        { status: 400 },
      );
    }

    if (otpRecord.verified) {
      console.log("[OTP Verify] OTP already verified");
      return NextResponse.json(
        { error: "OTP already used. Please request a new one." },
        { status: 400 },
      );
    }

    if (otpRecord.otp !== otp) {
      console.log("[OTP Verify] Invalid OTP");
      return NextResponse.json(
        { error: "Invalid OTP. Please try again." },
        { status: 400 },
      );
    }

    console.log("[OTP Verify] OTP verified successfully");

    // Mark OTP as verified
    await supabase
      .from("email_otps")
      .update({ verified: true })
      .eq("user_id", userId);

    // Fetch profile
    console.log("[OTP Verify] Fetching profile for user:", userId);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.error("[OTP Verify] Error fetching profile:", profileError);
      return NextResponse.json({
        success: true,
        message: "Email verified successfully"
      });
    }

    console.log(`[OTP Verify] Profile fetched - Name: ${profile.full_name}`);
    console.log(`[OTP Verify] - Prefer Hosting: ${profile.prefer_hosting}`);
    console.log(`[OTP Verify] - Prefer Taking Ride: ${profile.prefer_taking_ride}`);
    console.log(`[OTP Verify] - Email Verified (before): ${profile.email_verified}`);

    // If already verified (by admin), just return success
    if (profile.email_verified) {
      console.log("[OTP Verify] Profile already verified, skipping ride creation");
      return NextResponse.json({
        success: true,
        message: "Email verified successfully"
      });
    }

    // Update profile email_verified
    console.log("[OTP Verify] Updating profile with email_verified = true");
    await supabase
      .from("profiles")
      .update({ email_verified: true })
      .eq("id", userId);

    console.log("[OTP Verify] Profile updated");

    // Reactivate existing rides (in case they were deactivated due to unverified email)
    console.log("[OTP Verify] Reactivating any existing rides for verified user...");
    
    // Reactivate ride_templates
    await supabase
      .from("ride_templates")
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq("host_id", userId)
      .is("status", null);

    // Reactivate ride_requests
    await supabase
      .from("ride_requests")
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq("rider_id", userId)
      .is("status", null);

    // Check if rides already exist (check for active status)
    const { data: existingTemplate } = await supabase
      .from("ride_templates")
      .select("id")
      .eq("host_id", userId)
      .eq("status", "active")
      .single();

    const { data: existingRequest } = await supabase
      .from("ride_requests")
      .select("id")
      .eq("rider_id", userId)
      .single();

    let rideCreated = false;
    let rideType = "";

    // Create ride_template if user is a host and no active template exists
    if (profile.prefer_hosting && !existingTemplate) {
      console.log("[OTP Verify] User is a HOST, creating ride_template");
      
      if (profile.from_lat && profile.from_lng && profile.to_lat && profile.to_lng && profile.vehicle_type) {
        try {
          const geometry = await getRouteGeometry(
            { lat: profile.from_lat, lng: profile.from_lng },
            { lat: profile.to_lat, lng: profile.to_lng }
          );

          if (geometry) {
            const wktCoordinates = geometry.coordinates.map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(', ');
            const wktGeometry = `LINESTRING(${wktCoordinates})`;
            const wktForRpc = `LINESTRING(${wktCoordinates})`;

            let availableSeats = 1;
            if (profile.vehicle_type === '2_wheeler') {
              availableSeats = 1;
            } else if (profile.vehicle_type === '4_wheeler') {
              availableSeats = Math.min(profile.available_seats || 3, 3);
            }

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
                return_time: profile.leave_college_time || null,
                days_available: profile.days_of_commute,
                vehicle_type: profile.vehicle_type,
                available_seats: availableSeats,
                max_detour_meters: 2000,
                gender_preference: profile.comfortable_with || 'both',
                route_geometry: wktGeometry,
                status: 'active'
              })
              .select("id")
              .single();

            if (!insertError && template) {
              console.log(`[OTP Verify] ✅ Ride template created! ID: ${template.id}`);
              rideCreated = true;
              rideType = "host";

              // Find matching ride requests
              const { data: matches } = await supabase
                .rpc("find_intersecting_requests", {
                  p_route_geometry: wktForRpc,
                  p_max_detour_meters: 2000
                });

              // Check seat availability
              const { data: rideTemplate } = await supabase
                .from("ride_templates")
                .select("available_seats, seats_taken")
                .eq("id", template.id)
                .single();

              const remainingSeats = rideTemplate ? (rideTemplate.available_seats - (rideTemplate.seats_taken || 0)) : 0;

              if (matches && matches.length > 0 && remainingSeats > 0) {
                console.log(`[OTP Verify] Found ${matches.length} matching ride requests`);
                
                const suggestionsToInsert = [];
                for (const match of matches) {
                  const { data: riderProfile } = await supabase
                    .from("profiles")
                    .select("comfortable_with, institution, email_verified")
                    .eq("id", match.rider_id)
                    .single();

                  // Only match with verified riders
                  if (!riderProfile?.email_verified) {
                    console.log(`[OTP Verify] Skipping rider ${match.rider_id} - not verified`);
                    continue;
                  }

                  // Extract rider's actual pickup/destination coords from match (geography) -
                  // was using host's own profile coords for both, which made every match's
                  // overlap calculation compare the host's route against itself.
                  const pickupPoint = match.pickup_point as any;
                  const destPoint = match.destination_point as any;
                  const riderPickupLat = pickupPoint?.coordinates?.[1] ?? null;
                  const riderPickupLng = pickupPoint?.coordinates?.[0] ?? null;
                  const riderDestLat = destPoint?.coordinates?.[1] ?? null;
                  const riderDestLng = destPoint?.coordinates?.[0] ?? null;

                  if (!riderPickupLat || !riderDestLat) {
                    console.warn(`[OTP Verify] Could not extract rider coordinates from match, skipping...`);
                    continue;
                  }

                  // Fetch rider's own real route geometry for road-connectivity-aware overlap
                  const { data: riderRequestGeometry } = await supabase
                    .from("ride_requests")
                    .select("route_geometry")
                    .eq("id", match.request_id)
                    .single();

                  const score = await calculateMatchScoreWithRoadDistance({
                    hostFrom: { lat: profile.from_lat, lng: profile.from_lng },
                    hostTo: { lat: profile.to_lat, lng: profile.to_lng },
                    riderPickup: { lat: riderPickupLat, lng: riderPickupLng },
                    riderDestination: { lat: riderDestLat, lng: riderDestLng },
                    riderTotalJourneyMeters: match.rider_total_journey_meters,
                    hostGenderPreference: profile.comfortable_with || 'both',
                    riderGenderPreference: riderProfile?.comfortable_with || 'both',
                    hostCollege: profile.institution,
                    riderCollege: riderProfile?.institution,
                    maxDetourMeters: 2000,
                    maxDestinationMeters: 1000,
                    hostRouteGeometry: geometry,
                    riderRouteGeometry: riderRequestGeometry?.route_geometry
                  });

                  if (score.compatible) {
                    suggestionsToInsert.push({
                      ride_template_id: template.id,
                      ride_request_id: match.request_id,
                      route_match_score: score.match_score,
                      overall_score: score.match_score,
                      detour_distance_meters: score.pickup_distance_meters,
                      pickup_distance_meters: score.pickup_distance_meters,
                      overlapping_distance_meters: score.overlapping_distance_meters,
                      status: 'pending_host_approval'
                    });
                  }
                }

                // Sort by score and limit to available seats
                suggestionsToInsert.sort((a, b) => b.overall_score - a.overall_score);
                const finalSuggestions = suggestionsToInsert.slice(0, remainingSeats);

                if (finalSuggestions.length > 0) {
                  await supabase.from("match_suggestions").insert(finalSuggestions);
                  console.log(`[OTP Verify] ✅ Created ${finalSuggestions.length} match suggestions (host has ${remainingSeats} seats)`);
                }
              }
            }
          }
        } catch (err) {
          console.error("[OTP Verify] Error creating ride template:", err);
        }
      }
    }

    // Create ride_request if user is a rider and no request exists
    if (profile.prefer_taking_ride && !existingRequest) {
      console.log("[OTP Verify] User is a RIDER, creating ride_request");

      if (profile.from_lat && profile.from_lng && profile.to_lat && profile.to_lng) {
        // Fetch OSRM route geometry for rider's journey
        console.log("[OTP Verify] Fetching OSRM route geometry for rider...");
        const riderRouteGeometry = await getRouteGeometry(
          { lat: profile.from_lat, lng: profile.from_lng },
          { lat: profile.to_lat, lng: profile.to_lng }
        );

        let routeGeometryWkt: string | null = null;
        let routeDistanceMeters: number | null = null;

        if (riderRouteGeometry) {
          const coords = riderRouteGeometry.coordinates as [number, number][];
          const lineString = coords.map(c => `${c[0]} ${c[1]}`).join(',');
          routeGeometryWkt = `LINESTRING(${lineString})`;
          routeDistanceMeters = calculateLineStringLength(coords);
          console.log(`[OTP Verify] OSRM route distance: ${routeDistanceMeters.toFixed(0)}m`);
        }

        const { data: request, error: requestError } = await supabase
          .from("ride_requests")
          .insert({
            rider_id: userId,
            pickup_location: profile.from_location,
            pickup_lat: profile.from_lat,
            pickup_lng: profile.from_lng,
            pickup_point: `POINT(${profile.from_lng} ${profile.from_lat})`,
            destination_location: profile.to_location,
            destination_lat: profile.to_lat,
            destination_lng: profile.to_lng,
            destination_point: `POINT(${profile.to_lng} ${profile.to_lat})`,
            route_geometry: routeGeometryWkt ? `SRID=4326;${routeGeometryWkt}` : null,
            route_distance_meters: routeDistanceMeters,
            preferred_arrival_time: profile.leave_home_time,
            days_needed: profile.days_of_commute,
            gender_preference: profile.comfortable_with || 'both',
            status: 'active'
          })
          .select("id")
          .single();

        if (!requestError && request) {
          console.log(`[OTP Verify] ✅ Ride request created! ID: ${request.id}`);
          
          if (!rideCreated) {
            rideCreated = true;
            rideType = "rider";
          } else {
            rideType = "both";
          }

          // Find matching ride templates
          const pickupPointWkt = `POINT(${profile.from_lng} ${profile.from_lat})`;
          const destinationPointWkt = `POINT(${profile.to_lng} ${profile.to_lat})`;

          const { data: matches } = await supabase
            .rpc("find_intersecting_templates", {
              p_pickup_point: pickupPointWkt,
              p_destination_point: destinationPointWkt
            });

          if (matches && matches.length > 0) {
            console.log(`[OTP Verify] Found ${matches.length} matching ride templates`);
            
            const suggestionsToInsert = [];
            for (const match of matches) {
              // Check if host has available seats, and fetch the host's actual
              // route coordinates (was using rider's own profile coords for both)
              const { data: hostTemplate } = await supabase
                .from("ride_templates")
                .select("available_seats, seats_taken, from_lat, from_lng, to_lat, to_lng, route_geometry, max_detour_meters")
                .eq("id", match.template_id)
                .single();

              const remainingSeats = hostTemplate
                ? (hostTemplate.available_seats - (hostTemplate.seats_taken || 0))
                : 0;

              if (remainingSeats <= 0) continue; // Skip hosts with no seats

              if (!hostTemplate?.from_lat || !hostTemplate?.to_lat) {
                console.warn(`[OTP Verify] Could not find host template coordinates, skipping...`);
                continue;
              }

              const { data: hostProfile } = await supabase
                .from("profiles")
                .select("comfortable_with, institution, email_verified")
                .eq("id", match.host_id)
                .single();

              // Only match with verified hosts
              if (!hostProfile?.email_verified) {
                console.log(`[OTP Verify] Skipping host ${match.host_id} - not verified`);
                continue;
              }

              // Use OSRM-calculated rider route distance if available
              const riderJourneyDistance = routeDistanceMeters || match.rider_total_journey_meters;
              console.log(`[OTP Verify] Rider journey: ${riderJourneyDistance.toFixed(0)}m (OSRM: ${!!routeDistanceMeters})`);

              const score = await calculateMatchScoreWithRoadDistance({
                hostFrom: { lat: hostTemplate.from_lat, lng: hostTemplate.from_lng },
                hostTo: { lat: hostTemplate.to_lat, lng: hostTemplate.to_lng },
                riderPickup: { lat: profile.from_lat, lng: profile.from_lng },
                riderDestination: { lat: profile.to_lat, lng: profile.to_lng },
                riderTotalJourneyMeters: riderJourneyDistance,
                hostGenderPreference: hostProfile?.comfortable_with || 'both',
                riderGenderPreference: profile.comfortable_with || 'both',
                hostCollege: hostProfile?.institution,
                riderCollege: profile.institution,
                maxDetourMeters: hostTemplate.max_detour_meters ?? 2000,
                maxDestinationMeters: 1000,
                hostRouteGeometry: hostTemplate.route_geometry,
                riderRouteGeometry
              });

              if (score.compatible) {
                suggestionsToInsert.push({
                  ride_template_id: match.template_id,
                  ride_request_id: request.id,
                  route_match_score: score.match_score,
                  overall_score: score.match_score,
                  detour_distance_meters: score.pickup_distance_meters,
                  pickup_distance_meters: score.pickup_distance_meters,
                  overlapping_distance_meters: score.overlapping_distance_meters,
                  status: 'pending_host_approval'
                });
              }
            }

            if (suggestionsToInsert.length > 0) {
              await supabase.from("match_suggestions").insert(suggestionsToInsert);
              console.log(`[OTP Verify] ✅ Created ${suggestionsToInsert.length} match suggestions`);
            }
          }
        }
      }
    }

    console.log("[OTP Verify] ============================================");
    console.log(`[OTP Verify] Complete! Ride created: ${rideCreated}, Type: ${rideType}`);
    console.log("[OTP Verify] ============================================");

    return NextResponse.json({
      success: true,
      message: rideCreated 
        ? `Email verified! Your ${rideType} ride has been created.`
        : "Email verified successfully",
      rideCreated,
      rideType
    });

  } catch (error) {
    console.error("[OTP Verify] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
