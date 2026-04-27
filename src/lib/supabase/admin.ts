// src/lib/supabase/admin.ts
//
// PRIVILEGED Supabase client — uses the SECRET key.
// BYPASSES Row Level Security. Use ONLY for:
//   - Cron jobs (master scheduler)
//   - Agent runners (consumer of the queue)
//   - Webhook handlers
//   - Admin/back-office operations (Dean only)
//
// 🚨 NEVER import this from a Client Component.
// 🚨 NEVER expose the result to the browser.
// 🚨 NEVER use this for authenticated user requests — use server.ts instead.
//
// If you find yourself reaching for this in a regular page or component,
// STOP. The right answer is almost certainly server.ts with proper RLS.

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Missing Supabase admin credentials. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
