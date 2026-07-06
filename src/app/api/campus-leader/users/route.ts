import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function GET(req: NextRequest) {
  try {
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
