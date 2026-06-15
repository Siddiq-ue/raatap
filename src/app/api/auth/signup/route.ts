import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY!);

// Create Supabase client with SERVICE_ROLE key for admin privileges
// This is required to bypass rate limits and use generateLink safely on backend
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
    
    // Generate a secure temporary password
    const tempPassword = crypto.randomUUID() + "Aa1!";

    console.log("Generating signup link via Admin API for:", email);

    // 1. Generate the signup link using Supabase Admin API
    // This creates the user but prevents Supabase from sending its own email
    // This perfectly bypasses the Supabase Auth free-tier email rate limiting
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email: email,
      password: tempPassword,
      options: {
        data: {
          password_set: false, // Guard flag for the dashboard
        },
        redirectTo: `${origin}/api/auth/callback?type=signup`,
      },
    });

    if (linkError) {
      console.error("Error generating signup link:", linkError);
      
      // If user already exists, Supabase throws an error or returns unique violation
      if (linkError.message.includes("already registered") || linkError.message.includes("already exists")) {
        return NextResponse.json(
          { error: "This email is already registered. Please log in instead." },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { error: "Failed to generate signup link. Please try again." },
        { status: 500 }
      );
    }

    const actionLink = linkData.properties?.action_link;
    
    if (!actionLink) {
      console.error("No action_link returned from Supabase:", linkData);
      return NextResponse.json(
        { error: "Failed to generate valid signup link." },
        { status: 500 }
      );
    }

    console.log("Link generated successfully, sending via Resend...");

    // 2. Send the customizable email via Resend
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
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #6675FF 0%, #8B5CF6 100%); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Raatap</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Finish setting up your account</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 32px;">
              <h2 style="color: #171717; margin: 0 0 16px 0; font-size: 20px;">Verify your email</h2>
              <p style="color: #666; margin: 0 0 24px 0; line-height: 1.6;">
                Thanks for joining Raatap! Click the button below to verify your email address and create your password.
              </p>
              
              <!-- Action Button -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${actionLink}" style="background-color: #6675FF; color: white; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
                  Verify Email
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px; margin: 0 0 8px 0;">Or copy and paste this link in your browser:</p>
              <p style="color: #6675FF; font-size: 12px; margin: 0; word-break: break-all;">
                ${actionLink}
              </p>
              
              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #eee;">
                <p style="color: #999; font-size: 13px; margin: 0; line-height: 1.5;">
                  If you didn't request this verification, you can safely ignore this email.
                </p>
              </div>
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

    console.log("Signup magic link sent via Resend successfully to:", email);

    return NextResponse.json({
      success: true,
      message: "Verification email sent successfully",
    });
  } catch (error) {
    console.error("Signup bypass error:", error);
    return NextResponse.json(
      {
        error: "Internal server error connecting to authentication service.",
      },
      { status: 500 }
    );
  }
}
