// proxy.ts
//
// Next.js 16 renamed middleware.ts -> proxy.ts. Same concept: a function that
// runs on every request before reaching the route. We use it to:
//
//   1. Refresh the Supabase session cookie (JWT expires in 1h by default;
//      this keeps it alive while the user is active).
//   2. Protect routes — anyone hitting /dashboard without a session is
//      redirected to /login.
//
// IMPORTANT: never call createClient() at module scope. Vercel Fluid Compute
// shares process state between tenants — a module-scoped client would leak
// JWTs across users. Always create per-request, inside this function.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that are public (no auth required).
// Everything else requires an authenticated session.
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/auth/callback",
  "/auth/error",
  "/accessibility",      // הצהרת נגישות לפי תקן 5568 — חייב להיות נגיש לכולם
  "/privacy",            // Privacy notice (חוק A13)
  "/terms",
];

// Path prefixes that are public
const PUBLIC_PREFIXES = [
  "/api/public/",
  "/_next/",
  "/favicon",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  // Start with a pass-through response. We may modify cookies on it below.
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // Per-request Supabase client — refreshes session via cookies.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mirror cookie writes to BOTH the request (so downstream handlers
          // see the fresh cookie) and the response (so the browser stores it).
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // CRITICAL: getUser() validates the JWT against Supabase Auth.
  // Never use getSession() for auth checks — it reads cookies without verification.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // If route is public, pass through (with refreshed cookies if any)
  if (isPublic(pathname)) {
    return response;
  }

  // Protected route — require authenticated user
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);  // remember where they were going
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated request — pass through with refreshed session
  return response;
}

// Match all routes except static assets and API routes that opt out
export const config = {
  matcher: [
    // Skip _next internals, favicon, image optimization, public assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
