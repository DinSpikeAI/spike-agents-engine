"use server";

// src/app/dashboard/actions/reports-kpis.ts
//
// Two related but distinct concerns, grouped because they're both
// read-only "dashboard data" loaders:
//
//   1. Manager reports — listing the historical reports the Manager
//      agent has produced. Used by /dashboard/manager (when implemented)
//      and the unread-report linker in the Manager card.
//
//   2. Dashboard KPIs — the 4 numbers shown in the KPI strip at the
//      top of /dashboard. Real data, not hardcoded.
//
// Exported:
//   - ManagerReportRow (interface)
//   - listManagerReports(limit?)
//   - DashboardKpis (interface)
//   - getDashboardKpis()

import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./_shared";

// ═════════════════════════════════════════════════════════════
// MANAGER REPORTS
// ═════════════════════════════════════════════════════════════

export interface ManagerReportRow {
  id: string;
  agent_run_id: string | null;
  window_start: string;
  window_end: string;
  agents_succeeded: number;
  agents_failed: number;
  drafts_sampled: number;
  drafts_flagged: number;
  has_critical_issues: boolean;
  cost_window_ils: number | null;
  cost_anomaly: boolean;
  recommendation_type: string | null;
  recommendation_target_agent: string | null;
  report: Record<string, unknown>;
  read_at: string | null;
  next_eligible_run_at: string | null;
  created_at: string;
}

/**
 * List Manager reports for the active tenant, newest first.
 * Default limit of 10 covers ~10 weeks of reports.
 */
export async function listManagerReports(
  limit = 10
): Promise<{
  success: boolean;
  reports?: ManagerReportRow[];
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
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[listManagerReports] DB error:", error);
      return { success: false, error: error.message };
    }
    return { success: true, reports: (data as ManagerReportRow[]) ?? [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

// ═════════════════════════════════════════════════════════════
// DASHBOARD KPIs
// ═════════════════════════════════════════════════════════════
//
// The 4 KPIs shown in the strip at the top of /dashboard.
// All sourced from the database — no hardcoded values.
//
//   1. pendingApprovals — drafts WHERE status='pending'
//   2. todaysActions    — drafts WHERE created_at >= today_start (Israel TZ)
//   3. monthlySpend     — tenants.spend_used_ils + spend_reserved_ils
//   4. monthlyCap       — tenants.spend_cap_ils
//
// Computed in a single round-trip via Promise.all to keep the dashboard
// fast (3 parallel queries instead of sequential).

export interface DashboardKpis {
  pendingApprovals: number;
  todaysActions: number;
  monthlySpend: number;
  monthlyCap: number;
}

export async function getDashboardKpis(): Promise<{
  success: boolean;
  kpis?: DashboardKpis;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();

    // Israel TZ midnight today (UTC+2/+3 with DST). We use a stable boundary:
    // local-day-start in Asia/Jerusalem expressed as UTC ISO.
    const now = new Date();
    const israelNow = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })
    );
    const israelMidnight = new Date(
      israelNow.getFullYear(),
      israelNow.getMonth(),
      israelNow.getDate(),
      0,
      0,
      0,
      0
    );
    // Convert local-Israel midnight back to UTC ISO. The trick: get the
    // diff between machine clock and Israel clock, apply it.
    const tzOffsetMs = now.getTime() - israelNow.getTime();
    const israelMidnightUtc = new Date(israelMidnight.getTime() + tzOffsetMs);

    const [pendingResult, todayResult, tenantResult] = await Promise.all([
      // 1. Pending drafts count
      db
        .from("drafts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.tenantId)
        .eq("status", "pending"),

      // 2. Drafts created since Israel midnight
      db
        .from("drafts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.tenantId)
        .gte("created_at", israelMidnightUtc.toISOString()),

      // 3. Spend snapshot
      db
        .from("tenants")
        .select("spend_cap_ils, spend_used_ils, spend_reserved_ils")
        .eq("id", tenant.tenantId)
        .single(),
    ]);

    if (pendingResult.error || todayResult.error || tenantResult.error) {
      const err =
        pendingResult.error?.message ??
        todayResult.error?.message ??
        tenantResult.error?.message ??
        "DB error";
      console.error("[getDashboardKpis] DB error:", err);
      return { success: false, error: err };
    }

    const usedIls = Number(tenantResult.data?.spend_used_ils ?? 0);
    const reservedIls = Number(tenantResult.data?.spend_reserved_ils ?? 0);
    const capIls = Number(tenantResult.data?.spend_cap_ils ?? 0);

    return {
      success: true,
      kpis: {
        pendingApprovals: pendingResult.count ?? 0,
        todaysActions: todayResult.count ?? 0,
        monthlySpend: usedIls + reservedIls,
        monthlyCap: capIls,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[getDashboardKpis] Error:", err);
    return { success: false, error: message };
  }
}
