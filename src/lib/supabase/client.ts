// src/lib/supabase/client.ts
//
// Browser-side Supabase client.
// Use this in Client Components (files with "use client").
// Reads cookies from document.cookie. Respects RLS via the publishable key.

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
