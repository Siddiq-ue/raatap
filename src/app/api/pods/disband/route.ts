import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { hostId, podId, reason } = await req.json();

    if (!hostId || !podId || !reason) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Verify the pod exists and is active
    const { data: pod, error: podError } = await supabase
      .from('pods')
      .select('id, ride_template_id, status')
      .eq('id', podId)
      .single();

    if (podError || !pod || pod.status !== 'active') {
      return NextResponse.json({ error: "Pod not found or not active" }, { status: 404 });
    }

    // 2. Verify the user is the host
    const { data: template, error: templateError } = await supabase
      .from('ride_templates')
      .select('host_id')
      .eq('id', pod.ride_template_id)
      .single();

    if (templateError || template.host_id !== hostId) {
      return NextResponse.json({ error: "Unauthorized: Not the host of this pod" }, { status: 403 });
    }

    // 3. Get all active pod members
    const { data: members, error: membersError } = await supabase
      .from('pod_members')
      .select('id, rider_id, ride_request_id')
      .eq('pod_id', podId)
      .eq('status', 'active');

    if (membersError) {
      throw membersError;
    }

    const now = new Date().toISOString();

    // 4. For each member
    if (members && members.length > 0) {
      for (const member of members) {
        // a. Update pod_members
        await supabase
          .from('pod_members')
          .update({ status: 'left', leave_reason: reason, left_at: now })
          .eq('id', member.id);

        // b. Reset their ride_request status to 'active'
        if (member.ride_request_id) {
          await supabase
            .from('ride_requests')
            .update({ status: 'active' })
            .eq('id', member.ride_request_id);

          // c. Delete accepted match_suggestion
          await supabase
            .from('match_suggestions')
            .delete()
            .eq('ride_request_id', member.ride_request_id)
            .eq('ride_template_id', pod.ride_template_id)
            .eq('status', 'accepted');
        }
      }
    }

    // 5. Set pod status to 'dissolved'
    await supabase
      .from('pods')
      .update({ status: 'dissolved', updated_at: now })
      .eq('id', podId);

    // 6. Deactivate old ride_template
    await supabase
      .from('ride_templates')
      .update({ status: 'inactive', updated_at: now })
      .eq('id', pod.ride_template_id);

    // 7. Log to activity_logs
    await supabase.from('activity_logs').insert({
      log_level: 'INFO',
      function_name: 'pod_disband',
      action: 'Pod disbanded due to host profile change',
      user_id: hostId,
      entity_type: 'pod',
      entity_id: podId,
      details: { reason, members_affected: members ? members.length : 0 }
    });

    console.log(`✅ Pod ${podId} disbanded successfully by host ${hostId}`);
    return NextResponse.json({ 
      success: true, 
      message: 'Pod disbanded', 
      membersAffected: members ? members.length : 0 
    });

  } catch (error: any) {
    console.error("❌ Error in pods/disband:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
