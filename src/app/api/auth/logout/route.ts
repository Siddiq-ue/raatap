import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST() {
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

  // Sign out from Supabase (invalidates the session)
  const { error } = await supabase.auth.signOut();

  if (error) {
    return NextResponse.json({ error: "Failed to sign out" }, { status: 500 });
  }

  // Clear all Supabase-related cookies
  const allCookies = cookieStore.getAll();
  allCookies.forEach((cookie) => {
    if (cookie.name.includes("supabase") || cookie.name.includes("sb-")) {
      cookieStore.delete(cookie.name);
    }
  });

  return NextResponse.json({ success: true });
}

// Also support GET for simple logout links
export async function GET(request: Request) {
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

  await supabase.auth.signOut();

  const requestUrl = new URL(request.url);
  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
