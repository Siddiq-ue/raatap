import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  try {
    const { userIdToVerify } = await req.json();

    if (!userIdToVerify) {
      return NextResponse.json(
        { error: "User ID to verify is required" },
        { status: 400 },
      );
    }

    // 1. Verify caller is authenticated
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: "", ...options });
          },
        },
      },
    );

    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Setup Service Role Client for elevated permissions
    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

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

    // 4. Update target user profile
    const { data: targetProfile, error: profileError } = await supabaseService
      .from("profiles")
      .select("institution, email_verified")
      .eq("id", userIdToVerify)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetProfile.institution !== campusLeader.institution) {
      return NextResponse.json(
        { error: "Cannot verify user from different institution" },
        { status: 403 },
      );
    }

    const { error: updateError } = await supabaseService
      .from("profiles")
      .update({ email_verified: true })
      .eq("id", userIdToVerify);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to verify user" },
        { status: 500 },
      );
    }

    // 5. Log activity
    await supabaseService.from("activity_logs").insert({
      user_id: caller.id,
      action: "verified_user",
      entity_type: "profile",
      entity_id: userIdToVerify,
      details: { role: "campus_leader" },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
