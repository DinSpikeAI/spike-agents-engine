// src/app/dashboard/actions/growth.ts
//
// Server actions for the Growth Agent dashboard.
//
// What lives here:
//   - triggerGrowthOnDemand(): fires when the owner clicks "הפק עכשיו"
//     on /dashboard/growth. Pro tier only, 60-minute cooldown.
//
// Sprint 1C scope: just the on-demand trigger. Approve / reject / mark-closed
// actions for individual candidates ship with the dashboard UI in Sprint 2.

"use server";

import { revalidatePath } from "next/cache";
import { requireOnboarded } from "@/lib/auth/require-onboarded";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import type { GrowthRunTrigger } from "@/lib/agents/growth/types";

// ─────────────────────────────────────────────────────────────
// Tunable
// ─────────────────────────────────────────────────────────────

/** Minimum minutes between manual triggers per tenant. */
const ON_DEMAND_COOLDOWN_MINUTES = 60;

/** Tiers allowed to use the on-demand button. */
const ON_DEMAND_ALLOWED_TIERS = ["pro", "chain"] as const;

// ─────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────

export interface TriggerGrowthOnDemandResult {
  success: boolean;
  /** Hebrew message safe to display to the owner */
  message: string;
}

// ─────────────────────────────────────────────────────────────
// triggerGrowthOnDemand
// ─────────────────────────────────────────────────────────────

export async function triggerGrowthOnDemand(): Promise<TriggerGrowthOnDemandResult> {
  // ─── Auth ────────────────────────────────────────────────
  const ctx = await requireOnboarded();
  const { userId, tenantId } = ctx;

  const db = createAdminClient();

  // ─── Tier gate ───────────────────────────────────────────
  // The on-demand button is a Pro/Chain feature. Solo gets the weekly
  // cron only. Tier is read from tenants.config.tier (jsonb).
  // If config.tier is missing, we treat the tenant as Solo (default).
  const { data: tenantRow, error: tenantErr } = await db
    .from("tenants")
    .select("config")
    .eq("id", tenantId)
    .single();

  if (tenantErr || !tenantRow) {
    console.error("[growth/onDemand] tenant lookup failed:", tenantErr);
    return {
      success: false,
      message: "שגיאה זמנית בטעינת פרטי העסק. נסה שוב בעוד רגע.",
    };
  }

  const config = (tenantRow.config ?? {}) as { tier?: string };
  const tier = (config.tier ?? "solo").toLowerCase();
  const isAllowedTier = (ON_DEMAND_ALLOWED_TIERS as readonly string[]).includes(
    tier
  );

  if (!isAllowedTier) {
    return {
      success: false,
      message:
        "ההפעלה הידנית של סוכן הצמיחה זמינה רק במנוי Pro או Chain. שדרג כדי להשתמש.",
    };
  }

  // ─── Rate limit check ────────────────────────────────────
  // Query growth_runs directly for the tenant. We allow re-triggering
  // only after ON_DEMAND_COOLDOWN_MINUTES since the last on-demand or
  // cron run, whichever was more recent.
  const cutoff = new Date(
    Date.now() - ON_DEMAND_COOLDOWN_MINUTES * 60 * 1000
  ).toISOString();

  const { data: recentRuns, error: runsErr } = await db
    .from("growth_runs")
    .select("started_at, status, trigger")
    .eq("tenant_id", tenantId)
    .gte("started_at", cutoff)
    .in("status", ["running", "succeeded", "partial"])
    .order("started_at", { ascending: false })
    .limit(1);

  if (runsErr) {
    console.error("[growth/onDemand] rate limit check failed:", runsErr);
    // Fail open — don't block the user on a transient DB blip. The
    // Inngest concurrency limit (5) is a backstop against a runaway
    // click-storm.
  } else if (recentRuns && recentRuns.length > 0) {
    const lastRun = recentRuns[0];
    const lastTs = new Date(lastRun.started_at).getTime();
    const minutesSince = Math.floor((Date.now() - lastTs) / 60000);
    const minutesLeft = Math.max(
      1,
      ON_DEMAND_COOLDOWN_MINUTES - minutesSince
    );

    return {
      success: false,
      message: `ניתן להפעיל שוב בעוד ${minutesLeft} דקות. סוכן הצמיחה רץ לאחרונה ${
        lastRun.trigger === "cron" ? "במחזור השבועי האוטומטי" : "ידנית"
      }.`,
    };
  }

  // ─── Fire Inngest event ──────────────────────────────────
  // The runGrowthForTenant function listens for "growth/run.tenant"
  // events. Sending the event returns immediately — the actual Growth
  // run executes in Inngest's background runtime.
  try {
    await inngest.send({
      name: "growth/run.tenant",
      data: {
        tenantId,
        trigger: "on_demand" satisfies GrowthRunTrigger,
        triggeredBy: userId,
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[growth/onDemand] inngest.send failed:", errorMessage);
    return {
      success: false,
      message: "לא הצלחנו להפעיל את הסוכן כרגע. נסה שוב בעוד מספר דקות.",
    };
  }

  // Refresh the dashboard view so the run shows up immediately
  revalidatePath("/dashboard/growth");

  return {
    success: true,
    message:
      "סוכן הצמיחה הופעל. רשימת ההזדמנויות תהיה מוכנה תוך כ-30-60 שניות.",
  };
}
