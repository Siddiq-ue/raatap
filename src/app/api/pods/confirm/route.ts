import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Confirm a pending pod membership (rider side)
 * Updates pod_members status from 'pending_rider' to 'active'
 */
export async function POST(request: NextRequest) {
  try {
    const { rideRequestId, riderId } = await request.json();
    console.log("📥 [API] /api/pods/confirm - Confirming ride:", { rideRequestId, riderId });

    if (!rideRequestId || !riderId) {
      return NextResponse.json(
        { error: "Missing required fields: rideRequestId, riderId" },
        { status: 400 }
      );
    }

    // Find the pod member record and update it
    const { data, error } = await supabase.rpc("confirm_rider_ride", {
      p_ride_request_id: rideRequestId,
      p_rider_id: riderId,
    });

    if (error) {
      console.error("❌ [API] Error confirming ride:", error);
      return NextResponse.json(
        { error: error.message, success: false },
        { status: 400 }
      );
    }

    console.log("✅ [API] Ride confirmed successfully");
    return NextResponse.json({
      success: true,
      message: "Ride confirmed! You are now part of the pod.",
      data,
    });
  } catch (error) {
    console.error("❌ [API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}
