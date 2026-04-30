/**
 * Manager Agent — Day 10 + Day 11A spend cap + Day 11B health score
 *
 * Pipeline:
 *   1. Pre-flight spend cap check (Day 11A) — before doing any work
 *   2. Collect signals (agent_runs + drafts sample + hot_leads + tenant.config)
 *   3. Insert agent_runs row + reserve_spend RPC (Day 11A)
 *   4. Format into a prompt block
 *   5. Call Sonnet 4.6 with thinking_budget = 8000 + 5-section JSON schema
 *   6. settle_spend on success / refund_spend on failure (Day 11A)
 *   7. Persist the structured report to manager_reports
 *   8. Compute and persist customer health score (Day 11B)
 *   9. Return ManagerRunResult
 *
 * Notes:
 *   - This is the FIRST agent that uses thinking. Anthropic SDK API:
 *     thinking: { type: "enabled", budget_tokens: 8000 }
 *   - With thinking, max_tokens MUST be greater than budget_tokens.
 *     We use 12000: 8000 thinking + 4000 output budget.
 *   - With thinking, Sonnet returns content with thinking blocks first,
 *     then text/JSON. We extract the JSON from the text blocks.
 *   - We do NOT use runAgent() wrapper here because the Manager has
 *     unique cost-tracking needs (thinking tokens are billed separately).
 *     Instead we call anthropic directly and write to agent_runs ourselves.
 *     Day 11A: We replicate the runAgent spend-cap pattern manually here.
 *   - Day 11B: After a successful run, we recompute the customer health
 *     score so the Admin dashboard always sees fresh-as-of-this-week data.
 */

import { anthropic } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { MANAGER_AGENT_OUTPUT_SCHEMA } from "./schema";
import {
  MANAGER_AGENT_SYSTEM_PROMPT,
  buildManagerUserMessage,
  type ManagerPromptContext,
} from "./prompt";
import { collectSignals, formatSignalsForPrompt } from "./data-collector";
import {
  assertWithinSpendCap,
  estimateAgentRunCostIls,
} from "@/lib/quotas/check-cap";
import { computeAndPersistHealthScore } from "@/lib/health/score";
import type { ManagerAgentOutput, RunResult } from "../types";
import { randomUUID } from "node:crypto";

const MODEL = "claude-sonnet-4-6" as const;
const THINKING_BUDGET = 8000;
// max_tokens MUST be greater than thinking.budget_tokens.
// 12000 = 8000 thinking + ~4000 for the JSON output.
const MAX_TOKENS = 16000;

export interface ManagerRunResult extends RunResult<ManagerAgentOutput> {
  reportId: string | null;
}

