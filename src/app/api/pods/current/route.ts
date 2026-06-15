import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get current pods and rides for a user
 * Only returns ACTIVE members (status: 'active' or 'pending_*')
 * Calculates seats_taken based on active members only
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "Missing required field: userId" },
        { status: 400 }
      );
    }

    // Get host pods (pods where user is the host)
    const { data: hostPods, error: hostPodsError } = await supabase
      .from("pods")
      .select(`
        *,
        ride_template:ride_templates(
          id,
          from_location,
          to_location,
          departure_time,
          days_available,
          vehicle_type,
          available_seats,
          seats_taken
        ),
        pod_members(
          id,
          rider_id,
          status,
          joined_at,
          rider_confirmed_at,
          pickup_landmark,
          pickup_location,
          ride_request_id,
          overlapping_distance_meters,
          profiles:profiles(
            id,
            full_name,
            phone_number,
            gender
          ),
          ride_requests(
            id,
            pickup_location,
            destination_location,
            time_flexibility_mins,
            days_needed
          )
        )
      `)
      .eq("host_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (hostPodsError) {
      return NextResponse.json(
        { error: hostPodsError.message },
        { status: 500 }
      );
    }

    // Get rider rides (rides where user is the rider)
    const { data: riderRides, error: riderRidesError } = await supabase
      .from("pod_members")
      .select(`
        *,
        ride_requests(
          id,
          pickup_location,
          destination_location,
          time_flexibility_mins,
          days_needed
        ),
        pod:pods(
          *,
          ride_template:ride_templates(
            id,
            from_location,
            to_location,
            departure_time,
            days_available,
            vehicle_type,
            host_id
          ),
          profiles:profiles(
            id,
            full_name,
            gender,
            phone_number
          ),
          pod_members(
            id,
            rider_id,
            status,
            profiles:profiles(
              id,
              full_name
            )
          )
        )
      `)
      .eq("rider_id", userId)
      .in("status", ["active", "pending_host", "pending_rider"])
      .order("joined_at", { ascending: false });

    if (riderRidesError) {
      return NextResponse.json(
        { error: riderRidesError.message },
        { status: 500 }
      );
    }

    // Filter out inactive members and recalculate seats_taken
    const processedHostPods = (hostPods || []).map((pod) => {
      const activeMembers = (pod.pod_members || []).filter(
        (m: any) => m.status === 'active' || m.status?.startsWith('pending_')
      );

      const actualSeatsTaken = activeMembers.filter(
        (m: any) => m.status === 'active'
      ).length;

      return {
        ...pod,
        pod_members: activeMembers,
        actual_seats_taken: actualSeatsTaken,
        actual_available_seats: (pod.ride_template?.available_seats || 0) - actualSeatsTaken,
      };
    });

    // Filter inactive members from rider pod view too
    const processedRiderRides = (riderRides || []).map((ride) => {
      if (ride.pod?.pod_members) {
        const activeMembers = ride.pod.pod_members.filter(
          (m: any) => m.status === 'active' || m.status?.startsWith('pending_')
        );
        return {
          ...ride,
          pod: {
            ...ride.pod,
            pod_members: activeMembers,
          },
        };
      }
      return ride;
    });

    // Fetch activity logs for host pods (limited to recent 10)
    const podIds = processedHostPods.map((p: any) => p.id);
    let activityLogs: any[] = [];

    if (podIds.length > 0) {
      const { data: logs } = await supabase
        .from("activity_logs")
        .select("*")
        .in("entity_id", podIds)
        .eq("entity_type", "pod")
        .order("log_time", { ascending: false })
        .limit(10);

      activityLogs = (logs || []).map((log: any) => {
        const normalizedAction = log.action?.toLowerCase() || "";
        let message = "";

        if (normalizedAction.includes("leave")) {
          message = log.details?.reason ? `Rider left: ${log.details.reason}` : "Rider left the pod";
        } else if (normalizedAction.includes("dismiss") || normalizedAction.includes("remove")) {
          message = log.details?.reason ? `Rider dismissed: ${log.details.reason}` : "Rider was removed";
        } else if (normalizedAction.includes("join")) {
          message = "New rider joined";
        } else if (normalizedAction.includes("confirm")) {
          message = "Ride confirmed";
        } else {
          message = log.action || "Activity";
        }

        return { ...log, message };
      });
    }

    return NextResponse.json({
      host_pods: processedHostPods,
      rider_rides: processedRiderRides,
      activity_logs: activityLogs,
    });
  } catch (error) {
    console.error("Unexpected error in /api/pods/current:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
