import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";
  const type = requestUrl.searchParams.get("type"); // 'signup', 'recovery', 'invite'

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(
            cookiesToSet: {
              name: string;
              value: string;
              options: CookieOptions;
            }[],
          ) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              );
            } catch {
              // Handle cookie setting errors
            }
          },
        },
      },
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Auth callback error:", error);
      return NextResponse.redirect(
        new URL(
          `/signup?error=${encodeURIComponent(error.message)}`,
          requestUrl.origin,
        ),
      );
    }

    // Check the type of callback
    if (type === "signup" || type === "email") {
      // Email verification completed — redirect to set-password page
      // so user can create their real password (signup only asked for email)
      if (data.user?.email_confirmed_at) {
        return NextResponse.redirect(
          new URL("/set-password?new=true", requestUrl.origin),
        );
      }
    }

    if (type === "recovery") {
      // Password recovery flow
      return NextResponse.redirect(
        new URL("/reset-password", requestUrl.origin),
      );
    }

    // Check if user authenticated via OAuth (Google, etc.)
    // OAuth providers already verify email, so we can skip email verification
    // Supabase stores provider info in different places depending on auth method
    const provider = data.user?.app_metadata?.provider;
    const providers = data.user?.app_metadata?.providers as
      | string[]
      | undefined;

    // User is OAuth if: provider is set and not 'email', OR providers array contains non-email providers
    const isOAuthUser =
      (provider && provider !== "email") ||
      (providers && providers.some((p) => p !== "email" && p !== "password"));

    // Debug logging
    console.log("Auth callback - User:", data.user?.email);
    console.log("Auth callback - Provider:", provider);
    console.log("Auth callback - Providers:", providers);
    console.log("Auth callback - isOAuthUser:", isOAuthUser);
    console.log(
      "Auth callback - email_confirmed_at:",
      data.user?.email_confirmed_at,
    );

    // Check if user's email is verified (skip for OAuth users)
    if (data.user && !data.user.email_confirmed_at && !isOAuthUser) {
      // Email not verified yet (only for email/password signups)
      console.log("Auth callback - Redirecting to verify-email");
      return NextResponse.redirect(new URL("/verify-email", requestUrl.origin));
    }

    // Successfully authenticated - redirect to dashboard
    console.log("Auth callback - Redirecting to dashboard");

    // Create redirect response
    const redirectUrl = new URL(next, requestUrl.origin);
    const response = NextResponse.redirect(redirectUrl);

    // Copy all cookies from cookieStore to the response to ensure they persist
    const allCookies = cookieStore.getAll();
    for (const cookie of allCookies) {
      if (cookie.name.includes("supabase") || cookie.name.includes("sb-")) {
        response.cookies.set(cookie.name, cookie.value, {
          path: "/",
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7, // 7 days
        });
      }
    }

    return response;
  }

  // No code present, check for error
  const errorDescription = requestUrl.searchParams.get("error_description");
  if (errorDescription) {
    return NextResponse.redirect(
      new URL(
        `/signup?error=${encodeURIComponent(errorDescription)}`,
        requestUrl.origin,
      ),
    );
  }

  // No code or error, redirect to signup
  return NextResponse.redirect(new URL("/signup", requestUrl.origin));
}
