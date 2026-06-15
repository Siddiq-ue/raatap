import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get match queue for a user
 * Returns matches ordered by:
 * 1. Overall score (DESC) - Best matches first
 * 2. Created at (ASC) - First-come-first-serve (older requests first)
 * 
 * Supports pagination for "show next match" functionality
 */
export async function POST(request: NextRequest) {
  try {
    const { 
      userId, 
      limit = 10, 
      offset = 0,
      status = ['pending', 'shown'] 
    } = await request.json();

    console.log("📥 [API] /api/matches/queue:", { userId, limit, offset, status });

    if (!userId) {
      return NextResponse.json(
        { error: "Missing required field: userId" },
        { status: 400 }
      );
    }

    // Get match suggestions ordered by score (DESC) and creation time (ASC)
    // This implements first-come-first-serve: best matches first, then by who requested first
    const { data: suggestions, error } = await supabase
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
      .in("status", status)
      .order("overall_score", { ascending: false })
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("❌ [API] Error fetching match queue:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Calculate additional info for each match
    const enrichedSuggestions = suggestions?.map(match => {
      const isHost = match.ride_template.host_id === userId;
      const otherParty = isHost 
        ? match.ride_request.profiles 
        : match.ride_template.profiles;

      return {
        ...match,
        is_host: isHost,
        other_party: otherParty,
        // Calculate match quality badge
        match_quality: match.overall_score >= 0.8 ? 'excellent' 
          : match.overall_score >= 0.6 ? 'good' 
          : match.overall_score >= 0.4 ? 'fair' 
          : 'poor',
        // Time until match expires (7 days from creation)
        expires_in_hours: Math.round(
          (new Date(match.expires_at).getTime() - Date.now()) / (1000 * 60 * 60)
        ),
      };
    });

    console.log(`✅ [API] Found ${enrichedSuggestions?.length || 0} matches in queue`);
    
    return NextResponse.json({
      matches: enrichedSuggestions || [],
      pagination: {
        limit,
        offset,
        has_more: (enrichedSuggestions?.length || 0) >= limit,
      },
    });
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Get match queue statistics
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId parameter" },
        { status: 400 }
      );
    }

    // Get counts by status
    const { data: stats, error } = await supabase
      .from("match_suggestions")
      .select("status")
      .or(`ride_template.host_id.eq.${userId},ride_request.rider_id.eq.${userId}`);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const counts = stats?.reduce((acc, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get best match score
    const { data: bestMatch } = await supabase
      .from("match_suggestions")
      .select("overall_score")
      .or(`ride_template.host_id.eq.${userId},ride_request.rider_id.eq.${userId}`)
      .in("status", ["pending", "shown"])
      .order("overall_score", { ascending: false })
      .limit(1);

    return NextResponse.json({
      queue_stats: {
        pending: counts?.pending || 0,
        shown: counts?.shown || 0,
        accepted: counts?.accepted || 0,
        skipped: counts?.skipped || 0,
        confirmed: counts?.confirmed || 0,
        total: stats?.length || 0,
      },
      best_match_score: bestMatch?.[0]?.overall_score || 0,
    });
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
