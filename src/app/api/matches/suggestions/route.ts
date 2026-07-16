import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get match suggestions for a user
 * Replaces backend proxy - now calls Supabase directly
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    console.log("📥 [API] /api/matches/suggestions - userId:", userId);

    if (!userId) {
      return NextResponse.json(
        { error: "Missing required field: userId" },
        { status: 400 }
      );
    }

    // Get match suggestions where user is either host or rider
    // First get all pending matches, then filter by user
    const { data: suggestions, error } = await supabase
      .from("match_suggestions")
      .select(`
        *,
        ride_template:ride_templates(
          id,
          host_id,
          from_location,
          to_location,
          from_lat,
          from_lng,
          to_lat,
          to_lng,
          route_geometry,
          vehicle_type,
          available_seats,
          seats_taken,
          status,
          profiles:profiles!ride_templates_host_id_fkey(
            id,
            full_name,
            gender,
            institution,
            phone_number
          )
        ),
        ride_request:ride_requests(
          id,
          rider_id,
          pickup_location,
          destination_location,
          pickup_lat,
          pickup_lng,
          destination_lat,
          destination_lng,
          vehicle_preference,
          status,
          pickup_landmark,
          profiles:profiles!ride_requests_rider_id_fkey(
            id,
            full_name,
            gender,
            institution,
            phone_number
          )
        )
      `)
      .in("status", ["pending_host_approval", "pending_rider_approval", "pending"])
      .order("overall_score", { ascending: false });

    if (error) {
      console.error("❌ [API] Error fetching suggestions:", error);
      console.error("❌ [API] Error details:", JSON.stringify(error, null, 2));
      return NextResponse.json(
        { 
          error: error.message,
          details: error,
          code: error.code,
          hint: error.hint,
          details_message: error.details 
        },
        { status: 500 }
      );
    }

    // Filter matches based on Host-First rules:
    // Hosts only see 'pending_host_approval' (or legacy 'pending')
    // Riders ONLY see 'pending_rider_approval'
    // Also filter out matches where host has no available seats
    const userSuggestions = (suggestions || []).filter(
      (suggestion: any) => {
        const isHost = suggestion.ride_template?.host_id === userId;
        const isRider = suggestion.ride_request?.rider_id === userId;

        // Check seat availability
        const availableSeats = suggestion.ride_template?.available_seats || 1;
        const seatsTaken = suggestion.ride_template?.seats_taken || 0;
        const hasSeatsAvailable = seatsTaken < availableSeats;

        if (isHost && (suggestion.status === 'pending_host_approval' || suggestion.status === 'pending')) {
          return hasSeatsAvailable;
        }

        // For riders: only show matches where host has seats available
        if (isRider && suggestion.status === 'pending_rider_approval') {
          return hasSeatsAvailable;
        }

        return false;
      }
    );

    console.log("📊 [API] Total suggestions:", suggestions?.length || 0);
    console.log("📊 [API] Filtered user suggestions:", userSuggestions.length);

    // These suggestions are all still undecided (pending_host_approval /
    // pending_rider_approval / pending) - nobody has accepted a price yet.
    // overlapping_distance_meters stored on the row was a snapshot taken
    // whenever the suggestion was generated; either side's route/location
    // may have changed since (or the overlap formula itself may have been
    // fixed since). Recompute it fresh from the current host/rider data
    // instead of trusting the snapshot, so what's shown is always live.
    const suggestionsWithLiveOverlap = await Promise.all(
      userSuggestions.map(async (suggestion: any) => {
        const template = suggestion.ride_template;
        const req = suggestion.ride_request;

        if (
          template?.from_lat == null || template?.from_lng == null ||
          template?.to_lat == null || template?.to_lng == null ||
          req?.pickup_lat == null || req?.pickup_lng == null ||
          req?.destination_lat == null || req?.destination_lng == null
        ) {
          return suggestion;
        }

        const { data: liveOverlap, error: overlapError } = await supabase.rpc(
          "calculate_overlapping_distance",
          {
            p_host_from_lat: template.from_lat,
            p_host_from_lng: template.from_lng,
            p_host_to_lat: template.to_lat,
            p_host_to_lng: template.to_lng,
            p_rider_pickup_lat: req.pickup_lat,
            p_rider_pickup_lng: req.pickup_lng,
            p_rider_dest_lat: req.destination_lat,
            p_rider_dest_lng: req.destination_lng,
            p_host_route_geometry: template.route_geometry,
          }
        );

        if (overlapError) {
          console.error("⚠️ [API] Live overlap recompute failed for suggestion", suggestion.id, overlapError);
          return suggestion;
        }

        return { ...suggestion, overlapping_distance_meters: liveOverlap };
      })
    );

    // route_geometry/lat/lng were only fetched to feed the RPC above -
    // strip them back out so the response shape is unchanged for the frontend.
    const responseSuggestions = suggestionsWithLiveOverlap.map((suggestion: any) => ({
      ...suggestion,
      ride_template: suggestion.ride_template
        ? (({ from_lat, from_lng, to_lat, to_lng, route_geometry, ...rest }: any) => rest)(suggestion.ride_template)
        : suggestion.ride_template,
      ride_request: suggestion.ride_request
        ? (({ pickup_lat, pickup_lng, destination_lat, destination_lng, ...rest }: any) => rest)(suggestion.ride_request)
        : suggestion.ride_request,
    }));

    return NextResponse.json(responseSuggestions);
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
