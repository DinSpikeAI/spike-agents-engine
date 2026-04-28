/**
 * Spike Engine — Agent Runner (Mock Infrastructure)
 *
 * This is the SHARED runtime for all 9 agents.
 * Built once, used 9 times.
 *
 * ⚠️ DAY 3 STATUS: Mock implementation. Returns canned output.
 *    Day 4 will replace `mockExecute()` with `anthropic.messages.create()`.
 *
 * Uses ADMIN client (service_role) — bypasses RLS.
 * Rationale: agent_runs writes always come from server context
 * (server actions, schedulers, webhooks) — never from user JWT context.
 * In production this same flow runs via QStash/cron with service_role.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AgentId,
  RunInput,
  RunResult,
  RunStatus,
  MockBehavior,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// CORE: runAgent()
// ═══════════════════════════════════════════════════════════════

export async function runAgent<TOutput = unknown>(
  input: RunInput,
  mockBehavior?: MockBehavior
): Promise<RunResult<TOutput>> {
  const supabase = createAdminClient();
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();

  // ─── Step 1: Estimate cost ────────────────────────────────
  const costEstimateIls = estimateCost(input.agentId);

  // ─── Step 2: Insert agent_runs row (status='running') ─────
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
      is_mocked: true, // ⚠️ Day 3 only — flip to false in Day 4
    });

  if (insertError) {
    console.error("[runAgent] Failed to insert agent_runs row:", insertError);
    throw new Error(`DB insert failed: ${insertError.message}`);
  }

  // ─── Step 3: reserve_spend (MOCK — just log) ──────────────
  // Day 4: await supabase.rpc('reserve_spend', { ... })
  console.log(
    `[runAgent MOCK] Reserved ₪${costEstimateIls.toFixed(4)} for ${input.agentId} (run ${runId.slice(0, 8)})`
  );

  // ─── Step 4: Execute (MOCK in Day 3) ──────────────────────
  let output: TOutput | null = null;
  let status: RunStatus = "succeeded";
  let errorMessage: string | undefined;

  try {
    const result = await mockExecute<TOutput>(input.agentId, mockBehavior);
    output = result.output;
    status = result.status;
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[runAgent] Execution failed for ${input.agentId}:`, err);
  }

  // ─── Step 5: settle_spend (MOCK — just log) ───────────────
  const costActualIls =
    status === "succeeded" ? costEstimateIls * 0.85 : 0;
  console.log(
    `[runAgent MOCK] Settled ₪${costActualIls.toFixed(4)} for run ${runId.slice(0, 8)}`
  );

  // ─── Step 6: Update agent_runs row ────────────────────────
  // ⚠️ NOTE: DB column is 'error_message' (not 'error')
  const finishedAt = new Date().toISOString();
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

  // ─── Step 7: Return RunResult ─────────────────────────────
  return {
    runId,
    status,
    output,
    error: errorMessage,
    costEstimateIls,
    costActualIls,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    startedAt,
    finishedAt,
    isMocked: true,
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

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function estimateCost(agentId: AgentId): number {
  const estimates: Record<AgentId, number> = {
    morning: 0.05,
    reviews: 0.08,
    social: 0.12,
    manager: 0.25,
    watcher: 0.03,
    cleanup: 0.04,
    sales: 0.10,
    inventory: 0.06,
    hot_leads: 0.04,
  };
  return estimates[agentId] ?? 0.10;
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
