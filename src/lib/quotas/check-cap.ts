// src/lib/quotas/check-cap.ts
//
// Day 11A — Spend cap enforcement primitive.
//
// Every agent MUST call assertWithinSpendCap() before making any Anthropic
// API call. This function is the single point of enforcement for:
//
//   1. Admin disable (tenants.is_active=false → all agents blocked)
//   2. Monthly spend cap (spend_used_ils + estimated >= spend_cap_ils → blocked)
//   3. Reserved spend (in-flight runs counted toward the cap)
//
// The function does NOT modify state. It only checks and returns a verdict.
// Actual reservation happens via the existing reserve_spend() RPC after
// the check passes.
//
// Hebrew error messages are designed for direct UI display.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type SpendCapBlockReason =
  | "tenant_inactive"      // Admin disabled the tenant
  | "cap_exceeded"          // Already over the monthly cap
  | "would_exceed"          // This run would exceed the cap
  | "tenant_not_found";     // Defensive — should not happen

export interface SpendCapCheckResult {
  allowed: boolean;
  reason?: SpendCapBlockReason;
  /** Hebrew message for end-user display. Set when allowed=false. */
  messageHe?: string;
  /** Snapshot of current spend state. Useful for logging and UI. */
  snapshot: {
    capIls: number;
    usedIls: number;
    reservedIls: number;
    estimatedRunCostIls: number;
    /** What usedIls + reservedIls + estimatedRunCostIls would be if this run proceeded. */
    projectedUsageIls: number;
    /** Percentage 0..1 of cap that would be used after this run. */
    projectedUtilization: number;
  };
}

/**
 * Check whether a tenant can afford a new agent run.
 *
 * @param tenantId — UUID of the tenant
 * @param estimatedRunCostIls — Forward-looking estimate of THIS run's cost in ILS.
 *   Use estimateAgentRunCostIls() to get realistic numbers per agent.
 *
 * @returns Verdict object. Caller should return early with the Hebrew message
 *   when allowed=false.
 */
export async function assertWithinSpendCap(
  tenantId: string,
  estimatedRunCostIls: number
): Promise<SpendCapCheckResult> {
  const db = createAdminClient();

  const { data, error } = await db
    .from("tenants")
    .select("name, is_active, spend_cap_ils, spend_used_ils, spend_reserved_ils")
    .eq("id", tenantId)
    .single();

  if (error || !data) {
    console.error("[assertWithinSpendCap] tenant not found:", tenantId, error);
    return {
      allowed: false,
      reason: "tenant_not_found",
      messageHe: "לא נמצא חשבון פעיל. צור קשר עם התמיכה.",
      snapshot: {
        capIls: 0,
        usedIls: 0,
        reservedIls: 0,
        estimatedRunCostIls,
        projectedUsageIls: 0,
        projectedUtilization: 0,
      },
    };
  }

  const capIls = Number(data.spend_cap_ils ?? 0);
  const usedIls = Number(data.spend_used_ils ?? 0);
  const reservedIls = Number(data.spend_reserved_ils ?? 0);
  const projectedUsageIls = usedIls + reservedIls + estimatedRunCostIls;
  const projectedUtilization = capIls > 0 ? projectedUsageIls / capIls : 0;

  const snapshot = {
    capIls,
    usedIls,
    reservedIls,
    estimatedRunCostIls,
    projectedUsageIls,
    projectedUtilization,
  };

  // Block 1: Admin has disabled the tenant
  if (!data.is_active) {
    return {
      allowed: false,
      reason: "tenant_inactive",
      messageHe:
        "החשבון מושהה כעת. אנא פנה לתמיכה בכתובת support@spikeai.co.il.",
      snapshot,
    };
  }

  // Block 2: Already over cap (e.g., last run pushed past 100%)
  if (capIls > 0 && usedIls + reservedIls >= capIls) {
    return {
      allowed: false,
      reason: "cap_exceeded",
      messageHe: `הגעת למכסת ההוצאה החודשית (₪${capIls.toFixed(0)}). הסוכנים יחזרו לפעול ב-1 לחודש הבא.`,
      snapshot,
    };
  }

  // Block 3: This specific run would push over cap
  if (capIls > 0 && projectedUsageIls > capIls) {
    return {
      allowed: false,
      reason: "would_exceed",
      messageHe: `הריצה הזו תחרוג מהמכסה החודשית (₪${capIls.toFixed(0)}). הסוכנים יחזרו לפעול ב-1 לחודש הבא.`,
      snapshot,
    };
  }

  // All clear
  return {
    allowed: true,
    snapshot,
  };
}

// ─────────────────────────────────────────────────────────────
// Per-agent cost estimates
// ─────────────────────────────────────────────────────────────
//
// These are FORWARD-LOOKING estimates used to predict whether a run
// will push the tenant over their cap. They include a small safety
// margin (typically 20% above measured average) to avoid false-OKs.
//
// Real cost is tracked via reserve_spend → settle_spend after the run
// completes; the actual ILS charged to spend_used_ils is the metered
// number, NOT this estimate.
//
// Update these numbers based on production telemetry as it accumulates.

const AGENT_COST_ESTIMATES_ILS: Record<string, number> = {
  morning: 0.02,        // measured ~₪0.011, 80% safety margin
  watcher: 0.04,        // measured ~₪0.021, 90% margin (varies with event count)
  reviews: 0.20,        // measured ~₪0.148, 35% margin (Sonnet + 3x Haiku)
  hot_leads: 0.04,      // measured ~₪0.025, 60% margin
  manager: 0.50,        // measured ~₪0.34, 47% margin (thinking variance)
  // Not-yet-built agents — conservative estimates
  social: 0.10,
  sales: 0.15,
  cleanup: 0.05,
  inventory: 0.05,
};

export function estimateAgentRunCostIls(agentId: string): number {
  return AGENT_COST_ESTIMATES_ILS[agentId] ?? 0.10;
}
