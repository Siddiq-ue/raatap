import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get skip analytics
 * Returns skip reasons and patterns
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hours = parseInt(searchParams.get("hours") || "168"); // Default: 1 week

    // Get skip statistics by reason
    const { data: stats, error } = await supabase
      .rpc("get_skip_stats", { p_hours: hours });

    if (error) {
      console.error("❌ [API] Error fetching skip stats:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Get skip trend (last 7 days)
    const { data: trend } = await supabase
      .from("skip_analytics")
      .select("skip_date, skip_reason, skip_count")
      .order("skip_date", { ascending: false })
      .limit(50);

    console.log("✅ [API] Skip analytics fetched");

    return NextResponse.json({
      skip_stats: stats || [],
      skip_trend: trend || [],
      time_range_hours: hours,
    });
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
