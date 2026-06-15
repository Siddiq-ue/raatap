import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Skip/Reject a match suggestion with optional reason
 * Tracks skip for analytics and improves future matching
 */
export async function POST(request: NextRequest) {
  try {
    const { matchId, userId, reason, customReason } = await request.json();
    console.log("📥 [API] /api/matches/skip:", { matchId, userId, reason, customReason });

    if (!matchId || !userId) {
      return NextResponse.json(
        { error: "Missing required fields: matchId, userId" },
        { status: 400 }
      );
    }

    // Build skip reason
    const skipReason = customReason || reason || 'No reason provided';

    // Update match status to skipped
    const { error } = await supabase
      .from("match_suggestions")
      .update({
        status: "skipped",
        skipped_at: new Date().toISOString(),
        skip_reason: skipReason,
      })
      .eq("id", matchId);

    if (error) {
      console.error("❌ [API] Error skipping match:", error);
      return NextResponse.json(
        { error: error.message, success: false },
        { status: 400 }
      );
    }

    // Log the skip for analytics
    await supabase.from("activity_logs").insert({
      log_level: "INFO",
      function_name: "api_skip_match",
      action: "User skipped match",
      user_id: userId,
      entity_type: "match",
      entity_id: matchId,
      details: {
        reason: skipReason,
        reason_category: reason || 'custom',
      },
    });

    console.log("✅ [API] Match skipped successfully");
    return NextResponse.json({
      success: true,
      message: "Match skipped",
      skip_reason: skipReason,
    });
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}
