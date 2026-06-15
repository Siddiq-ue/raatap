import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY!);

// Create Supabase client with SERVICE_ROLE key for admin privileges
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const requestUrl = new URL(request.url);
    const origin = requestUrl.origin;

    console.log("Generating magic link via Admin API for resend/login:", email);

    // Generate a magic link for an EXISTING user (resend verification / login)
    // This perfectly bypasses the Supabase Auth free-tier email rate limiting
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: email,
      options: {
        redirectTo: `${origin}/api/auth/callback?type=signup`,
      },
    });

    if (linkError) {
      console.error("Error generating magic link:", linkError);
      return NextResponse.json(
        { error: "Failed to generate verification link. The email might not be registered." },
        { status: 400 }
      );
    }

    const actionLink = linkData.properties?.action_link;
    
    if (!actionLink) {
      return NextResponse.json(
        { error: "Failed to generate valid link." },
        { status: 500 }
      );
    }

    console.log("Link generated successfully, sending via Resend...");

    // Send the customizable email via Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "Raatap <team@raatap.com>",
      to: email,
      subject: "Verify your email to join Raatap",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #6675FF 0%, #8B5CF6 100%); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Raatap</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Finish setting up your account</p>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #171717; margin: 0 0 16px 0; font-size: 20px;">Verify your email</h2>
              <p style="color: #666; margin: 0 0 24px 0; line-height: 1.6;">
                Here is your new verification link. Click the button below to verify your email address.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${actionLink}" style="background-color: #6675FF; color: white; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
                  Verify Email
                </a>
              </div>
              <p style="color: #666; font-size: 14px; margin: 0 0 8px 0;">Or copy and paste this link in your browser:</p>
              <p style="color: #6675FF; font-size: 12px; margin: 0; word-break: break-all;">
                ${actionLink}
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (emailError) {
      console.error("Resend email error:", emailError);
      return NextResponse.json(
        { error: "Failed to send email. Please try again later." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Verification email resent successfully",
    });
  } catch (error) {
    console.error("Signup bypass error:", error);
    return NextResponse.json(
      { error: "Internal server error connecting to authentication service." },
      { status: 500 }
    );
  }
}
