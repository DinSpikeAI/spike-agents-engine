// src/lib/supabase/server.ts
//
// Server-side Supabase client.
// Use this in Server Components, Server Actions, and Route Handlers.
// Reads/writes cookies via next/headers. Respects RLS via the publishable key.
//
// IMPORTANT: this is async because cookies() in Next 15+ is async.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

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
            // Session refresh will happen via middleware/proxy instead.
          }
        },
      },
    }
  );
}
