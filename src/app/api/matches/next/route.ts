import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get next best match after user skips current one
 * Implements first-come-first-serve by ordering:
 * 1. Overall score (DESC) - Best matches first
 * 2. Created at (ASC) - Older requests first
 * 
 * Skips are excluded from results
 */
export async function POST(request: NextRequest) {
  try {
    const { 
      userId, 
      currentMatchId, 
      skipReason 
    } = await request.json();

    console.log("📥 [API] /api/matches/next:", { 
      userId, 
      currentMatchId, 
      skipReason 
    });

    if (!userId) {
      return NextResponse.json(
        { error: "Missing required field: userId" },
        { status: 400 }
      );
    }

    // First, mark current match as skipped
    if (currentMatchId) {
      const { error: skipError } = await supabase
        .from("match_suggestions")
        .update({
          status: "skipped",
          skipped_at: new Date().toISOString(),
          skip_reason: skipReason || null,
        })
        .eq("id", currentMatchId);

      if (skipError) {
        console.error("❌ [API] Error marking match as skipped:", skipError);
        return NextResponse.json(
          { error: "Failed to skip match" },
          { status: 500 }
        );
      }

      console.log("✅ [API] Match marked as skipped");
    }

    // Get next best match (excluding skipped ones)
    const { data: nextMatch, error } = await supabase
      .from("match_suggestions")
      .select(`
        *,
        ride_template:ride_templates!inner(
          id,
          host_id,
          from_location,
          to_location,
          vehicle_type,
          available_seats,
          seats_taken,
          departure_time,
          return_time,
          days_available,
          max_detour_meters,
          status,
          profiles:host_profiles!ride_templates_host_id_fkey(
            id,
            full_name,
            phone_number,
            gender
          )
        ),
        ride_request:ride_requests!inner(
          id,
          rider_id,
          pickup_location,
          drop_location,
          pickup_lat,
          pickup_lng,
          drop_lat,
          drop_lng,
          preferred_arrival_time,
          days_needed,
          vehicle_preference,
          time_flexibility_mins,
          status,
          profiles:rider_profiles!ride_requests_rider_id_fkey(
            id,
            full_name,
            phone_number,
            gender
          )
        )
      `)
      .or(`ride_template.host_id.eq.${userId},ride_request.rider_id.eq.${userId}`)
      .in("status", ["pending", "shown"])
      .order("overall_score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error("❌ [API] Error fetching next match:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // No more matches available
    if (!nextMatch) {
      console.log("ℹ️ [API] No more matches available");
      return NextResponse.json({
        match: null,
        has_more: false,
        message: "No more matches available. Check back later!",
      });
    }

    // Enrich match data
    const isHost = nextMatch.ride_template.host_id === userId;
    const otherParty = isHost 
      ? nextMatch.ride_request.profiles 
      : nextMatch.ride_template.profiles;

    const enrichedMatch = {
      ...nextMatch,
      is_host: isHost,
      other_party: otherParty,
      match_quality: nextMatch.overall_score >= 0.8 ? 'excellent' 
        : nextMatch.overall_score >= 0.6 ? 'good' 
        : nextMatch.overall_score >= 0.4 ? 'fair' 
        : 'poor',
      expires_in_hours: Math.round(
        (new Date(nextMatch.expires_at).getTime() - Date.now()) / (1000 * 60 * 60)
      ),
    };

    console.log(`✅ [API] Found next match with score: ${nextMatch.overall_score}`);

    return NextResponse.json({
      match: enrichedMatch,
      has_more: true,
    });
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
