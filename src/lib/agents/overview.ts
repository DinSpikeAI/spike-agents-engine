// src/lib/agents/overview.ts
//
// Sub-stage 1.8 — Agents overview helpers.
// Sub-stage 1.15.2 — Added Growth to the overview. Growth has its OWN
// runs table (`growth_runs`, migration 023) separate from the shared
// `agent_runs`, so we issue a small extra query to fetch its activity
// and merge it into the result. The status enum on growth_runs includes
// 'partial' which we map to 'succeeded' for the UI status badge — the
// AgentOverview status type doesn't have a partial state, and partial
// means "some drafts succeeded" which is a positive outcome.
//
// Aggregates per-agent activity metrics for /dashboard/agents:
//   - lastRunAt: most recent run started_at
//   - lastStatus: succeeded / failed / running / no_op
//   - monthlyRunCount: count of non-mock runs this calendar month (IL TZ)
//
// Why no cost/quota: we deliberately don't show ₪ or % to users. Showing
// raw cost makes them think they're being charged per-run; showing %
// against a quota triggers either anxiety (near limit) or wasteful "use it
// or lose it" behavior. Raw activity counts let agents run when needed,
// not to "extract value." Discussion: 2026-05-04 session 6.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentId } from "./types";

export interface AgentOverview {
  agentId: AgentId;
  /** ISO timestamp of last run (any status), or null if never run. */
  lastRunAt: string | null;
  /** Status of the last run, or null if never run. */
  lastStatus: "succeeded" | "failed" | "running" | "no_op" | null;
  /** Count of non-mock runs in the current calendar month (IL TZ). */
  monthlyRunCount: number;
}

const ALL_AGENT_IDS: AgentId[] = [
  "morning",
  "watcher",
  "reviews",
  "hot_leads",
  "social",
  "manager",
  "sales",
  "inventory",
  "growth",
  // cleanup is intentionally NOT customer-facing per Iron Rule 1.1
];

/**
 * Get start of current calendar month in IL TZ as ISO string.
 * Used as the boundary for "monthly run count".
 */
function getMonthStartIsoIL(): string {
  // Get current date in IL TZ as YYYY-MM-DD
  const now = new Date();
  const ilFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayIlIso = ilFormatter.format(now); // e.g. "2026-05-04"
  const [year, month] = todayIlIso.split("-");
  // Construct "first of this month at 00:00:00 IL time" in ISO with offset.
  // IL is +03:00 in summer (DST), +02:00 in winter. We use +03:00 here as
  // a reasonable approximation; the boundary is approximate by design
  // (a run at exactly midnight on month boundary doesn't matter).
  return new Date(`${year}-${month}-01T00:00:00+03:00`).toISOString();
}

/**
 * Fetch overview for ALL 9 customer-facing agents at once.
 *
 * Implementation notes:
 *   - 8 of 9 agents (morning/watcher/reviews/hot_leads/social/manager/
 *     sales/inventory) write to the shared `agent_runs` table.
 *   - Growth (1.15) writes to its OWN `growth_runs` table — we issue
 *     2 extra small queries against it and merge into the same maps.
 *   - For tenants with very few runs this is cheap. For tenants with
 *     thousands of runs per month, the monthly count query becomes the
 *     bottleneck — we'd refactor to a database VIEW or RPC.
 *
 * Returns one entry per agent in ALL_AGENT_IDS, even if the agent has
 * never run (lastRunAt=null, monthlyRunCount=0). This guarantees the UI
 * always shows all 9 cards.
 */
