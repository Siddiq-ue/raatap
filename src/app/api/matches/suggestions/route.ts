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
    
    return NextResponse.json(userSuggestions);
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
