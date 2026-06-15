import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Resolve Host Behavior Flag - Admin only
 * 
 * Request body: {
 *   flagId: string,       // host_behavior_flags record id
 *   adminId: string,     // admin's profile id
 *   notes: string         // optional admin notes
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check admin session
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader || !cookieHeader.includes("admin_session=")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { flagId, adminId, notes } = await request.json();

    if (!flagId || !adminId) {
      return NextResponse.json(
        { error: "Missing required fields: flagId, adminId" },
        { status: 400 }
      );
    }

    // Verify flag exists
    const { data: flag, error: fetchError } = await supabase
      .from("host_behavior_flags")
      .select("id, resolved_at")
      .eq("id", flagId)
      .single();

    if (fetchError || !flag) {
      return NextResponse.json(
        { error: "Flag not found" },
        { status: 404 }
      );
    }

    // Check if already resolved
    if (flag.resolved_at) {
      return NextResponse.json(
        { error: "This flag has already been resolved" },
        { status: 400 }
      );
    }

    // Resolve the flag
    const { error: updateError } = await supabase
      .from("host_behavior_flags")
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: adminId
      })
      .eq("id", flagId);

    if (updateError) {
      console.error("❌ [API] Error resolving flag:", updateError);
      return NextResponse.json(
        { error: "Failed to resolve flag" },
        { status: 500 }
      );
    }

    console.log("✅ [API] Flag resolved by admin:", adminId);
    return NextResponse.json({
      success: true,
      message: "Flag has been resolved"
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
 * Delete Host Behavior Flag - Admin only
 * 
 * Request body: {
 *   flagId: string
 * }
 */
export async function DELETE(request: NextRequest) {
  try {
    // Check admin session
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader || !cookieHeader.includes("admin_session=")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { flagId } = await request.json();

    if (!flagId) {
      return NextResponse.json(
        { error: "Missing required field: flagId" },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabase
      .from("host_behavior_flags")
      .delete()
      .eq("id", flagId);

    if (deleteError) {
      console.error("❌ [API] Error deleting flag:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete flag" },
        { status: 500 }
      );
    }

    console.log("✅ [API] Flag deleted");
    return NextResponse.json({
      success: true,
      message: "Flag has been deleted"
    });

  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
