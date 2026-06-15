import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Host approves a pending rider
 * Updates pod_members status from 'pending_host' to 'active'
 */
export async function POST(request: NextRequest) {
  try {
    const { podMemberId, hostId } = await request.json();
    console.log("📥 [API] /api/pods/approve-rider - Approving rider:", { podMemberId, hostId });

    if (!podMemberId || !hostId) {
      return NextResponse.json(
        { error: "Missing required fields: podMemberId, hostId" },
        { status: 400 }
      );
    }

    // Get pod member record
    const { data: member, error: fetchError } = await supabase
      .from("pod_members")
      .select("id, pod_id, status, ride_request_id")
      .eq("id", podMemberId)
      .single();

    if (fetchError || !member) {
      return NextResponse.json(
        { error: "Pod member not found" },
        { status: 404 }
      );
    }

    if (member.status !== "pending_host") {
      return NextResponse.json(
        { error: "Rider is not pending host approval" },
        { status: 400 }
      );
    }

    // Verify host owns this pod
    const { data: pod } = await supabase
      .from("pods")
      .select("ride_template_id")
      .eq("id", member.pod_id)
      .single();

    if (!pod) {
      return NextResponse.json({ error: "Pod not found" }, { status: 404 });
    }

    const { data: template } = await supabase
      .from("ride_templates")
      .select("host_id, available_seats, seats_taken")
      .eq("id", pod.ride_template_id)
      .single();

    if (!template || template.host_id !== hostId) {
      return NextResponse.json(
        { error: "Unauthorized - you do not own this pod" },
        { status: 403 }
      );
    }

    // Check seat availability
    const availableSeats = template.available_seats - template.seats_taken;
    if (availableSeats <= 0) {
      return NextResponse.json(
        { error: "No available seats" },
        { status: 400 }
      );
    }

    // Update member to active
    const { error: updateError } = await supabase
      .from("pod_members")
      .update({
        status: "active",
        host_approved_at: new Date().toISOString()
      })
      .eq("id", podMemberId);

    if (updateError) {
      console.error("❌ [API] Error approving rider:", updateError);
      return NextResponse.json(
        { error: "Failed to approve rider" },
        { status: 500 }
      );
    }

    // Update ride_request status to 'active'
    await supabase
      .from("ride_requests")
      .update({ status: "active" })
      .eq("id", member.ride_request_id);

    // Increment seats_taken
    await supabase
      .from("ride_templates")
      .update({ seats_taken: template.seats_taken + 1 })
      .eq("id", pod.ride_template_id);

    console.log("✅ [API] Rider approved successfully");
    return NextResponse.json({
      success: true,
      message: "Rider has been approved",
    });
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}