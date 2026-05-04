"use server";

// src/app/dashboard/reports/actions.ts
//
// Page-scoped server actions for /dashboard/reports.
//
// Pattern (CLAUDE.md §1.10): new pages get their OWN actions.ts co-located
// with the page (precedent: settings 1.7, alerts 1.10). This keeps page-
// scoped logic close to the page rather than bloating actions/reports-kpis.ts.
//
// Already exists in global actions/ (we re-import, NEVER redefine):
//   - listManagerReports(limit)        ← @/app/dashboard/actions (reports-kpis.ts)
//   - getManagerLockState()            ← @/app/dashboard/actions (manager.ts)
//   - markManagerReportRead(reportId)  ← @/app/dashboard/actions (manager.ts)
//   - triggerManagerAgentAction(days?) ← @/app/dashboard/actions (manager.ts)
//
// New here:
//   - getManagerReport(reportId) — fetch a single report by id, scoped to
//     the active tenant. Used by /dashboard/reports/[id]/page.tsx.

import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "@/app/dashboard/actions/_shared";
import type { ManagerReportRow } from "@/app/dashboard/actions/reports-kpis";

/**
 * Fetch a single Manager report by id, scoped to the active tenant.
 *
 * Returns the full ManagerReportRow including the JSONB `report` payload
 * and lock-state fields (`read_at`, `next_eligible_run_at`). The detail
 * page uses these to render the appropriate state:
 *   - read_at === null → show "סמן כנקרא" button.
 *   - read_at !== null → show "נקרא ב-..." pill + countdown to next run.
 *
 * Tenant scoping is enforced via .eq("tenant_id", ...). A cross-tenant
 * lookup fails closed (returns notFound), never returns wrong-tenant data.
 *
 * @param reportId - UUID of the manager_reports row.
 * @returns
 *   - { success: true, report } when found,
 *   - { success: false, notFound: true } when no such id for this tenant,
 *   - { success: false, error } on auth or DB failure.
 */
export async function getManagerReport(reportId: string): Promise<{
  success: boolean;
  report?: ManagerReportRow;
  notFound?: boolean;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { data, error } = await db
      .from("manager_reports")
      .select(
        "id, agent_run_id, window_start, window_end, agents_succeeded, agents_failed, drafts_sampled, drafts_flagged, has_critical_issues, cost_window_ils, cost_anomaly, recommendation_type, recommendation_target_agent, report, read_at, next_eligible_run_at, created_at"
      )
      .eq("tenant_id", tenant.tenantId)
      .eq("id", reportId)
      .maybeSingle();

    if (error) {
      console.error("[getManagerReport] DB error:", error);
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, notFound: true };
    }
    return { success: true, report: data as ManagerReportRow };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[getManagerReport] Error:", err);
    return { success: false, error: message };
  }
}
