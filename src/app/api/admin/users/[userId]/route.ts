import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const session = req.cookies.get("admin_session");

  if (!session?.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decoded = Buffer.from(session.value, "base64").toString("utf-8");
    const [email, timestamp] = decoded.split(":");
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    const sessionAge = Date.now() - parseInt(timestamp);

    if (email !== adminEmail || sessionAge >= 60 * 60 * 24 * 1000) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    const { userId } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Fetch profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 2. Fetch ride templates
    const { data: rideTemplates } = await supabase
      .from("ride_templates")
      .select("*")
      .eq("host_id", userId)
      .order("created_at", { ascending: false });

    // 3. Fetch ride requests
    const { data: rideRequests } = await supabase
      .from("ride_requests")
      .select("*")
      .eq("rider_id", userId)
      .order("created_at", { ascending: false });

    // 4. Fetch pod memberships
    const { data: podMemberships } = await supabase
      .from("pod_members")
      .select(`
        *,
        pods (
          *,
          ride_template:ride_templates (*)
        )
      `)
      .eq("rider_id", userId)
      .order("created_at", { ascending: false });

    // 5. Fetch activity logs
    const { data: activityLogs } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    // 6. Fetch Campus Leader Status
    const { data: campusLeaderStatus } = await supabase
      .from("campus_leaders")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    return NextResponse.json({
      profile,
      rideTemplates: rideTemplates || [],
      rideRequests: rideRequests || [],
      podMemberships: podMemberships || [],
      activityLogs: activityLogs || [],
      isCampusLeader: !!campusLeaderStatus
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 });
  }
}
