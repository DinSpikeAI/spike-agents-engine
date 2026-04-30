// src/lib/admin/queries.ts
//
// Day 11B — Admin Command Center data access.
//
// All exports are gated behind requireAdmin() — non-admin callers are
// redirected away before any DB query runs. We use the ADMIN client
// (service_role) intentionally because the whole point of these queries
// is to read across tenants — RLS would block them by design.
//
// Three exports:
//
//   1. listAllTenantsWithHealth()      — for the global health table
//   2. getRecentAgentRunsAcrossTenants — for the audit log viewer
//   3. getGlobalSpendStats             — for the top-of-page metrics
//
// All return shapes are precisely typed so the UI components can be
// strongly typed without any `any` slipping through.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./auth";

// ─────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────

export type RiskLevel = "at_risk" | "warning" | "healthy" | "unknown";

export interface AdminTenantRow {
  id: string;
  name: string;
  vertical: string;
  status: string;
  isActive: boolean;
  /** Spend in ILS — current monthly window */
  spendUsedIls: number;
  spendCapIls: number;
  spendReservedIls: number;
  /** 0..1, computed: (used + reserved) / cap. 0 if cap is 0. */
  utilization: number;
  /** 0..100, null if never computed */
  healthScore: number | null;
  /** When health was last computed; null if never */
  healthScoreCalculatedAt: string | null;
  /** Bucketed risk level derived from healthScore */
  riskLevel: RiskLevel;
  createdAt: string;
}

export interface AdminRunRow {
  runId: string;
  tenantId: string;
  tenantName: string;
  agentId: string;
  status: string;
  /** Actual cost in ILS; null if still running or never settled */
  costActualIls: number | null;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
}

export interface TopSpenderRow {
  tenantId: string;
  tenantName: string;
  spendUsedIls: number;
  spendCapIls: number;
  utilization: number;
}

export interface TopAtRiskRow {
  tenantId: string;
  tenantName: string;
  healthScore: number;
  riskLevel: RiskLevel;
}

export interface GlobalSpendStats {
  /** Sum of spend_cap_ils across all active tenants — max revenue if all hit cap */
  totalRevenuePotentialIls: number;
  /** Sum of spend_used_ils — actual Anthropic spend exposure this month */
  totalSpendThisMonthIls: number;
  /** 0..1 — how full are we on aggregate? */
  utilizationPercent: number;
  tenantCount: {
    total: number;
    active: number;
    inactive: number;
  };
  /** Tenants with health_score < 40 (excludes nulls) */
  atRiskCount: number;
  topSpenders: TopSpenderRow[];
  topAtRisk: TopAtRiskRow[];
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function classifyRisk(score: number | null): RiskLevel {
  if (score === null) return "unknown";
  if (score < 40) return "at_risk";
  if (score < 70) return "warning";
  return "healthy";
}

/** Lower numbers mean "more concerning" — for sort. */
function riskSortOrder(level: RiskLevel): number {
  switch (level) {
    case "at_risk":
      return 0;
    case "warning":
      return 1;
    case "unknown":
      return 2;
    case "healthy":
      return 3;
  }
}

function computeUtilization(used: number, reserved: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(1.5, (used + reserved) / cap); // cap display at 150% for visual sanity
}

// ─────────────────────────────────────────────────────────────
// 1. List all tenants with health
// ─────────────────────────────────────────────────────────────

/**
 * Returns every tenant in the system with full status information for
 * the global health table. Sorted: at_risk → warning → unknown → healthy.
 * Within each tier, highest utilization first (most likely to hit cap).
 */
export async function listAllTenantsWithHealth(): Promise<AdminTenantRow[]> {
  await requireAdmin();
  const db = createAdminClient();

  const { data, error } = await db
    .from("tenants")
    .select(
      `id, name, vertical, status, is_active,
       spend_used_ils, spend_cap_ils, spend_reserved_ils,
       health_score, health_score_calculated_at, created_at`
    )
    .order("name", { ascending: true });

  if (error) {
    console.error("[admin/queries] listAllTenantsWithHealth failed:", error);
    throw new Error(`Failed to load tenants: ${error.message}`);
  }

  const rows: AdminTenantRow[] = (data ?? []).map((t) => {
    const used = Number(t.spend_used_ils ?? 0);
    const reserved = Number(t.spend_reserved_ils ?? 0);
    const cap = Number(t.spend_cap_ils ?? 0);
    const score = t.health_score === null ? null : Number(t.health_score);

    return {
      id: t.id,
      name: t.name ?? "(ללא שם)",
      vertical: t.vertical ?? "general",
      status: t.status ?? "trial",
      isActive: !!t.is_active,
      spendUsedIls: used,
      spendCapIls: cap,
      spendReservedIls: reserved,
      utilization: computeUtilization(used, reserved, cap),
      healthScore: score,
      healthScoreCalculatedAt: t.health_score_calculated_at,
      riskLevel: classifyRisk(score),
      createdAt: t.created_at,
    };
  });

  // Sort: risk level first (descending concern), then utilization desc within tier
  rows.sort((a, b) => {
    const ra = riskSortOrder(a.riskLevel);
    const rb = riskSortOrder(b.riskLevel);
    if (ra !== rb) return ra - rb;
    return b.utilization - a.utilization;
  });

  return rows;
}

// ─────────────────────────────────────────────────────────────
// 2. Recent agent runs across tenants
// ─────────────────────────────────────────────────────────────

/**
 * Audit log feed for the Admin dashboard. Returns the most recent
 * agent runs across ALL tenants (not just one), with tenant name
 * resolved via JOIN.
 *
 * @param limit — defaults to 50, capped at 200
 */
export async function getRecentAgentRunsAcrossTenants(
  limit = 50
): Promise<AdminRunRow[]> {
  await requireAdmin();
  const db = createAdminClient();

  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200);