export async function runManagerAgent(
  tenantId: string,
  triggerSource: "manual" | "scheduled" | "webhook" = "manual",
  windowDays = 7
): Promise<ManagerRunResult> {
  const db = createAdminClient();
  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  // ─── Step 1: Pre-flight spend cap check (Day 11A) ────────
  // Manager is the most expensive agent (~₪0.50 with thinking).
  // Block early if tenant can't afford the run.
  const costEstimateIls = estimateAgentRunCostIls("manager");
  const capCheck = await assertWithinSpendCap(tenantId, costEstimateIls);

  if (!capCheck.allowed) {
    console.log(
      `[manager] Blocked by spend cap (${capCheck.reason}) for tenant ${tenantId.slice(0, 8)}`
    );
    // Write a failed row so the Admin dashboard can see what happened.
    const finishedAt = new Date().toISOString();
    await db.from("agent_runs").insert({
      id: runId,
      tenant_id: tenantId,
      agent_id: "manager",
      status: "failed",
      started_at: startedAt,
      finished_at: finishedAt,
      trigger_source: triggerSource,
      model_used: MODEL,
      thinking_used: false,
      cost_estimate_ils: costEstimateIls,
      cost_actual_ils: 0,
      error_message: `Blocked: ${capCheck.reason} — ${capCheck.messageHe}`,
      is_mocked: false,
    });

    return {
      runId,
      status: "failed",
      output: null,
      error: capCheck.messageHe,
      costEstimateIls,
      costActualIls: 0,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      startedAt,
      finishedAt,
      isMocked: false,
      reportId: null,
    };
  }

  // ─── Step 2: Insert agent_runs row (status=running) ──────
  await db.from("agent_runs").insert({
    id: runId,
    tenant_id: tenantId,
    agent_id: "manager",
    status: "running",
    started_at: startedAt,
    trigger_source: triggerSource,
    model_used: MODEL,
    thinking_used: true,
    cost_estimate_ils: costEstimateIls,
    is_mocked: false,
  });

  // ─── Step 3: reserve_spend RPC (Day 11A) ─────────────────
  const { data: reserveOk, error: reserveError } = await db.rpc(
    "reserve_spend",
    {
      p_tenant_id: tenantId,
      p_agent_run_id: runId,
      p_agent_id: "manager",
      p_estimate_ils: costEstimateIls,
    }
  );

  if (reserveError || reserveOk === false) {
    console.error(
      `[manager] reserve_spend failed for run ${runId.slice(0, 8)}:`,
      reserveError ?? "RPC returned FALSE"
    );
    const finishedAt = new Date().toISOString();
    await db
      .from("agent_runs")
      .update({
        status: "failed",
        finished_at: finishedAt,
        error_message:
          reserveError?.message ?? "Spend reservation failed (cap exceeded)",
        cost_actual_ils: 0,
      })
      .eq("id", runId);

    return {
      runId,
      status: "failed",
      output: null,
      error:
        "המכסה החודשית התמלאה ברגע זה. נסה שוב בעוד מספר דקות, או המתן ל-1 לחודש הבא.",
      costEstimateIls,
      costActualIls: 0,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      startedAt,
      finishedAt,
      isMocked: false,
      reportId: null,
    };
  }

  try {
    // ─── Step 4: Collect signals ───────────────────────────
    const signals = await collectSignals(tenantId, windowDays);
    const promptCtx: ManagerPromptContext = {
      tenantName: signals.tenantInfo.name,
      windowStart: signals.windowStart,
      windowEnd: signals.windowEnd,
      brandVoiceSamples: signals.tenantInfo.brandVoiceSamples,
    };
    const signalsBlock = formatSignalsForPrompt(signals);

    // ─── Step 5: Call Sonnet 4.6 with thinking ─────────────
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: {
        type: "enabled",
        budget_tokens: THINKING_BUDGET,
      },
      system: [
        {
          type: "text",
          text: MANAGER_AGENT_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: [
        {
          role: "user",
          content: buildManagerUserMessage(promptCtx, signalsBlock),
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: MANAGER_AGENT_OUTPUT_SCHEMA,
        },
      },
    });

    // Extract JSON from text blocks (thinking blocks are separate, not parsed)
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    if (!text) {
      throw new Error("Manager response had no text block (only thinking).");
    }

    const parsed = JSON.parse(text) as ManagerAgentOutput;

    // ─── Step 6: Cost calculation ──────────────────────────
    // Sonnet 4.6 pricing (Apr 2026): $3/M input, $15/M output
    // Thinking tokens count as output tokens.
    const usage = response.usage as {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    const inputTokens = usage.input_tokens;
    const outputTokens = usage.output_tokens;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheCreation = usage.cache_creation_input_tokens ?? 0;

    // Pricing per million tokens (USD)
    const COST_INPUT_USD = 3.0 / 1_000_000;
    const COST_OUTPUT_USD = 15.0 / 1_000_000;
    const COST_CACHE_READ_USD = 0.3 / 1_000_000; // 90% off
    const COST_CACHE_WRITE_USD = 3.75 / 1_000_000; // 25% premium

    const costUsd =
      inputTokens * COST_INPUT_USD +
      outputTokens * COST_OUTPUT_USD +
      cacheRead * COST_CACHE_READ_USD +
      cacheCreation * COST_CACHE_WRITE_USD;
    const ILS_PER_USD = 3.7;
    const costIls = costUsd * ILS_PER_USD;

    const finishedAt = new Date().toISOString();

    // ─── Step 7: settle_spend RPC (Day 11A) ────────────────
    // Manager already has the token counts — pass them all for clean ledger.
    const { error: settleError } = await db.rpc("settle_spend", {
      p_agent_run_id: runId,
      p_actual_ils: costIls,
      p_model: MODEL,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_cache_read_tokens: cacheRead,
      p_cache_create_5m_tokens: 0, // not currently tracked separately
      p_cache_create_1h_tokens: cacheCreation,
      p_metadata: null,
    });
    if (settleError) {
      console.error(
        `[manager] settle_spend failed for ${runId.slice(0, 8)}:`,
        settleError
      );
    }

    // ─── Step 8: Update agent_runs row ─────────────────────
    await db
      .from("agent_runs")
      .update({
        status: "succeeded",
        finished_at: finishedAt,
        output: parsed as object,
        usage: usage as object,
        cost_actual_ils: costIls,
      })
      .eq("id", runId);

    // ─── Step 9: Persist to manager_reports table ──────────
    const recommendationType = parsed.recommendation.type;
    const recommendationTarget = parsed.recommendation.targetAgent;

    const { data: insertedReport, error: insertError } = await db
      .from("manager_reports")
      .insert({
        tenant_id: tenantId,
        agent_run_id: runId,
        window_start: signals.windowStart,
        window_end: signals.windowEnd,
        agents_succeeded: parsed.status_summary.totalSucceeded,
        agents_failed: parsed.status_summary.totalFailed,
        drafts_sampled: parsed.quality_findings.draftsSampled,
        drafts_flagged: parsed.quality_findings.findings.length,
        has_critical_issues: parsed.hasCriticalIssues,
        cost_window_ils: parsed.system_health.costWindowIls,
        cost_anomaly: parsed.system_health.costAnomalyDetected,
        recommendation_type: recommendationType,
        recommendation_target_agent: recommendationTarget,
        report: parsed as object,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[manager] Failed to persist report:", insertError);
    }

    // ─── Step 10: Compute health score (Day 11B) ───────────
    // Best-effort: failure here MUST NOT fail the Manager run.
    // The score is a bonus; the Manager's primary job is the report.
    try {
      const healthResult = await computeAndPersistHealthScore(tenantId);
      console.log(
        `[manager] Health score for ${tenantId.slice(0, 8)}: ${healthResult.score} (${healthResult.riskLevel})`
      );
    } catch (healthErr) {
      console.error(
        `[manager] Health score computation failed for ${tenantId.slice(0, 8)} (non-fatal):`,
        healthErr
      );
    }

    return {
      runId,
      status: "succeeded",
      output: parsed,
      costEstimateIls,
      costActualIls: costIls,
      inputTokens,
      outputTokens,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheCreation,
      startedAt,
      finishedAt,
      isMocked: false,
      reportId: insertedReport?.id ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[manager] Run failed:", err);

    const finishedAt = new Date().toISOString();

    // ─── Refund the reservation on failure (Day 11A) ───────
    const { error: refundError } = await db.rpc("refund_spend", {
      p_agent_run_id: runId,
      p_reason: message,
    });
    if (refundError) {
      console.error(
        `[manager] refund_spend failed for ${runId.slice(0, 8)}:`,
        refundError
      );
    }

    await db
      .from("agent_runs")
      .update({
        status: "failed",
        finished_at: finishedAt,
        error_message: message,
        cost_actual_ils: 0,
      })
      .eq("id", runId);

    return {
      runId,
      status: "failed",
      output: null,
      error: message,
      costEstimateIls,
      costActualIls: 0,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      startedAt,
      finishedAt,
      isMocked: false,
      reportId: null,
    };
  }
}
