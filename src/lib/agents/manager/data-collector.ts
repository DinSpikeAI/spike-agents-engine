/**
 * Manager Agent — data collector.
 *
 * Pulls signals from the DB and formats them into a structured prompt
 * block that the Manager LLM can reason over.
 *
 * What we collect (per tenant, in window):
 *   - agent_runs: status, agent_id, cost_actual_ils, error_message, started_at
 *   - drafts: id, agent_id, type, status, defamation_risk, content (sampled)
 *   - hot_leads: bucket, status, received_at, contacted_at
 *   - tenants.config.brand_voice_samples
 *
 * Sampling strategy for drafts:
 *   - Max 10 sampled drafts per run (cost control + LLM context limits)
 *   - Weighted toward defamation_risk='medium' (gray area) and pending status
 *   - Weighted toward most recent
 *
 * Performance Note: This runs once per Manager invocation. We use Promise.all
 * for the 3 parallel queries (drafts / agent_runs / hot_leads) — saves ~150ms
 * vs sequential. Acceptable since this is on a 7-day window read.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentId, LeadBucket } from "../types";

export interface CollectedSignals {
  windowStart: string;
  windowEnd: string;

  // For prompt block
  agentRunsSummary: AgentRunsSummary;
  draftsSample: SampledDraft[];
  leadsSummary: LeadsSummary;
  tenantInfo: TenantInfo;
}

export interface AgentRunsSummary {
  /** Per-agent stats: total runs, failures, total cost. */
  perAgent: Array<{
    agentId: AgentId;
    runCount: number;
    successCount: number;
    failureCount: number;
    totalCostIls: number;
    avgInputTokens: number;
    avgOutputTokens: number;
    lastError: string | null;
    lastRunAt: string | null;
  }>;
  /** Sum across all agents in window. */
  totalRuns: number;
  totalSuccess: number;
  totalFailures: number;
  totalCostIls: number;
}

export interface SampledDraft {
  id: string;
  agentId: string;
  type: string;
  status: string;
  defamationRisk: "low" | "medium" | "high" | null;
  /** Truncated to first 500 chars to keep prompt size sane. */
  contentExcerpt: string;
  recipientLabel: string | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  /** Minutes from creation to approval (or null if not yet approved). */
  timeToApprovalMinutes: number | null;
}

export interface LeadsSummary {
  /** Counts per bucket. */
  bucketCounts: Record<LeadBucket | "unclassified", number>;
  /** Blazing leads not contacted within 24h — critical signal. */
  staleBlazingLeads: Array<{
    id: string;
    receivedAt: string;
    ageMinutes: number;
  }>;
  totalLeads: number;
}

export interface TenantInfo {
  name: string;
  brandVoiceSamples: string[];
  vertical: string;
  consentStatus: string;
  dpaAccepted: boolean;
}

// ─────────────────────────────────────────────────────────────
// Loader
// ─────────────────────────────────────────────────────────────

