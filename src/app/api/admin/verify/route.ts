import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = req.cookies.get("admin_session");

  if (!session?.value) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    // Decode and verify the session token
    const decoded = Buffer.from(session.value, "base64").toString("utf-8");
    const [email, timestamp] = decoded.split(":");
    
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    
    // Check if email matches and session is less than 24 hours old
    const sessionAge = Date.now() - parseInt(timestamp);
    const maxAge = 60 * 60 * 24 * 1000; // 24 hours in ms
    
    if (email === adminEmail && sessionAge < maxAge) {
      return NextResponse.json({ authenticated: true, email });
    }
    
    return NextResponse.json({ authenticated: false }, { status: 401 });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