  // Supabase relational select — the foreign key from agent_runs.tenant_id
  // to tenants.id lets us fetch the tenant name in one round trip.
  const { data, error } = await db
    .from("agent_runs")
    .select(
      `id, tenant_id, agent_id, status, cost_actual_ils,
       started_at, finished_at, error_message,
       tenants:tenants!inner ( name )`
    )
    .order("started_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error(
      "[admin/queries] getRecentAgentRunsAcrossTenants failed:",
      error
    );
    throw new Error(`Failed to load runs: ${error.message}`);
  }

  return (data ?? []).map((r) => {
    // Supabase typed returns the joined relation as either an object or array
    // depending on cardinality. We handle both shapes defensively.
    const joined = r.tenants as { name: string | null } | { name: string | null }[] | null;
    let tenantName = "(לא ידוע)";
    if (joined) {
      if (Array.isArray(joined)) {
        tenantName = joined[0]?.name ?? "(לא ידוע)";
      } else {
        tenantName = joined.name ?? "(לא ידוע)";
      }
    }

    return {
      runId: r.id,
      tenantId: r.tenant_id,
      tenantName,
      agentId: r.agent_id,
      status: r.status,
      costActualIls: r.cost_actual_ils === null ? null : Number(r.cost_actual_ils),
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      errorMessage: r.error_message,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// 3. Global spend statistics
// ─────────────────────────────────────────────────────────────

/**
 * High-level metrics for the top of the Admin dashboard.
 * Computed in TypeScript from a single SELECT to avoid 5 round trips.
 */
export async function getGlobalSpendStats(): Promise<GlobalSpendStats> {
  await requireAdmin();
  const db = createAdminClient();

  const { data, error } = await db
    .from("tenants")
    .select(
      `id, name, is_active,
       spend_used_ils, spend_cap_ils, spend_reserved_ils,
       health_score`
    );

  if (error) {
    console.error("[admin/queries] getGlobalSpendStats failed:", error);
    throw new Error(`Failed to load global stats: ${error.message}`);
  }

  const all = data ?? [];
  const active = all.filter((t) => t.is_active === true);

  const totalRevenuePotentialIls = active.reduce(
    (sum, t) => sum + Number(t.spend_cap_ils ?? 0),
    0
  );
  const totalSpendThisMonthIls = active.reduce(
    (sum, t) => sum + Number(t.spend_used_ils ?? 0),
    0
  );
  const utilizationPercent =
    totalRevenuePotentialIls > 0
      ? totalSpendThisMonthIls / totalRevenuePotentialIls
      : 0;

  const atRiskCount = all.filter(
    (t) => t.health_score !== null && Number(t.health_score) < 40
  ).length;

  // Top 5 by absolute spend this month (active only — inactive don't matter)
  const topSpenders: TopSpenderRow[] = active
    .map((t) => {
      const used = Number(t.spend_used_ils ?? 0);
      const reserved = Number(t.spend_reserved_ils ?? 0);
      const cap = Number(t.spend_cap_ils ?? 0);
      return {
        tenantId: t.id,
        tenantName: t.name ?? "(ללא שם)",
        spendUsedIls: used,
        spendCapIls: cap,
        utilization: computeUtilization(used, reserved, cap),
      };
    })
    .sort((a, b) => b.spendUsedIls - a.spendUsedIls)
    .slice(0, 5);

  // Top 5 lowest health (only those with a score and below 40 — true at-risk)
  const topAtRisk: TopAtRiskRow[] = all
    .filter((t) => t.health_score !== null && Number(t.health_score) < 40)
    .map((t) => {
      const score = Number(t.health_score);
      return {
        tenantId: t.id,
        tenantName: t.name ?? "(ללא שם)",
        healthScore: score,
        riskLevel: classifyRisk(score),
      };
    })
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 5);

  return {
    totalRevenuePotentialIls,
    totalSpendThisMonthIls,
    utilizationPercent,
    tenantCount: {
      total: all.length,
      active: active.length,
      inactive: all.length - active.length,
    },
    atRiskCount,
    topSpenders,
    topAtRisk,
  };
}
