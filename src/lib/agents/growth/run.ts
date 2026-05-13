// src/lib/agents/growth/run.ts
//
// Growth Agent — orchestration entry point.
//
// Called by:
//   - Inngest cron (Sunday 07:00 IST) — trigger="cron"
//   - On-demand button server action (Pro tier) — trigger="on_demand"
//
// Flow:
//   1. Insert growth_runs row (status='running')
//   2. Load tenant context for prompts (including Sprint 3I business_brief)
//   3. Gather candidates from internal interactions + Meta inbox
//   4. Haiku scan → top scored
//   5. For each top-N: build draft context, run Sonnet (concurrency 5)
//   6. Persist drafted candidates to growth_candidates
//   7. Update growth_runs with metrics + final status
//   8. (Sprint 1C) Send WhatsApp digest to owner
//
// Status semantics:
//   succeeded — all top-scored candidates produced drafts (or no candidates found)
//   partial   — some drafts failed, but >=1 drafted candidate was persisted
//   failed    — fatal error before/during/after drafting
//
// Error policy:
//   Per-candidate draft failures are CAUGHT and logged, not thrown — we'd
//   rather ship 13 of 15 drafts than zero. Fatal errors (DB unavailable,
//   tenant not found, bad scan response) abort and mark the run failed.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runGrowthScan } from "./scan";
import { runGrowthDraft } from "./draft";
import {
  gatherInternalCandidates,
  gatherMetaCandidates,
  chooseDraftChannel,
  MAX_CANDIDATES_PER_RUN,
} from "./_shared";
import type { TenantContextForGrowth } from "./prompts";
import { extractBusinessBrief } from "@/lib/safety/business-brief";
import type {
  CandidateInput,
  GrowthCandidateStatus,
  GrowthRunStatus,
  GrowthRunTrigger,
  GrowthDraftChannel,
  MetaInboxMessageRow,
} from "./types";
import type { ScannedCandidate } from "./scan";

// ─────────────────────────────────────────────────────────────
// Tunable
// ─────────────────────────────────────────────────────────────

/**
 * How many drafts to fire in parallel. Anthropic rate limits + the
 * realistic Inngest Hobby tier (5 concurrent steps) both point to 5.
 * The first call in a batch warms the prompt-caching prefix; the rest
 * benefit from cache reads.
 */
const MAX_CONCURRENT_DRAFTS = 5;

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export interface RunGrowthAgentInput {
  tenantId: string;
  trigger: GrowthRunTrigger;
  /** auth.users.id of the user who pressed the on-demand button (null for cron) */
  triggeredBy?: string | null;
}

export interface RunGrowthAgentResult {
  runId: string;
  status: GrowthRunStatus;
  candidatesScanned: number;
  candidatesScored: number;
  draftsCreated: number;
  totalCostIls: number;
  errorMessage: string | null;
}

