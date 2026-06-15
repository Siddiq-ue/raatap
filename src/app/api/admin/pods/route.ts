import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    console.log("API [admin/pods] Fetching all pods...");

    // Fetch all active pods with their members (including dismissed/left for admin visibility)
    console.log("API [admin/pods] Querying pods table...");
    const { data: pods, error: podsError } = await supabase
      .from("pods")
      .select(`
        *,
        ride_templates (
          vehicle_type,
          from_location,
          to_location,
          departure_time,
          available_seats,
          seats_taken,
          days_available
        ),
        profiles (
          full_name,
          phone_number,
          gender
        ),
        pod_members (
          *,
          profiles (
            full_name,
            phone_number,
            gender
          ),
          ride_requests (
            pickup_location
          )
        )
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    console.log(`API [admin/pods] Pods query completed. Error: ${podsError ? podsError.message : 'none'}, Count: ${pods?.length || 0}`);

    if (podsError) {
      console.error("Error fetching pods:", podsError);
      return NextResponse.json(
        { error: podsError.message },
        { status: 500 }
      );
    }

    // Format pods data
    console.log("API [admin/pods] Formatting pods data...");
    const formattedPods = (pods || []).map((pod: any) => {
      const allMembers = pod.pod_members || [];
      
      // Count ACTIVE members only for seats_taken
      const activeMembers = allMembers.filter(
        (m: any) => m.status === 'active'
      );
      
      const formatted = {
        id: pod.id,
        host_name: pod.profiles?.full_name || "Host",
        host_phone: pod.profiles?.phone_number,
        vehicle_type: pod.ride_templates?.vehicle_type || "4_wheeler",
        from_location: pod.ride_templates?.from_location || pod.origin_location,
        to_location: pod.ride_templates?.to_location || pod.destination_location,
        departure_time: pod.ride_templates?.departure_time || pod.departure_time,
        days_available: pod.ride_templates?.days_available || pod.days_active,
        available_seats: pod.ride_templates?.available_seats || pod.available_seats,
        seats_taken: activeMembers.length, // Only count active members
        status: pod.status,
        members: allMembers.map((member: any) => ({
          rider_id: member.rider_id,
          rider_name: member.profiles?.full_name || "Rider",
          phone_number: member.profiles?.phone_number,
          pickup_location: member.ride_requests?.pickup_location || "N/A",
          status: member.status,
          joined_at: member.joined_at,
          rider_confirmed_at: member.rider_confirmed_at,
        })),
        // Summary counts
        member_counts: {
          active: allMembers.filter((m: any) => m.status === 'active').length,
          pending_host: allMembers.filter((m: any) => m.status === 'pending_host').length,
          pending_rider: allMembers.filter((m: any) => m.status === 'pending_rider').length,
          dismissed: allMembers.filter((m: any) => m.status === 'dismissed').length,
          left: allMembers.filter((m: any) => m.status === 'left').length,
          total: allMembers.length,
        },
      };
      return formatted;
    });

    console.log(`API [admin/pods] Formatted ${formattedPods.length} pods from database`);

    const totalTime = Date.now() - startTime;
    console.log(`API [admin/pods] Completed successfully. Total pods: ${formattedPods.length}, Time: ${totalTime}ms`);

    return NextResponse.json({ pods: formattedPods });
  } catch (error: any) {
    const totalTime = Date.now() - startTime;
    console.error(`API [admin/pods] Unexpected error after ${totalTime}ms:`, error);
    console.error("API [admin/pods] Error stack:", error?.stack);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
