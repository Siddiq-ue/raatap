import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

// Create Supabase client with service role for OTP storage
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Generate a 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, userId } = body;

    console.log("OTP Send Request:", { email, userId });

    if (!email || !userId) {
      console.log("Missing email or userId");
      return NextResponse.json(
        { error: "Email and userId are required" },
        { status: 400 },
      );
    }

    const { data: authUserData, error: authUserError } =
      await supabase.auth.admin.getUserById(userId);

    if (authUserError || !authUserData?.user) {
      console.error("Invalid userId for OTP send:", authUserError);
      return NextResponse.json(
        { error: "Session not found for this user. Please sign in again." },
        { status: 401 },
      );
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    console.log("Generated OTP:", otp);

    // Store OTP in database (upsert to handle resends)
    const { error: dbError } = await supabase.from("email_otps").upsert(
      {
        user_id: userId,
        email: email,
        otp: otp,
        expires_at: expiresAt.toISOString(),
        verified: false,
      },
      { onConflict: "user_id" },
    );

    if (dbError) {
      console.error("Database error:", dbError);
      return NextResponse.json(
        { error: `Database error: ${dbError.message}` },
        { status: 500 },
      );
    }

    console.log("OTP stored in database");

    // Send email via Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "Raatap <team@raatap.com>",
      to: email,
      subject: "Verify your email - Raatap",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #6675FF 0%, #8B5CF6 100%); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Raatap</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Let's Go Together</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 32px;">
              <h2 style="color: #171717; margin: 0 0 16px 0; font-size: 20px;">Verify your email</h2>
              <p style="color: #666; margin: 0 0 24px 0; line-height: 1.6;">
                Use the code below to verify your email address. This code will expire in 10 minutes.
              </p>
              
              <!-- OTP Box -->
              <div style="background: #f8f9ff; border: 2px dashed #6675FF; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #6675FF;">${otp}</span>
              </div>
              
              <p style="color: #999; font-size: 13px; margin: 0; line-height: 1.5;">
                If you didn't request this verification, you can safely ignore this email.
              </p>
            </div>
            
            <!-- Footer -->
            <div style="background: #f9fafb; padding: 20px 32px; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0; text-align: center;">
                © 2026 Raatap. Coordinating trusted commutes.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (emailError) {
      console.error("Email error:", emailError);
      return NextResponse.json(
        { error: `Email error: ${emailError.message}` },
        { status: 500 },
      );
    }

    console.log("Email sent successfully:", emailData);

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("Send OTP error:", error);
    return NextResponse.json(
      {
        error: `Internal server error: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 },
    );
  }
}
