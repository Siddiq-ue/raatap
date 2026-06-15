import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get Host Behavior Flags - Admin only
 * 
 * Query params:
 *   hostId - optional, filter by specific host
 *   status - optional, 'active' | 'resolved' | 'all' (default: 'active')
 */
export async function GET(request: NextRequest) {
  try {
    // Check admin session
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader || !cookieHeader.includes("admin_session=")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const hostId = searchParams.get("hostId");
    const status = searchParams.get("status") || "active";

    let query = supabase
      .from("host_behavior_flags")
      .select(`
        id,
        flag_type,
        reason,
        created_at,
        resolved_at,
        host:profiles!host_behavior_flags_host_id_fkey(
          id,
          full_name,
          phone_number
        ),
        rider:profiles!host_behavior_flags_rider_id_fkey(
          id,
          full_name,
          phone_number
        ),
        resolved_by_profile:profiles(
          id,
          full_name
        ),
        pods:pods(
          id
        )
      `)
      .order("created_at", { ascending: false });

    // Filter by host if provided
    if (hostId) {
      query = query.eq("host_id", hostId);
    }

    // Filter by status
    if (status === "active") {
      query = query.is("resolved_at", null);
    } else if (status === "resolved") {
      query = query.not("resolved_at", "is", null);
    }
    // 'all' doesn't add any filter

    const { data: flags, error } = await query;

    if (error) {
      console.error("❌ [API] Error fetching flags:", error);
      return NextResponse.json(
        { error: "Failed to fetch flags" },
        { status: 500 }
      );
    }

    // Get summary stats
    const { count: totalRed } = await supabase
      .from("host_behavior_flags")
      .select("*", { count: "exact", head: true })
      .eq("flag_type", "red")
      .is("resolved_at", null);

    const { count: totalGreen } = await supabase
      .from("host_behavior_flags")
      .select("*", { count: "exact", head: true })
      .eq("flag_type", "green")
      .is("resolved_at", null);

    return NextResponse.json({
      flags: flags || [],
      stats: {
        activeRed: totalRed || 0,
        activeGreen: totalGreen || 0
      }
    });

  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
