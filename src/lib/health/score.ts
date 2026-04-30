// src/lib/health/score.ts
//
// Day 11B — Customer Health Score computation.
//
// Based on the Day-11 research report's 6 churn signals:
//   1. Manager engagement (25%) — does the owner read the weekly Manager Report?
//   2. Approval rate (25%)      — are drafts being approved or ignored?
//   3. Hot Leads quality (15%)  — are leads being qualified as hot/warm?
//   4. Cap utilization (10%)    — sweet spot 40-80%; very low = disengaged, very high = cap risk
//   5. Login frequency (15%)    — distinct activity days last 7 days (proxy via agent_runs)
//   6. Tenure bonus (10%)       — newer tenants haven't had time to fail yet
//
// All signals return 0..100. Final score is a weighted average rounded to an integer.
//
// This module does NOT call Anthropic. It runs pure SQL aggregations.
// Cost per computation: ~5 small queries on indexed columns. Cheap.
//
// Used by:
//   - Manager Agent (after each weekly run, updates tenants.health_score)
//   - Admin dashboard (when displaying at-risk tenants)
//   - Future: alert system to flag dropping scores

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type RiskLevel = "at_risk" | "warning" | "healthy";

export interface SignalScore {
  /** 0..100, raw signal value before weighting */
  score: number;
  /** Human-readable explanation of why the score is what it is */
  explanation: string;
  /** Raw data behind the signal — useful for Admin UI tooltips */
  raw: Record<string, unknown>;
}

export interface HealthScoreResult {
  /** Final weighted score 0..100, integer */
  score: number;
  /** Risk classification based on score */
  riskLevel: RiskLevel;
  /** When this computation ran */
  computedAt: string;
  /** Per-signal breakdown — for transparency and Admin tooltips */
  signals: {
    managerEngagement: SignalScore;
    approvalRate: SignalScore;
    hotLeadsQuality: SignalScore;
    capUtilization: SignalScore;
    loginFrequency: SignalScore;
    tenureBonus: SignalScore;
  };
}

const WEIGHTS = {
  managerEngagement: 0.25,
  approvalRate: 0.25,
  hotLeadsQuality: 0.15,
  capUtilization: 0.10,
  loginFrequency: 0.15,
  tenureBonus: 0.10,
} as const;

