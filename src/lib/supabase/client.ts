// src/lib/supabase/client.ts
//
// Browser-side Supabase client for use in Client Components.
// Reads cookies from document.cookie. Respects RLS via the publishable key.
//
// Use this in any file that starts with "use client".

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
