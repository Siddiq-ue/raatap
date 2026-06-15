import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Leave Pod - Rider leaves a pod
 * 
 * Request body: {
 *   podMemberId: string,      // pod_members record id
 *   userId: string,          // rider's profile id
 *   reason: string,          // 'schedule_conflict' | 'host_no_show' | 'host_behavior' | 'other'
 *   willingToRejoin: boolean  // whether rider is willing to join this pod again
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { podMemberId, userId, reason, willingToRejoin = true } = await request.json();

    console.log("📥 [API] /api/pods/leave - Request:", { podMemberId, userId, reason, willingToRejoin });

    if (!podMemberId || !userId) {
      return NextResponse.json(
        { error: "Missing required fields: podMemberId, userId" },
        { status: 400 }
      );
    }

    // 1. Verify the pod member record exists and belongs to this rider
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

    // Verify rider owns this record
    if (podMember.rider_id !== userId) {
      console.error("❌ [API] Unauthorized: Rider ID mismatch");
      return NextResponse.json(
        { error: "Unauthorized - this pod membership does not belong to you" },
        { status: 403 }
      );
    }

    // Fetch pod info
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

    // 2. Determine flag type based on reason
    const hostBehaviorReasons = ["host_no_show", "host_behavior"];
    const isHostBehaviorFlag = hostBehaviorReasons.includes(reason);

    // 3. Update pod_members record (soft delete)
    const { error: updateError } = await supabase
      .from("pod_members")
      .update({
        status: "left",
        leave_reason: reason,
        willing_to_rejoin: willingToRejoin,
        left_at: new Date().toISOString()
      })
      .eq("id", podMemberId);

    if (updateError) {
      console.error("❌ [API] Error updating pod member:", updateError);
      return NextResponse.json(
        { error: "Failed to leave pod" },
        { status: 500 }
      );
    }

    // 4. Decrement seats_taken on ride_template
    const rideTemplateId = pod.ride_template_id;
    if (rideTemplateId) {
      const { data: template } = await supabase
        .from("ride_templates")
        .select("seats_taken")
        .eq("id", rideTemplateId)
        .single();

      const newSeatsTaken = Math.max(0, (template?.seats_taken || 1) - 1);
      
      await supabase
        .from("ride_templates")
        .update({ seats_taken: newSeatsTaken })
        .eq("id", rideTemplateId);
    }

    // 5. If host behavior flag, insert red flag
    if (isHostBehaviorFlag && !willingToRejoin) {
      // Get host_id from ride_template
      const { data: templateData } = await supabase
        .from("ride_templates")
        .select("host_id")
        .eq("id", rideTemplateId)
        .single();

      if (templateData?.host_id) {
        await supabase
          .from("host_behavior_flags")
          .insert({
            host_id: templateData.host_id,
            rider_id: userId,
            flag_type: "red",
            reason: reason,
            pod_id: podMember.pod_id
          });
        console.log("⚠️ [API] Red flag created for host:", templateData.host_id);
      }
    }

    // 6. Update ride_request status back to 'active' so rider can be matched again
    if (podMember.ride_request_id) {
      await supabase
        .from("ride_requests")
        .update({ status: "active" })
        .eq("id", podMember.ride_request_id);
    }

    // Log activity for pod
    await supabase.from("activity_logs").insert({
      log_level: "INFO",
      function_name: "pod_leave",
      action: "Rider left pod",
      user_id: userId,
      entity_type: "pod",
      entity_id: podMember.pod_id,
      details: {
        pod_member_id: podMemberId,
        reason: reason,
        rider_name: podMember.rider_id,
      },
    });

    console.log("✅ [API] Rider successfully left pod");
    return NextResponse.json({
      success: true,
      message: "You have left the pod successfully",
      willBeRematched: willingToRejoin,
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
