// src/lib/auth/onboarding-status.ts
//
// Sub-stage 1.6 — Onboarding status helpers.
//
// Used by the onboarding banner on /dashboard to decide whether the user
// has yet to run their first real (non-mock) agent. Mock runs from the
// /dashboard/showcase page do NOT count — those are demos, not real work.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface OnboardingStatus {
  /** True if this tenant has zero non-mock agent_runs. Banner should show. */
  hasNoRealRuns: boolean;
  /** Total count of non-mock runs (used for richer UI later). */
  realRunCount: number;
}

/**
 * Check if the tenant has any non-mock agent runs.
 *
 * "Non-mock" means: any agent_runs row where is_mocked is NULL or false.
 * Demo runs from /dashboard/showcase always set is_mocked=true and are
 * therefore excluded.
 *
 * Errs on the side of NOT showing the banner if the query fails, since
 * showing it to a returning user would be confusing.
 */
export async function getOnboardingStatus(
  tenantId: string
): Promise<OnboardingStatus> {
  const db = createAdminClient();

  // Count non-mock agent_runs. We use head:true + count:'exact' so we don't
  // pull row data — just the count number. Fast and cheap.
  const { count, error } = await db
    .from("agent_runs")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .or("is_mocked.is.null,is_mocked.eq.false");

  if (error) {
    console.error("[onboarding-status] count query failed:", error);
    // Fail-closed: don't show the banner on errors.
    return { hasNoRealRuns: false, realRunCount: 0 };
  }

  const realRunCount = count ?? 0;
  return {
    hasNoRealRuns: realRunCount === 0,
    realRunCount,
  };
}
