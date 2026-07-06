import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    // 1. Verify caller is authenticated via Authorization header
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Setup Service Role Client for elevated permissions
    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const {
      data: { user: caller },
      error: authError,
    } = await supabaseService.auth.getUser(token);

    if (authError || !caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }



    // 3. Verify caller is a campus leader
    const { data: campusLeader, error: leaderError } = await supabaseService
      .from("campus_leaders")
      .select("institution")
      .eq("user_id", caller.id)
      .single();

    if (leaderError || !campusLeader) {
      return NextResponse.json(
        { error: "Forbidden: Not a campus leader" },
        { status: 403 },
      );
    }

    // 4. Fetch unverified profiles from the same institution
    const { data: profiles, error: profilesError } = await supabaseService
      .from("profiles")
      .select("id, full_name, institutional_email, created_at, phone_number")
      .eq("institution", campusLeader.institution)
      .eq("email_verified", false)
      .neq("institutional_email", "REJECTED")
      .order("created_at", { ascending: false });

    if (profilesError) {
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 },
      );
    }

    return NextResponse.json({ users: profiles, institution: campusLeader.institution });
  } catch (error: any) {
    console.error("Fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