export async function runGrowthAgent(
  input: RunGrowthAgentInput
): Promise<RunGrowthAgentResult> {
  const db = createAdminClient();

  // ─── Step 1: Open a growth_runs row ─────────────────────────
  const { data: runRow, error: runInsertErr } = await db
    .from("growth_runs")
    .insert({
      tenant_id: input.tenantId,
      trigger: input.trigger,
      triggered_by: input.triggeredBy ?? null,
      status: "running" satisfies GrowthRunStatus,
    })
    .select("id")
    .single();

  if (runInsertErr || !runRow) {
    throw new Error(
      `[growth/run] failed to insert growth_runs row: ${runInsertErr?.message ?? "unknown"}`
    );
  }

  const runId: string = runRow.id;

  try {
    // ─── Step 2: Load tenant context ───────────────────────────
    const tenantContext = await loadTenantContextForGrowth(db, input.tenantId);

    // ─── Step 3: Gather candidates ─────────────────────────────
    const [internalCandidates, metaCandidates] = await Promise.all([
      gatherInternalCandidates(db, input.tenantId),
      gatherMetaCandidates(db, input.tenantId),
    ]);
    const allCandidates: CandidateInput[] = [
      ...internalCandidates,
      ...metaCandidates,
    ];

    if (allCandidates.length === 0) {
      return await finalizeNoOp(db, runId, "no candidates in pool");
    }

    // ─── Step 4: Haiku scan ────────────────────────────────────
    const scanResult = await runGrowthScan(allCandidates, tenantContext);

    if (scanResult.scanned.length === 0) {
      return await finalizeNoOp(
        db,
        runId,
        "no candidates passed score threshold",
        {
          scannedCount: allCandidates.length,
          candidatesCount: 0,
          haikuInputTokens: scanResult.inputTokens,
          haikuOutputTokens: scanResult.outputTokens,
          haikuCostIls: scanResult.costIls,
        }
      );
    }

    // ─── Step 5: Take top N + draft each ───────────────────────
    const topScored = scanResult.scanned.slice(0, MAX_CANDIDATES_PER_RUN);

    // Look up the original CandidateInput for each scored id, so we can
    // build context against the right metadata + message preview.
    const candidateById = new Map<string, CandidateInput>();
    for (const c of allCandidates) candidateById.set(c.id, c);

    type DraftedRow = {
      scored: ScannedCandidate;
      input: CandidateInput;
      draftMessage: string;
      candidateSubtitle: string;
      draftChannel: GrowthDraftChannel;
      sonnetInputTokens: number;
      sonnetOutputTokens: number;
      sonnetCacheReadTokens: number;
      sonnetCostIls: number;
    };

    const drafted: DraftedRow[] = [];
    let draftErrors = 0;

    for (let i = 0; i < topScored.length; i += MAX_CONCURRENT_DRAFTS) {
      const batch = topScored.slice(i, i + MAX_CONCURRENT_DRAFTS);

      const batchResults = await Promise.allSettled(
        batch.map(async (scored): Promise<DraftedRow> => {
          const candidateInput = candidateById.get(scored.id);
          if (!candidateInput) {
            throw new Error(
              `[growth/run] scored candidate ${scored.id} missing from input pool`
            );
          }

          const ctx = await buildDraftContext(
            db,
            input.tenantId,
            candidateInput,
            scored
          );

          const draftResult = await runGrowthDraft(
            {
              goal: scored.goal,
              reasonFromHaiku: scored.reason,
              customerLabel: ctx.customerLabel,
              draftChannel: ctx.draftChannel,
              recentMessages: ctx.recentMessages,
              historicalSummary: ctx.historicalSummary,
              lastInteractionDate: ctx.lastInteractionDate,
              lastInteractionTopic: ctx.lastInteractionTopic,
            },
            tenantContext
          );

          return {
            scored,
            input: candidateInput,
            draftMessage: draftResult.draftMessage,
            candidateSubtitle: draftResult.candidateSubtitle,
            draftChannel: ctx.draftChannel,
            sonnetInputTokens: draftResult.inputTokens,
            sonnetOutputTokens: draftResult.outputTokens,
            sonnetCacheReadTokens: draftResult.cacheReadTokens,
            sonnetCostIls: draftResult.costIls,
          };
        })
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          drafted.push(result.value);
        } else {
          draftErrors++;
          console.error(
            `[growth/run] draft failed for tenant ${input.tenantId}: ${
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
            }`
          );
        }
      }
    }

    // ─── Step 6: Persist drafted candidates ─────────────────────
    if (drafted.length > 0) {
      const rowsToInsert = drafted.map((d) => ({
        tenant_id: input.tenantId,
        run_id: runId,
        customer_phone:
          d.input.source === "interactions" ? d.input.id : null,
        meta_inbox_msg_id:
          d.input.source !== "interactions" ? d.input.id : null,
        source: d.input.source,
        goal: d.scored.goal,
        priority_score: d.scored.score,
        why_explanation: d.scored.reason,
        candidate_label: d.input.label,
        candidate_subtitle: d.candidateSubtitle,
        draft_message: d.draftMessage,
        draft_channel: d.draftChannel,
        status: "pending" satisfies GrowthCandidateStatus,
      }));

      const { error: insertErr } = await db
        .from("growth_candidates")
        .insert(rowsToInsert);

      if (insertErr) {
        throw new Error(
          `[growth/run] failed to insert candidates: ${insertErr.message}`
        );
      }
    }

    // ─── Step 7: Aggregate Sonnet usage + finalize run ──────────
    const sonnetInputTokens = drafted.reduce(
      (a, d) => a + d.sonnetInputTokens,
      0
    );
    const sonnetOutputTokens = drafted.reduce(
      (a, d) => a + d.sonnetOutputTokens,
      0
    );
    const sonnetCacheReadTokens = drafted.reduce(
      (a, d) => a + d.sonnetCacheReadTokens,
      0
    );
    const sonnetCostIls = drafted.reduce((a, d) => a + d.sonnetCostIls, 0);
    const totalCostIls = +(scanResult.costIls + sonnetCostIls).toFixed(4);

    const finalStatus: GrowthRunStatus =
      drafted.length === topScored.length
        ? "succeeded"
        : drafted.length > 0
          ? "partial"
          : "failed";

    await db
      .from("growth_runs")
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        scanned_count: allCandidates.length,
        candidates_count: scanResult.scanned.length,
        haiku_input_tokens: scanResult.inputTokens,
        haiku_output_tokens: scanResult.outputTokens,
        haiku_cost_ils: scanResult.costIls,
        drafts_count: drafted.length,
        sonnet_input_tokens: sonnetInputTokens,
        sonnet_output_tokens: sonnetOutputTokens,
        sonnet_cache_read_tokens: sonnetCacheReadTokens,
        sonnet_cost_ils: sonnetCostIls,
        total_cost_ils: totalCostIls,
        error_message:
          draftErrors > 0
            ? `${draftErrors} of ${topScored.length} drafts failed (see console)`
            : null,
      })
      .eq("id", runId);

    // ─── Step 8: (Sprint 1C) WhatsApp digest notification ───────
    // TODO[Sprint 1C]: send digest to tenant owner if drafted.length >= MIN_CANDIDATES_FOR_DIGEST
    // For now we just log the count.
    console.log(
      `[growth/run] tenant ${input.tenantId.slice(0, 8)} run ${runId.slice(0, 8)}: ${drafted.length} drafts ready, status=${finalStatus}`
    );

    return {
      runId,
      status: finalStatus,
      candidatesScanned: allCandidates.length,
      candidatesScored: scanResult.scanned.length,
      draftsCreated: drafted.length,
      totalCostIls,
      errorMessage: null,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `[growth/run] fatal error for tenant ${input.tenantId}:`,
      errorMessage
    );

    await db
      .from("growth_runs")
      .update({
        status: "failed" satisfies GrowthRunStatus,
        finished_at: new Date().toISOString(),
        error_message: errorMessage,
      })
      .eq("id", runId);

    return {
      runId,
      status: "failed",
      candidatesScanned: 0,
      candidatesScored: 0,
      draftsCreated: 0,
      totalCostIls: 0,
      errorMessage,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Helper — finalize a no-op run cleanly
// ─────────────────────────────────────────────────────────────

async function finalizeNoOp(
  db: SupabaseClient,
  runId: string,
  reason: string,
  partial?: {
    scannedCount: number;
    candidatesCount: number;
    haikuInputTokens: number;
    haikuOutputTokens: number;
    haikuCostIls: number;
  }
): Promise<RunGrowthAgentResult> {
  await db
    .from("growth_runs")
    .update({
      status: "succeeded" satisfies GrowthRunStatus,
      finished_at: new Date().toISOString(),
      scanned_count: partial?.scannedCount ?? 0,
      candidates_count: partial?.candidatesCount ?? 0,
      haiku_input_tokens: partial?.haikuInputTokens ?? 0,
      haiku_output_tokens: partial?.haikuOutputTokens ?? 0,
      haiku_cost_ils: partial?.haikuCostIls ?? 0,
      drafts_count: 0,
      sonnet_input_tokens: 0,
      sonnet_output_tokens: 0,
      sonnet_cache_read_tokens: 0,
      sonnet_cost_ils: 0,
      total_cost_ils: partial?.haikuCostIls ?? 0,
      error_message: reason,
    })
    .eq("id", runId);

  return {
    runId,
    status: "succeeded",
    candidatesScanned: partial?.scannedCount ?? 0,
    candidatesScored: partial?.candidatesCount ?? 0,
    draftsCreated: 0,
    totalCostIls: partial?.haikuCostIls ?? 0,
    errorMessage: null,
  };
}

// ─────────────────────────────────────────────────────────────
// Helper — load tenant context block for prompts
// ─────────────────────────────────────────────────────────────

async function loadTenantContextForGrowth(
  db: SupabaseClient,
  tenantId: string
): Promise<TenantContextForGrowth> {
  const { data: tenant, error } = await db
    .from("tenants")
    .select("name, config")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    throw new Error(
      `[growth/run] tenant ${tenantId} not found: ${error?.message ?? "no row"}`
    );
  }

  const config = (tenant.config ?? {}) as {
    vertical?: string;
    tone_notes?: string;
    signature_style?: string;
  };

  return {
    businessName: tenant.name ?? "העסק",
    vertical: config.vertical ?? "general",
    toneNotes: config.tone_notes ?? null,
    signatureStyle: config.signature_style ?? null,
    // Sprint 3I Phase 2 Batch 3 — extract owner voice brief from the
    // top-level config.business_brief key (same row, no extra query).
    // extractBusinessBrief returns null when missing/empty/whitespace,
    // and draft.ts skips brief block emission when null.
    businessBrief: extractBusinessBrief(
      tenant.config as Record<string, unknown> | null
    ),
  };
}

