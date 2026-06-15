import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware for Route Redirects
 *
 * This middleware:
 * 1. Redirects /login to /signup (login page removed)
 *
 * Auth protection is handled by client-side components
 * since we use implicit OAuth flow with localStorage sessions.
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Redirect /login to /signup (login page removed) - REMOVED for Email/Password Auth
  // if (pathname === "/login") {
  //   return NextResponse.redirect(new URL("/signup", request.url));
  // }

  // Always allow the request through
  // Client-side components handle their own auth and redirects
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Run middleware on all routes except:
     * - API routes (handle own auth)
     * - Static files
     * - Images
     */
    "/((?!api|_next/static|_next/image|favicon.ico|favicon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
