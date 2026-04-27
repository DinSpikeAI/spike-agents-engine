// src/lib/supabase/server.ts
//
// Server-side Supabase client for Next.js Server Components, Server Actions,
// and Route Handlers. Reads/writes cookies via next/headers. Respects RLS
// via the publishable key.
//
// Use this for ANY user-scoped operation that needs RLS enforcement.
// Do NOT use admin.ts for user-scoped requests — it bypasses RLS.
//
// CRITICAL: never call createClient() at module scope. Vercel Fluid Compute
// shares process state between tenants — a module-scoped client would leak
// JWTs across users. Always create per-request, inside the handler.

import "server-only";  // build-time guard: this file must NEVER reach the browser

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();  // async in Next.js 15+

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — cookies are read-only here.
            // Session refresh happens via proxy.ts instead. This is safe.
          }
        },
      },
    }
  );
}
