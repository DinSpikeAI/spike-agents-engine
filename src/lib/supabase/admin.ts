// src/lib/supabase/admin.ts
//
// PRIVILEGED Supabase client — uses the SECRET key.
// BYPASSES Row Level Security. Use ONLY for:
//   - Cron jobs (master scheduler in /api/cron/*)
//   - Agent runners (consumer of the QStash queue)
//   - Webhook handlers (Stripe, Resend, QStash signature verified)
//   - Admin/back-office operations (Dean only, super_admin role)
//
// 🚨 NEVER import this from a Client Component.
// 🚨 NEVER expose the result to the browser.
// 🚨 NEVER use this for authenticated user requests — use server.ts instead.
//
// The "server-only" import below is a build-time guard: if anything in the
// React tree imports admin.ts (directly or transitively), the build fails
// with a clear error. This is the single most important safety net we have
// for the secret key.

import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Missing Supabase admin credentials. " +
      "Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
