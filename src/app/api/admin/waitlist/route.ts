import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  // Verify admin session first
  const session = req.cookies.get("admin_session");

  if (!session?.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Decode and verify the session token
    const decoded = Buffer.from(session.value, "base64").toString("utf-8");
    const [email, timestamp] = decoded.split(":");

    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

    // Check if email matches and session is less than 24 hours old
    const sessionAge = Date.now() - parseInt(timestamp);
    const maxAge = 60 * 60 * 24 * 1000; // 24 hours in ms

    if (email !== adminEmail || sessionAge >= maxAge) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    // Create a Supabase client with the service role key for admin access (bypasses RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching waitlist:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ entries: data || [] });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
