/**
 * Spike Engine — Agent Runner (shared infrastructure)
 *
 * This is the SHARED runtime for all 9 agents.
 * Built once, used 9 times.
 *
 * Day 5+ status: real Anthropic calls via injected `executor`.
 * Day 6+:        executor can return status: "no_op" for safe halt.
 * Day 11A+:      Real spend cap enforcement via Postgres RPCs.
 *                Pre-flight check via assertWithinSpendCap.
 *                reserve_spend → settle_spend on success / refund_spend on failure.
 *
 * Mock path remains for tests and `is_mocked: true` runs.
 *
 * Uses ADMIN client (service_role) — bypasses RLS.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { calculateCostIls } from "@/lib/anthropic-pricing";
import type { AnthropicUsageForCost } from "@/lib/anthropic-pricing";
import { assertWithinSpendCap, estimateAgentRunCostIls } from "@/lib/quotas/check-cap";
import type {
  AgentId,
  RunInput,
  RunResult,
  RunStatus,
  MockBehavior,
} from "./types";

// Executor type — injected by each agent with its real Anthropic call.
export type AgentExecutor<TOutput> = () => Promise<{
  output: TOutput;
  usage: AnthropicUsageForCost;
  status?: "succeeded" | "no_op";
}>;

// ═══════════════════════════════════════════════════════════════
// CORE: runAgent()
// ═══════════════════════════════════════════════════════════════

export async function runAgent<TOutput = unknown>(
  input: RunInput,
  mockBehavior?: MockBehavior,
  executor?: AgentExecutor<TOutput>
): Promise<RunResult<TOutput>> {
  const supabase = createAdminClient();
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();

  // ─── Step 1: Estimate cost (real per-agent estimates) ─────
  const costEstimateIls = estimateAgentRunCostIls(input.agentId);

  // ─── Step 2: Pre-flight spend cap check ───────────────────
  // Day 11A: BEFORE we insert anything to agent_runs, verify the tenant
  // can afford this run. If they can't, return a failed RunResult with
  // a Hebrew message — without polluting agent_runs with junk rows.
  const capCheck = await assertWithinSpendCap(input.tenantId, costEstimateIls);
  if (!capCheck.allowed) {
    console.log(
      `[runAgent] Blocked by spend cap (${capCheck.reason}) for tenant ${input.tenantId.slice(0, 8)}, agent ${input.agentId}`
    );
    // Still write a failed row so the dashboard can show what happened.
    await supabase.from("agent_runs").insert({
      id: runId,
      tenant_id: input.tenantId,
      agent_id: input.agentId,
      status: "failed" as RunStatus,
      trigger_source: input.triggerSource,
      cost_estimate_ils: costEstimateIls,
      cost_actual_ils: 0,
      error_message: `Blocked: ${capCheck.reason} — ${capCheck.messageHe}`,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      is_mocked: executor === undefined,
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
      finishedAt: new Date().toISOString(),
      isMocked: executor === undefined,
    };
  }

  // ─── Step 3: Insert agent_runs row (status='running') ─────
  const { error: insertError } = await supabase
    .from("agent_runs")
    .insert({
      id: runId,
      tenant_id: input.tenantId,
      agent_id: input.agentId,
      status: "running" as RunStatus,
      trigger_source: input.triggerSource,
      cost_estimate_ils: costEstimateIls,
      started_at: startedAt,
      is_mocked: executor === undefined,
    });

  if (insertError) {
    console.error("[runAgent] Failed to insert agent_runs row:", insertError);
    throw new Error(`DB insert failed: ${insertError.message}`);
  }

  // ─── Step 4: reserve_spend RPC ────────────────────────────
  // Real call now. Returns boolean — TRUE if reservation succeeded.
  // FALSE means another concurrent run grabbed the budget between our
  // check and reservation (race condition). Treat as cap exceeded.
  const { data: reserveOk, error: reserveError } = await supabase.rpc(
    "reserve_spend",
    {
      p_tenant_id: input.tenantId,
      p_agent_run_id: runId,
      p_agent_id: input.agentId,
      p_estimate_ils: costEstimateIls,
    }
  );

  if (reserveError || reserveOk === false) {
    console.error(
      `[runAgent] reserve_spend failed for run ${runId.slice(0, 8)}:`,
      reserveError ?? "RPC returned FALSE"
    );
    const finishedAt = new Date().toISOString();
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        error_message:
          reserveError?.message ?? "Spend reservation failed (cap exceeded)",
        finished_at: finishedAt,
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
      isMocked: executor === undefined,
    };
  }

  // ─── Step 5: Execute ──────────────────────────────────────
  let output: TOutput | null = null;
  let status: RunStatus = "succeeded";
  let errorMessage: string | undefined;
  let usage: AnthropicUsageForCost | undefined;

  try {
    if (executor) {
      const result = await executor();
      output = result.output;
      usage = result.usage;
      status = result.status ?? "succeeded";
    } else {
      const result = await mockExecute<TOutput>(input.agentId, mockBehavior);
      output = result.output;
      status = result.status;
    }
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[runAgent] Execution failed for ${input.agentId}:`, err);
  }

  // ─── Step 6: settle_spend OR refund_spend ─────────────────
  // Success/no_op → settle with actual cost (no_op still cost tokens)
  // Failed → refund the reservation
  const finishedAt = new Date().toISOString();

  if (status === "failed") {
    // Refund the entire reservation
    const { error: refundError } = await supabase.rpc("refund_spend", {
      p_agent_run_id: runId,
      p_reason: errorMessage ?? "execution failed",
    });
    if (refundError) {
      console.error(
        `[runAgent] refund_spend failed for ${runId.slice(0, 8)}:`,
        refundError
      );
    }
  } else {
    // Settle with actual costs
    const costActualIls = usage
      ? calculateCostIls(input.model, usage)
      : costEstimateIls * 0.85; // mock fallback
    const { error: settleError } = await supabase.rpc("settle_spend", {
      p_agent_run_id: runId,
      p_actual_ils: costActualIls,
      p_model: input.model,
      p_input_tokens: usage?.input_tokens ?? null,
      p_output_tokens: usage?.output_tokens ?? null,
      p_cache_read_tokens: usage?.cache_read_input_tokens ?? 0,
      p_cache_create_5m_tokens: 0, // not currently tracked separately
      p_cache_create_1h_tokens: usage?.cache_creation_input_tokens ?? 0,
      p_metadata: null,
    });
    if (settleError) {
      console.error(
        `[runAgent] settle_spend failed for ${runId.slice(0, 8)}:`,
        settleError
      );
    }
  }

  // ─── Step 7: Update agent_runs row ────────────────────────
  const costActualIls = (() => {
    if (status === "failed") return 0;
    if (usage) return calculateCostIls(input.model, usage);
    return costEstimateIls * 0.85;
  })();

  const { error: updateError } = await supabase
    .from("agent_runs")
    .update({
      status,
      output: output as object | null,
      error_message: errorMessage ?? null,
      cost_actual_ils: costActualIls,
      finished_at: finishedAt,
    })
    .eq("id", runId);

  if (updateError) {
    console.error("[runAgent] Failed to update agent_runs row:", updateError);
  }

  // ─── Step 8: Return RunResult ─────────────────────────────
  return {
    runId,
    status,
    output,
    error: errorMessage,
    costEstimateIls,
    costActualIls,
    inputTokens: usage?.input_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
    cacheReadTokens: usage?.cache_read_input_tokens ?? null,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? null,
    startedAt,
    finishedAt,
    isMocked: executor === undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// MOCK: mockExecute()
// ═══════════════════════════════════════════════════════════════

async function mockExecute<T>(
  agentId: AgentId,
  behavior?: MockBehavior
): Promise<{ output: T | null; status: RunStatus }> {
  const delay = behavior?.delayMs ?? 1000 + Math.random() * 1000;
  await new Promise((r) => setTimeout(r, delay));

  if (behavior?.forceStatus) {
    if (behavior.forceStatus === "failed") {
      throw new Error("Mock failure (forced for testing)");
    }
    if (behavior.forceStatus === "no_op") {
      return { output: null, status: "no_op" };
    }
  }

  const mockOutput = getMockOutput(agentId);
  return { output: mockOutput as T, status: "succeeded" };
}

function getMockOutput(agentId: AgentId): object {
  switch (agentId) {
    case "morning":
      return {
        greeting: "בוקר טוב, Din",
        headline: "יום שלישי 28 באפריל — שני אירועים דורשים את תשומת לבך הבוקר",
        yesterdayMetrics: {
          revenue: 4820,
          revenueChangePercent: 12,
          sameWeekdayCompare: "▲ 12% מיום שלישי שעבר",
        },
        thingsCompleted: [
          "12 ביקורות נענו (3 חיוביות, 9 ניטרליות)",
          "4 פוסטים פורסמו ב-Instagram + Facebook",
          "סוכן לידים זיהה 3 לקוחות פוטנציאליים",
        ],
        thingsNeedingApproval: 4,
        insights: [
          "ביקורת 1★ מיוסי לוי דורשת תגובה אישית — הסוכן הכין טיוטה",
          "5 לידים חמים בציון 90+ נכנסו אתמול בלילה — מומלץ לפנות עד 13:00",
          "מלאי המוצר #PT-204 עומד ל-3 ימים בלבד — להזמין השבוע",
        ],
        todaysSchedule: [
          "10:00 — פגישת מכירות (לידיה כהן)",
          "13:00 — שיחה עם ספק (ראם הפצה)",
          "16:30 — ביקור לקוח קבוע",
        ],
        callToAction: "פתח את תיבת האישורים (4 פריטים מחכים)",
      };

    case "reviews":
      return {
        summary: "טיוטת תגובה לביקורת 1★ מיוסי לוי הוכנה",
        draftText: "שלום יוסי, מצטערים מאוד שחוויית השירות שלך לא עמדה בציפיות...",
      };

    default:
      return {
        summary: `Mock output from ${agentId} agent`,
        timestamp: new Date().toISOString(),
      };
  }
}
