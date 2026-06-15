import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Accept a match suggestion (Host action)
 * Host-First Architecture: Host accepts -> Status changes to 'pending_rider_approval'
 */
export async function POST(request: NextRequest) {
  try {
    const { matchId, hostId } = await request.json();
    console.log("📥 [API] /api/matches/accept (Host Approve) - Request received:", { matchId, hostId });

    if (!matchId || !hostId) {
      console.error("❌ [API] Missing required fields:", { matchId, hostId });
      return NextResponse.json(
        { error: "Missing required fields: matchId, hostId" },
        { status: 400 }
      );
    }

    // 1. Verify Match and Host Ownership
    const { data: match, error: fetchError } = await supabase
      .from("match_suggestions")
      .select(`
        id, 
        status, 
        ride_template_id,
        ride_templates ( host_id )
      `)
      .eq("id", matchId)
      .single();

    if (fetchError || !match) {
      console.error("❌ [API] Error fetching match:", fetchError);
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if ((match.ride_templates as any).host_id !== hostId) {
      console.error("❌ [API] Unauthorized: Host ID mismatch:", { expected: hostId, actual: (match.ride_templates as any).host_id });
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (match.status !== "pending_host_approval" && match.status !== "pending") {
      console.error("❌ [API] Invalid match status for host approval:", match.status);
      return NextResponse.json({ error: "Match is not pending host approval" }, { status: 400 });
    }

    // 2. Update Status to 'pending_rider_approval'
    console.log("🔍 [API] Updating match status to 'pending_rider_approval'...");
    const { error: updateError } = await supabase
      .from("match_suggestions")
      .update({ 
        status: "pending_rider_approval",
        updated_at: new Date().toISOString()
      })
      .eq("id", matchId);

    if (updateError) {
      console.error("❌ [API] Error updating match status:", updateError);
      return NextResponse.json(
        { error: "Failed to update match status", details: updateError.message },
        { status: 500 }
      );
    }

    console.log("✅ [API] Match successfully approved by Host.");

    return NextResponse.json({
      success: true,
      message: "Match approved. Waiting for Rider to confirm.",
    });
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}
