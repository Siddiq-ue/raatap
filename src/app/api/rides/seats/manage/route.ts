import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { templateId, operation } = await request.json();

    if (!templateId || !operation) {
      return NextResponse.json(
        { error: "Missing required fields: templateId, operation" },
        { status: 400 }
      );
    }

    if (!['lock', 'unlock'].includes(operation)) {
      return NextResponse.json(
        { error: "operation must be either 'lock' or 'unlock'" },
        { status: 400 }
      );
    }

    // Call seat validation function
    const { data, error } = await supabase.rpc("validate_and_lock_seat", {
      template_id: templateId,
      operation: operation,
    });

    if (error) {
      console.error("Error managing seat:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}