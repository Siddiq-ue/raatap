import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User, Session } from "@supabase/supabase-js";

/**
 * Creates a Supabase client for server-side use in API routes and server components
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
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
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    },
  );
}

/**
 * Get the current session from server-side
 * Returns session with JWT tokens if authenticated
 */
export async function getServerSession(): Promise<Session | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Get the current user from server-side
 * This validates the JWT token with Supabase
 */
export async function getServerUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Check if user's email is verified
 */
export async function isEmailVerified(): Promise<boolean> {
  const user = await getServerUser();
  return user?.email_confirmed_at != null;
}

/**
 * Require authentication for API routes
 * Returns user if authenticated, throws error if not
 */
export async function requireAuth(): Promise<User> {
  const user = await getServerUser();

  if (!user) {
    throw new Error("Unauthorized: No valid session");
  }

  return user;
}

/**
 * Require email verification for API routes
 * Returns user if authenticated and email verified, throws error if not
 */
export async function requireVerifiedEmail(): Promise<User> {
  const user = await requireAuth();

  if (!user.email_confirmed_at) {
    throw new Error("Unauthorized: Email not verified");
  }

  return user;
}

/**
 * Decode JWT token to get payload (without verification)
 * For debugging purposes only - always use Supabase to verify tokens
 */
export function decodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = Buffer.from(payload, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Get JWT token info (for display purposes)
 */
export async function getJwtInfo(): Promise<{
  accessToken: string | null;
  expiresAt: number | null;
  provider: string | null;
  email: string | null;
  emailVerified: boolean;
} | null> {
  const session = await getServerSession();

  if (!session) return null;

  return {
    accessToken: session.access_token,
    expiresAt: session.expires_at || null,
    provider: session.user?.app_metadata?.provider || "email",
    email: session.user?.email || null,
    emailVerified: session.user?.email_confirmed_at != null,
  };
}
