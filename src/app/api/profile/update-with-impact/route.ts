import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRouteGeometry } from "@/lib/osrm";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const podBreakingFields = [
  'from_lat', 'from_lng', 'to_lat', 'to_lng', 'from_location', 'to_location',
  'prefer_hosting', 'prefer_taking_ride', 'comfortable_with', 'vehicle_type', 'available_seats'
];

export async function POST(req: NextRequest) {
  try {
    const { userId, updates, confirmed } = await req.json();

    if (!userId || !updates) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!confirmed) {
      // 1. Fetch current profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }

      // 3. Check which fields actually changed
      const changedFields = Object.keys(updates).filter(
        (key) => updates[key] !== profile[key]
      );

      // 4. Classify
      const hasPodBreakingChanges = changedFields.some((f) => podBreakingFields.includes(f));

      // 5. Check if user is in an active pod
      // Try finding as rider
      const { data: memberData } = await supabase
        .from('pod_members')
        .select('id, pod_id, role, rider_id, user_id, pods(id, ride_template_id, status, ride_templates(host_id))')
        .or(`rider_id.eq.${userId},user_id.eq.${userId}`)
        .eq('status', 'active')
        .maybeSingle();

      // Try finding as host
      const { data: hostTemplates } = await supabase
        .from('ride_templates')
        .select('id, host_id, pods(id, status)')
        .eq('host_id', userId)
        .eq('status', 'active');
      
      const activeHostPod = hostTemplates?.flatMap(t => t.pods).find(p => p.status === 'active');

      let podId = null;
      let podMemberId = null;
      let isHost = false;
      let isRider = false;

      const memberPod = (memberData?.pods as any)?.[0] || memberData?.pods;
      if (activeHostPod) {
        podId = activeHostPod.id;
        isHost = true;
      } else if (memberData && memberPod?.status === 'active') {
        podId = memberData.pod_id;
        podMemberId = memberData.id;
        isRider = true;
      }

      if (!podId) {
        return NextResponse.json({ impact: 'none', hasPodBreakingChanges });
      }

      if (!hasPodBreakingChanges) {
        return NextResponse.json({ impact: 'none' });
      }

      if (isRider) {
        return NextResponse.json({
          impact: 'pod_breaking',
          action: 'leave_pod',
          podId,
          podMemberId
        });
      }

      if (isHost) {
        return NextResponse.json({
          impact: 'pod_breaking',
          action: 'disband_pod',
          podId
        });
      }

      return NextResponse.json({ impact: 'none' });
    }

    // Confirmed update
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Sync ride_request/ride_template
    const routeFieldsChanged = ['from_lat', 'from_lng', 'to_lat', 'to_lng', 'from_location', 'to_location'].some(
      f => updates[f] !== undefined
    );

    if (routeFieldsChanged) {
      const { from_lat, from_lng, to_lat, to_lng, from_location, to_location } = updates;
      const pickup_point = from_lng && from_lat ? `POINT(${from_lng} ${from_lat})` : undefined;
      const destination_point = to_lng && to_lat ? `POINT(${to_lng} ${to_lat})` : undefined;

      // Update for riders
      await supabase
        .from('ride_requests')
        .update({
          pickup_lat: from_lat,
          pickup_lng: from_lng,
          pickup_location: from_location,
          destination_lat: to_lat,
          destination_lng: to_lng,
          destination_location: to_location,
          ...(pickup_point && { pickup_point }),
          ...(destination_point && { destination_point })
        })
        .eq('rider_id', userId)
        .eq('status', 'active');

      // Update for hosts
      const { data: templatesToUpdate } = await supabase
        .from('ride_templates')
        .select('id')
        .eq('host_id', userId)
        .in('status', ['active', 'inactive']);
        
      if (templatesToUpdate && templatesToUpdate.length > 0 && from_lat && from_lng && to_lat && to_lng) {
        try {
          const routeGeometry = await getRouteGeometry(
            { lat: from_lat, lng: from_lng },
            { lat: to_lat, lng: to_lng }
          );

          await supabase
            .from('ride_templates')
            .update({
              from_lat,
              from_lng,
              from_location,
              to_lat,
              to_lng,
              to_location,
              route_geometry: routeGeometry,
              ...(pickup_point && { from_point: pickup_point }),
              ...(destination_point && { to_point: destination_point })
            })
            .eq('host_id', userId)
            .in('status', ['active', 'inactive']);
        } catch (e) {
          console.error("❌ Failed to fetch route geometry:", e);
        }
      }
    }

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (error: any) {
    console.error("❌ Error in update-with-impact:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
