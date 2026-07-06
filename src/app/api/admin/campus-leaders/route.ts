import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function verifyAdminSession(req: NextRequest) {
  const session = req.cookies.get("admin_session");
  if (!session?.value) return false;

  try {
    const decoded = Buffer.from(session.value, "base64").toString("utf-8");
    const [email, timestamp] = decoded.split(":");
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    const sessionAge = Date.now() - parseInt(timestamp);
    
    if (email !== adminEmail || sessionAge >= 60 * 60 * 24 * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  if (!verifyAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { userId, institution } = await req.json();
    if (!userId || !institution) {
      return NextResponse.json({ error: "User ID and institution required" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    
    // Check if already exists
    const { data: existing } = await supabase
      .from("campus_leaders")
      .select("id")
      .eq("user_id", userId)
      .single();
      
    if (existing) {
      return NextResponse.json({ error: "User is already a campus leader" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("campus_leaders")
      .insert({ user_id: userId, institution })
      .select()
      .single();

    if (error) throw error;
    
    // Log the promotion
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "promoted_to_campus_leader",
      entity_type: "profile",
      entity_id: userId,
      details: { role: "admin", institution }
    });
    
    return NextResponse.json({ data, success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    
    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("campus_leaders").delete().eq("user_id", userId);

    if (error) throw error;
    
    // Log the demotion
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "revoked_campus_leader",
      entity_type: "profile",
      entity_id: userId,
      details: { role: "admin" }
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 });
  }
}