// ─────────────────────────────────────────────────────────────
// Helper — build per-candidate draft context (recent messages, history)
// ─────────────────────────────────────────────────────────────

interface DraftContextResult {
  customerLabel: string;
  draftChannel: GrowthDraftChannel;
  recentMessages: Array<{
    direction: "inbound" | "outbound";
    text: string;
    timestamp: string;
  }>;
  historicalSummary: string;
  lastInteractionDate: string | null;
  lastInteractionTopic: string | null;
}

async function buildDraftContext(
  db: SupabaseClient,
  tenantId: string,
  candidate: CandidateInput,
  _scored: ScannedCandidate
): Promise<DraftContextResult> {
  const draftChannel = chooseDraftChannel(candidate.source);

  if (candidate.source === "interactions") {
    return await buildInternalContext(db, tenantId, candidate, draftChannel);
  } else {
    return await buildMetaContext(db, candidate, draftChannel);
  }
}

async function buildInternalContext(
  db: SupabaseClient,
  tenantId: string,
  candidate: CandidateInput,
  draftChannel: GrowthDraftChannel
): Promise<DraftContextResult> {
  const phone = candidate.id; // for internal source, id IS the phone

  // Pull last 5 inbound messages for this phone from the events table.
  // The phone lives inside payload (jsonb), filtered via PostgREST's
  // arrow syntax: filter('payload->>contact_phone', 'eq', phone).
  // Note: `direction` is implicit from event_type ('whatsapp_message_received'
  // = inbound). We don't currently surface outbound owner replies in
  // recentMessages; the Sonnet prompt is robust to one-sided context.
  const { data: events } = await db
    .from("events")
    .select("payload, received_at")
    .eq("tenant_id", tenantId)
    .eq("provider", "whatsapp")
    .eq("event_type", "whatsapp_message_received")
    .filter("payload->>contact_phone", "eq", phone)
    .order("received_at", { ascending: false })
    .limit(5);

  type EventRow = {
    payload: { raw_message?: string; summary?: string } | null;
    received_at: string;
  };

  const rows = (events ?? []) as EventRow[];

  const recentMessages = rows.map((e) => ({
    direction: "inbound" as const,
    text: (e.payload?.raw_message ?? e.payload?.summary ?? "").slice(0, 280),
    timestamp: e.received_at.slice(0, 10),
  }));

  const lastEvent = rows[0] ?? null;
  const lastInteractionDate = lastEvent?.received_at.slice(0, 10) ?? null;
  // Topic enrichment lives in the Watcher upgrade roadmap; for now, null.
  const lastInteractionTopic: string | null = null;

  // Build a simple historical summary from candidate metadata (already
  // populated by gatherInternalCandidates). Stays cheap — no extra round trip.
  const m = candidate.metadata;
  const summaryParts: string[] = [];
  if (m.totalPriorInteractions) {
    summaryParts.push(`${m.totalPriorInteractions} אינטראקציות קודמות`);
  }
  if (m.daysSinceLastInteraction != null) {
    summaryParts.push(`לא היה ${m.daysSinceLastInteraction} ימים`);
  }
  if (m.lastInteractionSentiment) {
    const sentimentHe =
      m.lastInteractionSentiment === "positive"
        ? "סנטימנט חיובי"
        : m.lastInteractionSentiment === "negative"
          ? "סנטימנט שלילי"
          : "סנטימנט ניטרלי";
    summaryParts.push(sentimentHe);
  }

  return {
    customerLabel: candidate.label,
    draftChannel,
    recentMessages,
    historicalSummary: summaryParts.join(", "),
    lastInteractionDate,
    lastInteractionTopic,
  };
}

async function buildMetaContext(
  db: SupabaseClient,
  candidate: CandidateInput,
  draftChannel: GrowthDraftChannel
): Promise<DraftContextResult> {
  const { data: focal } = await db
    .from("meta_inbox_messages")
    .select("conversation_id, message_text, received_at, sender_username")
    .eq("id", candidate.id)
    .single();

  const focalRow = focal as Pick<
    MetaInboxMessageRow,
    "conversation_id" | "message_text" | "received_at" | "sender_username"
  > | null;

  const recentMessages: DraftContextResult["recentMessages"] = focalRow
    ? [
        {
          direction: "inbound" as const,
          text: (focalRow.message_text ?? "").slice(0, 280),
          timestamp: focalRow.received_at.slice(0, 10),
        },
      ]
    : [];

  return {
    customerLabel: candidate.label,
    draftChannel,
    recentMessages,
    historicalSummary: candidate.metadata.lastMessagePreview
      ? `הודעה ב-${candidate.source}: ${candidate.metadata.lastMessagePreview.slice(0, 200)}`
      : "פנייה דרך רשת חברתית",
    lastInteractionDate: focalRow?.received_at.slice(0, 10) ?? null,
    lastInteractionTopic: null,
  };
}
