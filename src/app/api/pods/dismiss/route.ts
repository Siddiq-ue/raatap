import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Dismiss Rider - Host removes a rider from their pod
 * 
 * Request body: {
 *   podMemberId: string,  // pod_members record id
 *   hostId: string,      // host's profile id
 *   reason: string        // 'rider_no_show' | 'rider_behavior' | 'seat_unavailable' | 'other'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { podMemberId, hostId, reason } = await request.json();

    console.log("📥 [API] /api/pods/dismiss - Request:", { podMemberId, hostId, reason });

    if (!podMemberId || !hostId) {
      return NextResponse.json(
        { error: "Missing required fields: podMemberId, hostId" },
        { status: 400 }
      );
    }

    // 1. Verify the pod member record exists
    const { data: podMember, error: fetchError } = await supabase
      .from("pod_members")
      .select(`
        id,
        pod_id,
        rider_id,
        ride_request_id,
        status
      `)
      .eq("id", podMemberId)
      .single();

    if (fetchError || !podMember) {
      console.error("❌ [API] Error fetching pod member:", fetchError);
      return NextResponse.json(
        { error: "Pod member record not found" },
        { status: 404 }
      );
    }

    // 2. Fetch pod info to get ride_template_id
    const { data: pod } = await supabase
      .from("pods")
      .select("id, ride_template_id, status")
      .eq("id", podMember.pod_id)
      .single();

    if (!pod) {
      return NextResponse.json(
        { error: "Pod not found" },
        { status: 404 }
      );
    }

    // Check if pod is still active
    if (pod.status !== "active") {
      return NextResponse.json(
        { error: "This pod is no longer active" },
        { status: 400 }
      );
    }

    // 3. Verify host owns this pod by checking ride_templates
    const rideTemplateId = pod.ride_template_id;
    if (!rideTemplateId) {
      return NextResponse.json(
        { error: "Pod has no associated ride template" },
        { status: 400 }
      );
    }

    const { data: template } = await supabase
      .from("ride_templates")
      .select("host_id, seats_taken")
      .eq("id", rideTemplateId)
      .single();

    if (!template || template.host_id !== hostId) {
      console.error("❌ [API] Unauthorized: Host ID mismatch");
      return NextResponse.json(
        { error: "Unauthorized - you do not own this pod" },
        { status: 403 }
      );
    }

    // 3. Update pod_members record (soft delete)
    const { error: updateError } = await supabase
      .from("pod_members")
      .update({
        status: "dismissed",
        leave_reason: reason,
        willing_to_rejoin: false, // Host dismissed, so not willing to rejoin
        left_at: new Date().toISOString()
      })
      .eq("id", podMemberId);

    if (updateError) {
      console.error("❌ [API] Error updating pod member:", updateError);
      return NextResponse.json(
        { error: "Failed to dismiss rider" },
        { status: 500 }
      );
    }

    // 4. Decrement seats_taken on ride_template
    if (rideTemplateId && template) {
      const newSeatsTaken = Math.max(0, (template.seats_taken || 1) - 1);
      
      await supabase
        .from("ride_templates")
        .update({ seats_taken: newSeatsTaken })
        .eq("id", rideTemplateId);
    }

    // 5. Update ride_request status back to 'active' so rider can be matched with other hosts
    if (podMember.ride_request_id) {
      await supabase
        .from("ride_requests")
        .update({ status: "active" })
        .eq("id", podMember.ride_request_id);
    }

    // Log activity for pod
    await supabase.from("activity_logs").insert({
      log_level: "INFO",
      function_name: "pod_dismiss",
      action: "Host removed rider from pod",
      user_id: hostId,
      entity_type: "pod",
      entity_id: podMember.pod_id,
      details: {
        pod_member_id: podMemberId,
        dismissed_rider_id: podMember.rider_id,
        reason: reason,
      },
    });

    console.log("✅ [API] Rider successfully dismissed from pod");
    return NextResponse.json({
      success: true,
      message: "Rider has been removed from the pod",
      seatFreed: 1
    });

  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