export async function getAgentsOverview(
  tenantId: string
): Promise<AgentOverview[]> {
  const db = createAdminClient();
  const monthStart = getMonthStartIsoIL();

  // ─── Query 1: latest run per agent (this tenant) ───────────
  // We pull the latest 200 runs ordered descending — easily enough to
  // capture the latest of each of 8 agents even on a busy tenant.
  const { data: latestRuns, error: latestErr } = await db
    .from("agent_runs")
    .select("agent_id, started_at, status")
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: false })
    .limit(200);

  if (latestErr) {
    console.error("[overview] latest runs query failed:", latestErr);
  }

  // Group by agent_id, take first (most recent) entry per agent.
  const latestByAgent = new Map<
    string,
    { startedAt: string; status: AgentOverview["lastStatus"] }
  >();
  for (const row of latestRuns ?? []) {
    const agentId = row.agent_id as string;
    if (latestByAgent.has(agentId)) continue; // already have most recent
    latestByAgent.set(agentId, {
      startedAt: row.started_at as string,
      status: row.status as AgentOverview["lastStatus"],
    });
  }

  // ─── Query 2: monthly run counts per agent (this tenant) ───
  // We pull all runs since month start with non-mock filter, then JS-count.
  const { data: monthlyRuns, error: monthlyErr } = await db
    .from("agent_runs")
    .select("agent_id")
    .eq("tenant_id", tenantId)
    .gte("started_at", monthStart)
    .or("is_mocked.is.null,is_mocked.eq.false");

  if (monthlyErr) {
    console.error("[overview] monthly count query failed:", monthlyErr);
  }

  const monthlyCountByAgent = new Map<string, number>();
  for (const row of monthlyRuns ?? []) {
    const agentId = row.agent_id as string;
    monthlyCountByAgent.set(
      agentId,
      (monthlyCountByAgent.get(agentId) ?? 0) + 1
    );
  }

  // ─── Query 3+4: Growth lives in its OWN table (growth_runs) ───
  // Stage 1.15 introduced `growth_runs` separate from `agent_runs`. We
  // query it once for the latest run + once for monthly count, then merge
  // into the same maps so the rest of the function stays uniform.
  const { data: latestGrowthRun, error: growthLatestErr } = await db
    .from("growth_runs")
    .select("started_at, status")
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (growthLatestErr) {
    console.error("[overview] latest growth_runs query failed:", growthLatestErr);
  }

  if (latestGrowthRun) {
    // growth_runs.status union: 'running' | 'succeeded' | 'failed' | 'partial'
    // AgentOverview lastStatus has no 'partial' — map it to 'succeeded' since
    // partial means "some drafts landed", which is a positive outcome.
    const rawStatus = latestGrowthRun.status as string;
    const mappedStatus: AgentOverview["lastStatus"] =
      rawStatus === "partial"
        ? "succeeded"
        : (rawStatus as AgentOverview["lastStatus"]);
    latestByAgent.set("growth", {
      startedAt: latestGrowthRun.started_at as string,
      status: mappedStatus,
    });
  }

  const { data: monthlyGrowthRuns, error: growthMonthlyErr } = await db
    .from("growth_runs")
    .select("id")
    .eq("tenant_id", tenantId)
    .gte("started_at", monthStart);

  if (growthMonthlyErr) {
    console.error(
      "[overview] monthly growth_runs query failed:",
      growthMonthlyErr
    );
  }

  // growth_runs has no `is_mocked` column — every run is real.
  monthlyCountByAgent.set("growth", monthlyGrowthRuns?.length ?? 0);

  // ─── Build result for all 9 customer-facing agents ─────────
  return ALL_AGENT_IDS.map<AgentOverview>((agentId) => {
    const latest = latestByAgent.get(agentId);
    return {
      agentId,
      lastRunAt: latest?.startedAt ?? null,
      lastStatus: latest?.status ?? null,
      monthlyRunCount: monthlyCountByAgent.get(agentId) ?? 0,
    };
  });
}

/**
 * Format an ISO timestamp into a Hebrew "time ago" string for display.
 * Examples: "ממש עכשיו", "לפני 5 דק'", "לפני 3 שעות", "אתמול 14:30",
 *           "לפני 4 ימים", "12 במאי".
 *
 * Exported for use in agent-overview-card.tsx (client) and elsewhere.
 */
export function formatTimeAgoHe(iso: string | null): string {
  if (!iso) return "לא רץ עדיין";

  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "לא ידוע";

  const now = Date.now();
  const diffMs = now - ts;
  const diffMin = Math.round(diffMs / (60 * 1000));
  const diffHr = Math.round(diffMs / (60 * 60 * 1000));
  const diffDay = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (diffMin < 1) return "ממש עכשיו";
  if (diffMin < 60) return `לפני ${diffMin} דק׳`;
  if (diffHr < 24) return `לפני ${diffHr} ${diffHr === 1 ? "שעה" : "שעות"}`;
  if (diffDay === 1) {
    const time = new Date(ts).toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jerusalem",
    });
    return `אתמול ${time}`;
  }
  if (diffDay < 7) return `לפני ${diffDay} ימים`;
  return new Date(ts).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jerusalem",
  });
}