// Sanity check: weights must sum to 1.0
const WEIGHT_SUM = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(WEIGHT_SUM - 1.0) > 0.001) {
  throw new Error(`Health score weights sum to ${WEIGHT_SUM}, expected 1.0`);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compute the current health score for a tenant.
 *
 * Performs 5 small DB queries (one per signal that needs DB lookup).
 * Returns full breakdown so the caller can persist the score AND show
 * a tooltip explaining why it's what it is.
 */
export async function computeHealthScore(
  tenantId: string
): Promise<HealthScoreResult> {
  const db = createAdminClient();
  const now = Date.now();

  // ─── Signal 1: Manager engagement ─────────────────────────
  // Look at the most recent manager_report and check read_at vs created_at.
  const { data: latestReport } = await db
    .from("manager_reports")
    .select("created_at, read_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const managerEngagement: SignalScore = (() => {
    if (!latestReport) {
      return {
        score: 50,
        explanation: "אין דוחות מנהל עדיין — ציון ניטרלי",
        raw: { reportsCount: 0 },
      };
    }
    const createdAt = new Date(latestReport.created_at).getTime();
    const ageDays = (now - createdAt) / DAY_MS;
    const wasRead = latestReport.read_at !== null;

    if (wasRead) {
      const readAt = new Date(latestReport.read_at!).getTime();
      const daysToRead = (readAt - createdAt) / DAY_MS;
      if (daysToRead <= 7) {
        return {
          score: 100,
          explanation: `הדוח האחרון נקרא תוך ${Math.ceil(daysToRead)} ימים`,
          raw: { ageDays, daysToRead, wasRead: true },
        };
      }
      return {
        score: 70,
        explanation: `הדוח האחרון נקרא אחרי ${Math.ceil(daysToRead)} ימים`,
        raw: { ageDays, daysToRead, wasRead: true },
      };
    }

    // Not read yet
    if (ageDays > 14) {
      return {
        score: 0,
        explanation: `הדוח האחרון לא נקרא כבר ${Math.floor(ageDays)} ימים`,
        raw: { ageDays, wasRead: false },
      };
    }
    if (ageDays > 7) {
      return {
        score: 30,
        explanation: `הדוח האחרון ממתין לקריאה ${Math.floor(ageDays)} ימים`,
        raw: { ageDays, wasRead: false },
      };
    }
    return {
      score: 70,
      explanation: `הדוח האחרון נוצר לפני ${Math.floor(ageDays)} ימים`,
      raw: { ageDays, wasRead: false },
    };
  })();

  // ─── Signal 2: Approval rate (last 14 days) ───────────────
  const fourteenDaysAgo = new Date(now - 14 * DAY_MS).toISOString();
  const { data: drafts } = await db
    .from("drafts")
    .select("status")
    .eq("tenant_id", tenantId)
    .gte("created_at", fourteenDaysAgo);

  const approvalRate: SignalScore = (() => {
    const total = drafts?.length ?? 0;
    if (total === 0) {
      return {
        score: 50,
        explanation: "אין טיוטות ב-14 ימים אחרונים — ציון ניטרלי",
        raw: { total: 0 },
      };
    }
    const approved = drafts!.filter((d) => d.status === "approved").length;
    const rejected = drafts!.filter((d) => d.status === "rejected").length;
    // Decided drafts only (ignore pending — they haven't been judged yet)
    const decided = approved + rejected;
    if (decided === 0) {
      return {
        score: 50,
        explanation: `${total} טיוטות נמצאות במצב המתנה — אין מספיק החלטות לציון`,
        raw: { total, approved: 0, rejected: 0, pending: total },
      };
    }
    const ratio = approved / decided;
    let score: number;
    if (ratio >= 0.8) score = 100;
    else if (ratio >= 0.6) score = 70;
    else if (ratio >= 0.4) score = 40;
    else score = 0;

    return {
      score,
      explanation: `${approved}/${decided} טיוטות אושרו (${Math.round(ratio * 100)}%)`,
      raw: { total, approved, rejected, decided, ratio },
    };
  })();

  // ─── Signal 3: Hot Leads quality (last 30 days) ───────────
  const thirtyDaysAgo = new Date(now - 30 * DAY_MS).toISOString();
  const ninetyDaysAgo = new Date(now - 90 * DAY_MS).toISOString();
  const { data: recentLeads } = await db
    .from("hot_leads")
    .select("bucket")
    .eq("tenant_id", tenantId)
    .gte("created_at", thirtyDaysAgo);

  const hotLeadsQuality: SignalScore = await (async () => {
    if (!recentLeads || recentLeads.length === 0) {
      // Check if Hot Leads has been used at all in 90 days
      const { count: leadsIn90Days } = await db
        .from("hot_leads")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", ninetyDaysAgo);

      if ((leadsIn90Days ?? 0) === 0) {
        // Feature simply not in use — neutral, don't penalize
        return {
          score: 50,
          explanation: "סוכן Hot Leads לא בשימוש — ציון ניטרלי",
          raw: { leadsLast30Days: 0, leadsLast90Days: 0, featureInUse: false },
        };
      }
      // Used recently but zero in last 30 — bad signal
      return {
        score: 0,
        explanation: "0 לידים מוסמכים ב-30 ימים אחרונים",
        raw: { leadsLast30Days: 0, leadsLast90Days: leadsIn90Days, featureInUse: true },
      };
    }

    const qualified = recentLeads.filter(
      (l) => l.bucket === "hot" || l.bucket === "warm"
    ).length;

    let score: number;
    if (qualified >= 10) score = 100;
    else if (qualified >= 5) score = 70;
    else if (qualified >= 1) score = 40;
    else score = 0;

    return {
      score,
      explanation: `${qualified} לידים חמים/חמימים ב-30 ימים אחרונים`,
      raw: { leadsLast30Days: recentLeads.length, qualified, featureInUse: true },
    };
  })();

  // ─── Signal 4: Cap utilization ────────────────────────────
  const { data: tenantRow } = await db
    .from("tenants")
    .select("spend_cap_ils, spend_used_ils, created_at")
    .eq("id", tenantId)
    .single();

  const capUtilization: SignalScore = (() => {
    const cap = Number(tenantRow?.spend_cap_ils ?? 0);
    const used = Number(tenantRow?.spend_used_ils ?? 0);
    if (cap <= 0) {
      return {
        score: 50,
        explanation: "אין מכסה מוגדרת — ציון ניטרלי",
        raw: { cap, used, ratio: null },
      };
    }
    const ratio = used / cap;
    let score: number;
    let explanation: string;

    if (ratio >= 0.4 && ratio <= 0.8) {
      score = 100;
      explanation = `שימוש בריא: ${Math.round(ratio * 100)}% מהמכסה`;
    } else if ((ratio >= 0.2 && ratio < 0.4) || (ratio > 0.8 && ratio <= 0.95)) {
      score = 70;
      explanation = `שימוש סביר: ${Math.round(ratio * 100)}% מהמכסה`;
    } else if (ratio < 0.2) {
      score = 30;
      explanation = `שימוש נמוך מאוד: ${Math.round(ratio * 100)}% מהמכסה — חוסר engagement`;
    } else {
      // > 95%
      score = 20;
      explanation = `שימוש גבוה מאוד: ${Math.round(ratio * 100)}% מהמכסה — סיכון לחסימה`;
    }

    return {
      score,
      explanation,
      raw: { cap, used, ratio },
    };
  })();

  // ─── Signal 5: Login frequency (last 7 days) ──────────────
  // Proxy: distinct days with at least one agent_run.
  // Real product would track logins; for MVP, agent_runs is the strongest proxy.
  const sevenDaysAgo = new Date(now - 7 * DAY_MS).toISOString();
  const { data: recentRuns } = await db
    .from("agent_runs")
    .select("started_at")
    .eq("tenant_id", tenantId)
    .gte("started_at", sevenDaysAgo);

  const loginFrequency: SignalScore = (() => {
    const runs = recentRuns ?? [];
    const distinctDays = new Set(
      runs.map((r) => new Date(r.started_at).toISOString().slice(0, 10))
    );
    const dayCount = distinctDays.size;

    let score: number;
    if (dayCount >= 5) score = 100;
    else if (dayCount >= 3) score = 70;
    else if (dayCount >= 2) score = 40;
    else score = 0;

    return {
      score,
      explanation: `פעילות ב-${dayCount} ימים מתוך 7 האחרונים`,
      raw: { distinctDays: dayCount, totalRuns: runs.length },
    };
  })();

  // ─── Signal 6: Tenure bonus ───────────────────────────────
  const tenureBonus: SignalScore = (() => {
    if (!tenantRow?.created_at) {
      return {
        score: 50,
        explanation: "תאריך יצירה לא ידוע",
        raw: {},
      };
    }
    const createdAt = new Date(tenantRow.created_at).getTime();
    const ageDays = (now - createdAt) / DAY_MS;

    let score: number;
    if (ageDays >= 30) score = 100;
    else if (ageDays >= 14) score = 70;
    else if (ageDays >= 7) score = 40;
    else score = 0;

    return {
      score,
      explanation: `חשבון פעיל ${Math.floor(ageDays)} ימים`,
      raw: { ageDays },
    };
  })();

  // ─── Compute weighted final score ─────────────────────────
  const weighted =
    managerEngagement.score * WEIGHTS.managerEngagement +
    approvalRate.score * WEIGHTS.approvalRate +
    hotLeadsQuality.score * WEIGHTS.hotLeadsQuality +
    capUtilization.score * WEIGHTS.capUtilization +
    loginFrequency.score * WEIGHTS.loginFrequency +
    tenureBonus.score * WEIGHTS.tenureBonus;

  const finalScore = Math.round(Math.max(0, Math.min(100, weighted)));

  const riskLevel: RiskLevel =
    finalScore < 40 ? "at_risk" : finalScore < 70 ? "warning" : "healthy";

  return {
    score: finalScore,
    riskLevel,
    computedAt: new Date(now).toISOString(),
    signals: {
      managerEngagement,
      approvalRate,
      hotLeadsQuality,
      capUtilization,
      loginFrequency,
      tenureBonus,
    },
  };
}

/**
 * Persist a computed health score to tenants.health_score.
 * Separated so the caller can decide whether to compute-and-save or just read.
 */
export async function persistHealthScore(
  tenantId: string,
  result: HealthScoreResult
): Promise<void> {
  const db = createAdminClient();
  const { error } = await db
    .from("tenants")
    .update({
      health_score: result.score,
      health_score_calculated_at: result.computedAt,
    })
    .eq("id", tenantId);
  if (error) {
    console.error(`[persistHealthScore] failed for ${tenantId.slice(0, 8)}:`, error);
    throw new Error(`Failed to persist health score: ${error.message}`);
  }
}

/**
 * Convenience: compute + persist in one call.
 * Used by the Manager Agent after each weekly run.
 */
export async function computeAndPersistHealthScore(
  tenantId: string
): Promise<HealthScoreResult> {
  const result = await computeHealthScore(tenantId);
  await persistHealthScore(tenantId, result);
  return result;
}