export async function collectSignals(
  tenantId: string,
  windowDays = 7
): Promise<CollectedSignals> {
  const db = createAdminClient();
  const windowEnd = new Date();
  const windowStart = new Date(
    windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000
  );

  // Performance: 4 parallel queries
  const [tenantResult, runsResult, draftsResult, leadsResult] = await Promise.all([
    db
      .from("tenants")
      .select("name, config, vertical, consent_status, dpa_accepted_at")
      .eq("id", tenantId)
      .single(),

    db
      .from("agent_runs")
      .select(
        "id, agent_id, status, cost_actual_ils, error_message, started_at, finished_at, usage"
      )
      .eq("tenant_id", tenantId)
      .gte("started_at", windowStart.toISOString())
      .order("started_at", { ascending: false })
      .limit(500),

    db
      .from("drafts")
      .select(
        "id, agent_id, type, status, defamation_risk, content, recipient_label, created_at, approved_at, rejected_at"
      )
      .eq("tenant_id", tenantId)
      .gte("created_at", windowStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(200),

    db
      .from("hot_leads")
      .select("id, bucket, status, received_at, contacted_at")
      .eq("tenant_id", tenantId)
      .gte("received_at", windowStart.toISOString())
      .order("received_at", { ascending: false })
      .limit(500),
  ]);

  // ─── Tenant info ─────────────────────────────────────────
  if (tenantResult.error || !tenantResult.data) {
    throw new Error(`Tenant ${tenantId} not found: ${tenantResult.error?.message}`);
  }
  const tenant = tenantResult.data;
  const tenantConfig = (tenant.config as Record<string, unknown> | null) ?? {};
  const brandVoiceSamples = Array.isArray(tenantConfig.brand_voice_samples)
    ? (tenantConfig.brand_voice_samples as string[])
    : [];

  // ─── Agent runs aggregation ──────────────────────────────
  const runs = runsResult.data ?? [];
  const perAgentMap = new Map<AgentId, AgentRunsSummary["perAgent"][number]>();

  for (const run of runs) {
    const agentId = run.agent_id as AgentId;
    let entry = perAgentMap.get(agentId);
    if (!entry) {
      entry = {
        agentId,
        runCount: 0,
        successCount: 0,
        failureCount: 0,
        totalCostIls: 0,
        avgInputTokens: 0,
        avgOutputTokens: 0,
        lastError: null,
        lastRunAt: null,
      };
      perAgentMap.set(agentId, entry);
    }
    entry.runCount++;
    if (run.status === "succeeded") entry.successCount++;
    if (run.status === "failed") {
      entry.failureCount++;
      if (!entry.lastError && run.error_message) {
        entry.lastError = run.error_message;
      }
    }
    entry.totalCostIls += Number(run.cost_actual_ils ?? 0);

    const usage = (run.usage as Record<string, unknown> | null) ?? {};
    entry.avgInputTokens += Number(usage.input_tokens ?? 0);
    entry.avgOutputTokens += Number(usage.output_tokens ?? 0);

    if (!entry.lastRunAt && run.started_at) entry.lastRunAt = run.started_at;
  }

  // Compute averages
  const perAgent = Array.from(perAgentMap.values()).map((e) => ({
    ...e,
    avgInputTokens: e.runCount > 0 ? Math.round(e.avgInputTokens / e.runCount) : 0,
    avgOutputTokens:
      e.runCount > 0 ? Math.round(e.avgOutputTokens / e.runCount) : 0,
  }));

  const totalCostIls = runs.reduce(
    (sum, r) => sum + Number(r.cost_actual_ils ?? 0),
    0
  );

  const agentRunsSummary: AgentRunsSummary = {
    perAgent,
    totalRuns: runs.length,
    totalSuccess: runs.filter((r) => r.status === "succeeded").length,
    totalFailures: runs.filter((r) => r.status === "failed").length,
    totalCostIls,
  };

  // ─── Drafts sampling (max 10) ────────────────────────────
  const allDrafts = draftsResult.data ?? [];

  // Score each draft for sampling priority:
  //   medium defamation_risk → +3 (gray area, most worth checking)
  //   pending status → +2 (drafts that owner hasn't decided yet)
  //   high defamation_risk → +1 (already flagged, but worth confirming)
  //   recent (last 48h) → +1
  type ScoredDraft = (typeof allDrafts)[number] & { _score: number };
  const scored: ScoredDraft[] = allDrafts.map((d) => {
    let score = 0;
    if (d.defamation_risk === "medium") score += 3;
    if (d.status === "pending") score += 2;
    if (d.defamation_risk === "high") score += 1;
    const age = Date.now() - new Date(d.created_at as string).getTime();
    if (age < 48 * 60 * 60 * 1000) score += 1;
    score += Math.random() * 0.5; // small random nudge to avoid deterministic same-10
    return { ...d, _score: score };
  });
  scored.sort((a, b) => b._score - a._score);

  const draftsSample: SampledDraft[] = scored.slice(0, 10).map((d) => {
    const contentStr =
      typeof d.content === "string"
        ? d.content
        : JSON.stringify(d.content ?? {}).slice(0, 500);
    const timeToApprovalMinutes =
      d.approved_at && d.created_at
        ? Math.round(
            (new Date(d.approved_at as string).getTime() -
              new Date(d.created_at as string).getTime()) /
              (60 * 1000)
          )
        : null;

    return {
      id: d.id as string,
      agentId: d.agent_id as string,
      type: d.type as string,
      status: d.status as string,
      defamationRisk: d.defamation_risk as "low" | "medium" | "high" | null,
      contentExcerpt: contentStr.slice(0, 500),
      recipientLabel: (d.recipient_label as string | null) ?? null,
      createdAt: d.created_at as string,
      approvedAt: (d.approved_at as string | null) ?? null,
      rejectedAt: (d.rejected_at as string | null) ?? null,
      timeToApprovalMinutes,
    };
  });

  // ─── Leads summary ───────────────────────────────────────
  const leads = leadsResult.data ?? [];
  const bucketCounts: LeadsSummary["bucketCounts"] = {
    cold: 0,
    warm: 0,
    hot: 0,
    blazing: 0,
    spam_or_unclear: 0,
    unclassified: 0,
  };
  const staleBlazingLeads: LeadsSummary["staleBlazingLeads"] = [];
  const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

  for (const lead of leads) {
    const bucket = (lead.bucket as LeadBucket | null) ?? "unclassified";
    bucketCounts[bucket as keyof typeof bucketCounts]++;

    if (
      lead.bucket === "blazing" &&
      !lead.contacted_at &&
      Date.now() - new Date(lead.received_at as string).getTime() >
        STALE_THRESHOLD_MS
    ) {
      staleBlazingLeads.push({
        id: lead.id as string,
        receivedAt: lead.received_at as string,
        ageMinutes: Math.round(
          (Date.now() - new Date(lead.received_at as string).getTime()) /
            (60 * 1000)
        ),
      });
    }
  }

  const leadsSummary: LeadsSummary = {
    bucketCounts,
    staleBlazingLeads,
    totalLeads: leads.length,
  };

  // ─── Tenant info ─────────────────────────────────────────
  const tenantInfo: TenantInfo = {
    name: (tenant.name as string) ?? "העסק",
    brandVoiceSamples,
    vertical: (tenant.vertical as string) ?? "general",
    consentStatus: (tenant.consent_status as string) ?? "pending",
    dpaAccepted: !!tenant.dpa_accepted_at,
  };

  return {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    agentRunsSummary,
    draftsSample,
    leadsSummary,
    tenantInfo,
  };
}

// ─────────────────────────────────────────────────────────────
// Format signals into the prompt block
// ─────────────────────────────────────────────────────────────
//
// The format must be readable by the Manager LLM and compact enough
// to fit comfortably with the system prompt + thinking budget.

export function formatSignalsForPrompt(signals: CollectedSignals): string {
  const blocks: string[] = [];

  // Agent runs
  blocks.push("== ריצות סוכנים ==");
  blocks.push(
    `סך הכל: ${signals.agentRunsSummary.totalRuns} ריצות (${signals.agentRunsSummary.totalSuccess} הצליחו, ${signals.agentRunsSummary.totalFailures} נכשלו)`
  );
  blocks.push(
    `עלות כוללת בחלון: ₪${signals.agentRunsSummary.totalCostIls.toFixed(3)}`
  );
  blocks.push("");

  if (signals.agentRunsSummary.perAgent.length === 0) {
    blocks.push("(אף סוכן לא רץ בחלון הזה)");
  } else {
    blocks.push("פירוט לפי סוכן:");
    for (const a of signals.agentRunsSummary.perAgent) {
      const lastErrorPart = a.lastError ? ` | שגיאה אחרונה: ${a.lastError.slice(0, 120)}` : "";
      blocks.push(
        `  • ${a.agentId}: ${a.successCount}/${a.runCount} הצליחו, עלות ₪${a.totalCostIls.toFixed(3)}, טוקנים ממוצעים ${a.avgInputTokens}→${a.avgOutputTokens}${lastErrorPart}`
      );
    }
  }

  // Drafts sample
  blocks.push("");
  blocks.push("== מדגם טיוטות (עד 10) ==");
  if (signals.draftsSample.length === 0) {
    blocks.push("(אין טיוטות בחלון)");
  } else {
    for (const d of signals.draftsSample) {
      const ttaPart =
        d.timeToApprovalMinutes !== null
          ? ` | אושר אחרי ${d.timeToApprovalMinutes} דק׳`
          : d.status === "pending"
          ? " | ממתין לאישור"
          : d.status === "rejected"
          ? " | נדחה"
          : "";
      blocks.push(
        `  • [${d.id.slice(0, 8)}] ${d.agentId}/${d.type} | ${d.status} | סיכון דיבה: ${d.defamationRisk ?? "לא ידוע"}${ttaPart}`
      );
      blocks.push(`    תוכן: ${d.contentExcerpt.slice(0, 300).replace(/\s+/g, " ")}`);
    }
  }

  // Leads
  blocks.push("");
  blocks.push("== לידים בחלון ==");
  blocks.push(`סך הכל: ${signals.leadsSummary.totalLeads}`);
  const counts = signals.leadsSummary.bucketCounts;
  blocks.push(
    `התפלגות: bowing=${counts.blazing}, hot=${counts.hot}, warm=${counts.warm}, cold=${counts.cold}, spam=${counts.spam_or_unclear}, unclassified=${counts.unclassified}`
  );
  if (signals.leadsSummary.staleBlazingLeads.length > 0) {
    blocks.push(
      `⚠️ לידים בוערים שלא נוצרה איתם פעולה תוך 24h: ${signals.leadsSummary.staleBlazingLeads.length}`
    );
    for (const sl of signals.leadsSummary.staleBlazingLeads.slice(0, 5)) {
      blocks.push(`  • ליד ${sl.id.slice(0, 8)} ממתין ${sl.ageMinutes} דק׳`);
    }
  }

  return blocks.join("\n");
}
