/**
 * Manager Agent — Day 10
 *
 * Pipeline:
 *   1. Collect signals (agent_runs + drafts sample + hot_leads + tenant.config)
 *   2. Format into a prompt block
 *   3. Call Sonnet 4.6 with thinking_budget = 8000 + 5-section JSON schema
 *   4. Persist the structured report to manager_reports
 *   5. Return ManagerRunResult
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
import type { ManagerAgentOutput, RunResult } from "../types";
import { randomUUID } from "node:crypto";

const MODEL = "claude-sonnet-4-6" as const;
const THINKING_BUDGET = 8000;
// max_tokens MUST be greater than thinking.budget_tokens.
// 12000 = 8000 thinking + ~4000 for the JSON output.
const MAX_TOKENS = 12000;

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

  // ─── Insert agent_runs row (status=running) ──────────────
  await db.from("agent_runs").insert({
    id: runId,
    tenant_id: tenantId,
    agent_id: "manager",
    status: "running",
    started_at: startedAt,
    trigger_source: triggerSource,
    model_used: MODEL,
    thinking_used: true,
    is_mocked: false,
  });

  try {
    // ─── 1. Collect signals ────────────────────────────────
    const signals = await collectSignals(tenantId, windowDays);
    const promptCtx: ManagerPromptContext = {
      tenantName: signals.tenantInfo.name,
      windowStart: signals.windowStart,
      windowEnd: signals.windowEnd,
      brandVoiceSamples: signals.tenantInfo.brandVoiceSamples,
    };
    const signalsBlock = formatSignalsForPrompt(signals);

    // ─── 2. Call Sonnet 4.6 with thinking ──────────────────
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

    // ─── 3. Cost calculation ───────────────────────────────
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

    // ─── 4. Update agent_runs row ──────────────────────────
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

    // ─── 5. Persist to manager_reports table ───────────────
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

    return {
      runId,
      status: "succeeded",
      output: parsed,
      costEstimateIls: 0,
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

    await db
      .from("agent_runs")
      .update({
        status: "failed",
        finished_at: finishedAt,
        error_message: message,
      })
      .eq("id", runId);

    return {
      runId,
      status: "failed",
      output: null,
      error: message,
      costEstimateIls: 0,
      costActualIls: null,
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
