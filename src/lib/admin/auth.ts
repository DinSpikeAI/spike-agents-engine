// src/lib/admin/auth.ts
//
// Day 11B — Admin authentication helpers.
//
// Spike's admin role is NOT stored in the DB. Instead, we use an env var
// (ADMIN_EMAILS) listing the email addresses that have admin access.
//
// Why env-var and not a DB column:
//   1. MVP simplicity — Dean is the only admin for now. No need for a
//      users.role column with all the migration overhead.
//   2. Safer — accidentally setting role='admin' in a DB row is harder
//      than realizing your env var is wrong.
//   3. Forces deployment — adding a new admin requires a Vercel env
//      change, which is auditable in the deployment history.
//   4. Trivially evolvable — when we eventually need a UI for adding
//      admins, we add a users.role column then; today we don't need it.
//
// ADMIN_EMAILS is a comma-separated list, e.g.:
//   ADMIN_EMAILS=din6915@gmail.com,partner@spikeai.co.il
//
// Pattern follows the same shape as src/app/dashboard/page.tsx:
//   - createClient() (server-side, RLS-respecting)
//   - auth.getUser()
//   - check + redirect if needed
//
// The proxy.ts already redirects unauthenticated users to /login. By the time
// requireAdmin() runs, we know there IS a user — we're just checking if that
// user has admin privileges. So the redirect on failure goes to /dashboard
// (the user has a normal account, just not admin), not /login.

import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Parse ADMIN_EMAILS env var into a normalized Set.
 * Handles whitespace, mixed case, empty strings.
 * Computed once per module load (env vars don't change at runtime).
 */
const ADMIN_EMAILS: ReadonlySet<string> = (() => {
  const raw = process.env.ADMIN_EMAILS ?? "";
  const emails = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  return new Set(emails);
})();

/**
 * Pure boolean check — is this email an admin?
 * Use for non-redirecting cases (e.g. "show this section only to admins").
 *
 * Returns false for null/undefined/empty inputs.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase().trim());
}

/**
 * Require an authenticated admin user. Returns the user object on success.
 *
 * Behavior:
 *   - No session → redirect to /login (proxy should handle this first, but defensive)
 *   - Authenticated non-admin → redirect to /dashboard
 *   - Authenticated admin → returns the user
 *
 * Use this at the TOP of every admin page.tsx and server action that
 * should only be reachable by admins.
 *
 * @throws never — always either redirects or returns
 */
export async function requireAdmin(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // proxy.ts should have caught this, but defensive
    redirect("/login");
  }

  if (!isAdminEmail(user.email)) {
    // Authenticated but not admin — back to their normal dashboard.
    // We do NOT show an error page because we don't want to confirm
    // the existence of /admin to non-admin users.
    redirect("/dashboard");
  }

  return user;
}

/**
 * Soft check for admin status — does NOT redirect.
 * Returns null if not admin (or not authenticated), the user otherwise.
 *
 * Use in server actions where the action should silently succeed
 * for non-admins (e.g. a query that returns extra data only for admins).
 */
export async function getAdminUserOrNull(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  if (!isAdminEmail(user.email)) return null;
  return user;
}

/**
 * Get the list of admin emails currently configured.
 * Useful for debugging in development; do NOT expose in client code.
 *
 * Returns frozen array.
 */
export function listAdminEmails(): readonly string[] {
  return Object.freeze([...ADMIN_EMAILS].sort());
}
