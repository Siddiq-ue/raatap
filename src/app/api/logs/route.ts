import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get activity logs
 * Supports filtering by entity, user, time range, and log level
 */
export async function POST(request: NextRequest) {
  try {
    const {
      entityType,
      entityId,
      userId,
      logLevel,
      functionName,
      hours = 24,
      limit = 100,
    } = await request.json();

    console.log("📥 [API] /api/logs:", {
      entityType,
      entityId,
      userId,
      logLevel,
      hours,
      limit,
    });

    // Build query
    let query = supabase
      .from("activity_logs")
      .select("*")
      .order("log_time", { ascending: false })
      .limit(limit);

    // Apply filters
    if (entityType) {
      query = query.eq("entity_type", entityType);
    }

    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    if (userId) {
      query = query.eq("user_id", userId);
    }

    if (logLevel) {
      query = query.eq("log_level", logLevel);
    }

    if (functionName) {
      query = query.eq("function_name", functionName);
    }

    // Time filter
    const hoursAgo = new Date();
    hoursAgo.setHours(hoursAgo.getHours() - hours);
    query = query.gte("log_time", hoursAgo.toISOString());

    const { data: logs, error } = await query;

    if (error) {
      console.error("❌ [API] Error fetching logs:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    console.log(`✅ [API] Found ${logs?.length || 0} logs`);
    return NextResponse.json(logs || []);
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Get recent error logs
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hours = parseInt(searchParams.get("hours") || "24");
    const limit = parseInt(searchParams.get("limit") || "50");

    const { data: logs, error } = await supabase
      .rpc("get_error_logs", {
        p_hours: hours,
        p_limit: limit,
      });

    if (error) {
      console.error("❌ [API] Error fetching error logs:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(logs || []);
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
