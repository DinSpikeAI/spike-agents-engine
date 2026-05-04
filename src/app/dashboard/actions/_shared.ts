// src/app/dashboard/actions/_shared.ts
//
// Internal helpers shared across all dashboard action files.
//
// IMPORTANT: This file does NOT have "use server" at the top.
// Why: these are helper utilities (functions called by server actions),
// not server actions themselves. Adding "use server" here would expose
// them as RPC endpoints, which is unnecessary surface area and bypasses
// the rate-limit / auth wrappers we already have.
//
// What lives here:
//   - getActiveTenant():   resolve current user's active tenant_id
//   - checkAgentRateLimit(): cooldown check shared by all agent triggers
//   - RATE_LIMIT_MINUTES:  per-agent cooldown configuration
//
// All exports are imported by sibling files in src/app/dashboard/actions/.
// They are never imported by Client Components directly.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentId } from "@/lib/agents/types";

// ─────────────────────────────────────────────────────────────
// Rate limit configuration (non-Manager agents)
// ─────────────────────────────────────────────────────────────
//
// Manager has its own weekly-lock model in manager.ts — it does NOT use
// these cooldowns. These apply to: morning, watcher, reviews, hot_leads,
// social, sales, inventory.
//
// `cleanup` is internal-only (cron) and never user-triggered, but it has
// an entry here for completeness.

export const RATE_LIMIT_MINUTES: Record<AgentId, number> = {
  manager: 240, // not used — see weekly lock logic in manager.ts
  reviews: 30,
  hot_leads: 30,
  watcher: 5,
  morning: 5,
  social: 30,
  sales: 30,
  cleanup: 30,
  inventory: 5,
};

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterMinutes?: number;
  message?: string;
}

/**
 * Check if a tenant can run an agent right now, or must wait for cooldown.
 *
 * Rules:
 *   - "running" status: always blocked (concurrency protection)
 *   - "succeeded" within cooldown window: blocked with retry-after
 *   - DB error: fail open (return allowed=true) so transient DB issues
 *     don't block the user. The agent runner has its own concurrency
 *     guards as a backstop.
 */
export async function checkAgentRateLimit(
  tenantId: string,
  agentId: AgentId
): Promise<RateLimitCheckResult> {
  const cooldownMinutes = RATE_LIMIT_MINUTES[agentId];
  const cooldownMs = cooldownMinutes * 60 * 1000;
  const cutoff = new Date(Date.now() - cooldownMs).toISOString();

  const db = createAdminClient();

  const { data, error } = await db
    .from("agent_runs")
    .select("started_at, status")
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId)
    .in("status", ["running", "succeeded"])
    .gte("started_at", cutoff)
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error(`[rateLimit] DB error checking ${agentId}:`, error);
    return { allowed: true };
  }

  if (!data || data.length === 0) return { allowed: true };

  const latestRun = data[0];
  const lastRunTime = new Date(latestRun.started_at as string).getTime();
  const elapsedMs = Date.now() - lastRunTime;
  const remainingMs = cooldownMs - elapsedMs;
  const retryAfterMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));

  if (latestRun.status === "running") {
    return {
      allowed: false,
      retryAfterMinutes,
      message: "הסוכן עדיין רץ. המתן עד שהריצה הקודמת תסתיים.",
    };
  }

  const elapsedMinutes = Math.max(1, Math.floor(elapsedMs / 60_000));
  return {
    allowed: false,
    retryAfterMinutes,
    message: `הסוכן רץ לפני ${elapsedMinutes} דק׳. ניתן להפעיל שוב בעוד ${retryAfterMinutes} דק׳.`,
  };
}

// ─────────────────────────────────────────────────────────────
// Active tenant resolution
// ─────────────────────────────────────────────────────────────
//
// Every server action in this module needs the current user's active
// tenant_id. This helper returns either { tenantId } or { error }.
//
// Why a discriminated union instead of throwing:
//   Server actions return { success, error } shapes that the UI displays
//   directly. A thrown error here would be turned into a generic
//   "Internal Server Error" — losing the Hebrew user-facing message.
//
// Authentication failures and missing tenant both produce Hebrew error
// messages safe to show the user.

export async function getActiveTenant(): Promise<
  { tenantId: string } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "לא מחובר. אנא התחבר מחדש." };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("user_settings")
    .select("active_tenant_id")
    .eq("user_id", user.id)
    .single();

  if (settingsError || !settings?.active_tenant_id) {
    return { error: "לא נמצא tenant פעיל. צור קשר עם התמיכה." };
  }

  return { tenantId: settings.active_tenant_id };
}
