import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRouteGeometry } from "@/lib/osrm";
import { calculateMatchScore } from "@/lib/matching";

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

export async function POST(req: NextRequest) {
  console.log("[Admin Verify] ============================================");
  console.log("[Admin Verify] Received verification request");
  
  try {
    const cookieHeader = req.headers.get("cookie");
    if (!cookieHeader || !cookieHeader.includes("admin_session=")) {
      console.log("[Admin Verify] Unauthorized: No admin session cookie");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, action, rejectionReason } = await req.json();
    console.log(`[Admin Verify] User ID: ${userId}, Action: ${action}, Reason: ${rejectionReason}`);

    if (!userId || !action || !["approve", "reject"].includes(action)) {
      console.log("[Admin Verify] Invalid parameters");
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    if (action === "reject" && !rejectionReason) {
      console.log("[Admin Verify] Rejection reason required");
      return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 });
    }

    // Fetch the full profile first
    console.log(`[Admin Verify] Fetching profile for user: ${userId}`);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.error("[Admin Verify] Error fetching profile:", profileError);
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    console.log(`[Admin Verify] Profile fetched successfully`);
    console.log(`[Admin Verify] - Name: ${profile.full_name}`);
    console.log(`[Admin Verify] - Email: ${profile.institutional_email}`);
    console.log(`[Admin Verify] - Prefer Hosting: ${profile.prefer_hosting}`);
    console.log(`[Admin Verify] - Prefer Taking Ride: ${profile.prefer_taking_ride}`);
    console.log(`[Admin Verify] - From Location: ${profile.from_location}`);
    console.log(`[Admin Verify] - To Location: ${profile.to_location}`);
    console.log(`[Admin Verify] - Vehicle Type: ${profile.vehicle_type}`);
    console.log(`[Admin Verify] - Email Verified (before): ${profile.email_verified}`);

    let updatePayload: any = {};
    let rideCreated = false;
    let rideType = "";

    if (action === "approve") {
      console.log("[Admin Verify] Processing APPROVE action");
      
      updatePayload = {
        email_verified: true,
        institutional_email: "Manual Approval",
      };

      // Update profile first
      console.log("[Admin Verify] Updating profile with email_verified = true");
      const { error: updateError } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", userId);

      if (updateError) {
        console.error("[Admin Verify] Supabase update error:", updateError);
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }

      console.log("[Admin Verify] Profile updated successfully");

      // Reactivate existing rides (in case they were deactivated due to unverified email)
      console.log("[Admin Verify] Reactivating any existing rides for verified user...");
      
      // Reactivate ride_templates
      const { error: reactivateTemplateError } = await supabase
        .from("ride_templates")
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq("host_id", userId)
        .is("status", null);

      if (reactivateTemplateError) {
        console.error("[Admin Verify] Error reactivating ride_templates:", reactivateTemplateError);
      }

      // Reactivate ride_requests
      const { error: reactivateRequestError } = await supabase
        .from("ride_requests")
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq("rider_id", userId)
        .is("status", null);

      if (reactivateRequestError) {
        console.error("[Admin Verify] Error reactivating ride_requests:", reactivateRequestError);
      }

      // Create ride_template if user is a host
      if (profile.prefer_hosting) {
        console.log("[Admin Verify] User is a HOST, attempting to create ride_template");
        console.log(`[Admin Verify] Checking prerequisites:`);
        console.log(`[Admin Verify] - Has from coordinates: ${!!profile.from_lat && !!profile.from_lng}`);
        console.log(`[Admin Verify] - Has to coordinates: ${!!profile.to_lat && !!profile.to_lng}`);
        console.log(`[Admin Verify] - Has vehicle type: ${!!profile.vehicle_type}`);

        // Check for existing active template (prevent duplicates)
        const { data: existingTemplate } = await supabase
          .from("ride_templates")
          .select("id")
          .eq("host_id", userId)
          .eq("status", "active")
          .single();

        if (existingTemplate) {
          console.log(`[Admin Verify] Host already has active template: ${existingTemplate.id}. Skipping creation.`);
          rideType = "host";
        } else if (profile.from_lat && profile.from_lng && profile.to_lat && profile.to_lng && profile.vehicle_type) {
          try {
            // Get route geometry
            console.log("[Admin Verify] Fetching route geometry from OSRM...");
            const geometry = await getRouteGeometry(
              { lat: profile.from_lat, lng: profile.from_lng },
              { lat: profile.to_lat, lng: profile.to_lng }
            );

            if (!geometry) {
              console.error("[Admin Verify] Failed to get route geometry from OSRM");
            } else {
              console.log("[Admin Verify] Route geometry received successfully");
              
              // Convert to WKT for database insert
              const wktCoordinates = geometry.coordinates.map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(', ');
              const wktGeometry = `LINESTRING(${wktCoordinates})`;

              // For RPC calls, use WKT format
              const wktForRpc = `LINESTRING(${wktCoordinates})`;

              // Calculate available seats
              const vehicleType = profile.vehicle_type;
              let availableSeats = 1;
              if (vehicleType === '2_wheeler') {
                availableSeats = 1;
              } else if (vehicleType === '4_wheeler') {
                availableSeats = Math.min(profile.available_seats || 3, 3);
              }

              console.log(`[Admin Verify] Inserting ride_template with ${availableSeats} seats`);

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
                  vehicle_type: vehicleType,
                  available_seats: availableSeats,
                  max_detour_meters: 2000,
                  gender_preference: profile.comfortable_with || 'both',
                  route_geometry: wktGeometry,
                  status: 'active'
                })
                .select("id")
                .single();

              if (insertError) {
                console.error("[Admin Verify] Error inserting ride_template:", insertError);
              } else {
                console.log(`[Admin Verify] ✅ Ride template created successfully! ID: ${template.id}`);
                rideCreated = true;
                rideType = "host";

                // Find matching ride requests
                console.log("[Admin Verify] Searching for matching ride requests...");
                
                const { data: matches, error: matchError } = await supabase
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

                if (matchError) {
                  console.error("[Admin Verify] Error finding spatial matches:", matchError);
                } else if (matches && matches.length > 0 && remainingSeats > 0) {
                  console.log(`[Admin Verify] Found ${matches.length} intersecting ride requests`);
                  
                  const suggestionsToInsert = [];

                  for (const match of matches) {
                    // Check if rider is verified - only create matches for verified riders
                    const { data: riderProfile } = await supabase
                      .from("profiles")
                      .select("comfortable_with, institution, email_verified")
                      .eq("id", match.rider_id)
                      .single();

                    if (!riderProfile?.email_verified) {
                      console.log(`[Admin Verify] Skipping rider ${match.rider_id} - not verified`);
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
                      console.warn(`[Admin Verify] Could not extract rider coordinates from match, skipping...`);
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
                      maxDetourMeters: 2000,
                      maxDestinationMeters: 1000,
                      hostRouteGeometry: geometry
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
                    console.log(`[Admin Verify] Inserting top ${finalSuggestions.length} match suggestions (host has ${remainingSeats} seats)`);
                    const { error: insertMatchError } = await supabase
                      .from("match_suggestions")
                      .insert(finalSuggestions);

                    if (insertMatchError) {
                      console.error("[Admin Verify] Error inserting match suggestions:", insertMatchError);
                    } else {
                      console.log(`[Admin Verify] ✅ ${finalSuggestions.length} match suggestions created`);
                    }
                  } else {
                    console.log("[Admin Verify] No compatible matches found after scoring");
                  }
                } else if (remainingSeats <= 0) {
                  console.log("[Admin Verify] Host has no available seats, skipping match suggestions");
                } else {
                  console.log("[Admin Verify] No intersecting ride requests found");
                }
              }
            }
          } catch (routeError) {
            console.error("[Admin Verify] Error in route geometry or template creation:", routeError);
          }
        } else {
          console.log("[Admin Verify] ⚠️  Skipping ride_template creation: Missing required profile data");
          console.log("[Admin Verify] - Missing from_lat/from_lng:", !profile.from_lat || !profile.from_lng);
          console.log("[Admin Verify] - Missing to_lat/to_lng:", !profile.to_lat || !profile.to_lng);
          console.log("[Admin Verify] - Missing vehicle_type:", !profile.vehicle_type);
        }
      } else {
        console.log("[Admin Verify] User is not a host, skipping ride_template creation");
      }

      // Create ride_request if user is a rider
      if (profile.prefer_taking_ride) {
        console.log("[Admin Verify] User is a RIDER, attempting to create ride_request");

        if (profile.from_lat && profile.from_lng && profile.to_lat && profile.to_lng) {
          console.log("[Admin Verify] Fetching OSRM route geometry for rider...");
          
          // Fetch OSRM route geometry for rider's journey
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
            console.log(`[Admin Verify] OSRM route distance: ${routeDistanceMeters.toFixed(0)}m`);
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
              status: 'pending'
            })
            .select("id")
            .single();

          if (requestError) {
            console.error("[Admin Verify] Error inserting ride_request:", requestError);
          } else {
            console.log(`[Admin Verify] ✅ Ride request created successfully! ID: ${request.id}`);
            
            if (!rideCreated) {
              rideCreated = true;
              rideType = "rider";
            } else {
              rideType = "both";
            }

                // Find matching ride templates
            console.log("[Admin Verify] Searching for matching ride templates...");

            const { data: matches, error: matchError } = await supabase
              .rpc("find_intersecting_templates", {
                p_pickup_point: `POINT(${profile.from_lng} ${profile.from_lat})`,
                p_destination_point: `POINT(${profile.to_lng} ${profile.to_lat})`
              });

            if (matchError) {
              console.error("[Admin Verify] Error finding matching templates:", matchError);
            } else if (matches && matches.length > 0) {
              console.log(`[Admin Verify] Found ${matches.length} intersecting ride templates`);

              const suggestionsToInsert = [];

              for (const match of matches) {
                const { data: hostProfile } = await supabase
                  .from("profiles")
                  .select("comfortable_with, institution, email_verified")
                  .eq("id", match.host_id)
                  .single();

                // Only match with verified hosts
                if (!hostProfile?.email_verified) {
                  console.log(`[Admin Verify] Skipping host ${match.host_id} - not verified`);
                  continue;
                }

                // Fetch the host's actual route coordinates (was using rider's own
                // profile coords for both, which made every match's overlap
                // calculation compare the rider's route against itself).
                const { data: hostTemplate } = await supabase
                  .from("ride_templates")
                  .select("from_lat, from_lng, to_lat, to_lng, route_geometry")
                  .eq("id", match.template_id)
                  .single();

                if (!hostTemplate?.from_lat || !hostTemplate?.to_lat) {
                  console.warn(`[Admin Verify] Could not find host template coordinates, skipping...`);
                  continue;
                }

                const score = calculateMatchScore({
                  hostFrom: { lat: hostTemplate.from_lat, lng: hostTemplate.from_lng },
                  hostTo: { lat: hostTemplate.to_lat, lng: hostTemplate.to_lng },
                  riderPickup: { lat: profile.from_lat, lng: profile.from_lng },
                  riderDestination: { lat: profile.to_lat, lng: profile.to_lng },
                  riderTotalJourneyMeters: match.rider_total_journey_meters,
                  hostGenderPreference: hostProfile?.comfortable_with || 'both',
                  riderGenderPreference: profile.comfortable_with || 'both',
                  hostCollege: hostProfile?.institution,
                  riderCollege: profile.institution,
                  maxDetourMeters: 2000,
                  maxDestinationMeters: 1000,
                  hostRouteGeometry: hostTemplate.route_geometry
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
                console.log(`[Admin Verify] Inserting ${suggestionsToInsert.length} match suggestions`);
                const { error: insertMatchError } = await supabase
                  .from("match_suggestions")
                  .insert(suggestionsToInsert);

                if (insertMatchError) {
                  console.error("[Admin Verify] Error inserting match suggestions:", insertMatchError);
                } else {
                  console.log(`[Admin Verify] ✅ ${suggestionsToInsert.length} match suggestions created`);
                }
              } else {
                console.log("[Admin Verify] No compatible matches found after scoring");
              }
            } else {
              console.log("[Admin Verify] No intersecting ride templates found");
            }
          }
        } else {
          console.log("[Admin Verify] ⚠️  Skipping ride_request creation: Missing required profile data");
        }
      } else {
        console.log("[Admin Verify] User is not a rider, skipping ride_request creation");
      }

    } else if (action === "reject") {
      console.log("[Admin Verify] Processing REJECT action");
      console.log(`[Admin Verify] Rejection reason: ${rejectionReason}`);
      
      updatePayload = {
        institutional_email: "REJECTED",
        rejection_reason: rejectionReason,
      };

      const { error } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", userId);

      if (error) {
        console.error("[Admin Verify] Supabase update error:", error);
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }

      console.log("[Admin Verify] User rejected successfully");
    }

    console.log("[Admin Verify] ============================================");
    console.log("[Admin Verify] Verification process complete!");
    console.log(`[Admin Verify] Ride created: ${rideCreated}, Type: ${rideType}`);
    console.log("[Admin Verify] ============================================");

    return NextResponse.json({ 
      success: true, 
      rideCreated,
      rideType,
      message: rideCreated 
        ? `User verified and ${rideType} ride created successfully!`
        : "User verified successfully (no ride data available)"
    });

  } catch (error) {
    console.error("[Admin Verify] Unexpected error:", error);
    console.error("[Admin Verify] Stack trace:", error instanceof Error ? error.stack : "No stack trace");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
