// src/lib/agents/growth/_shared.ts
//
// Internal helpers for the Growth Agent pipeline.
//
// IMPORTANT: This file does NOT have "use server" at the top, matching
// the pattern in src/app/dashboard/actions/_shared.ts. These are
// utilities, not server actions.
//
// What lives here:
//   - DORMANCY_THRESHOLD_DAYS:      default cutoff for reactivation
//   - REACTIVATION_MIN_INTERACTIONS: minimum priors to be a viable target
//   - SCORE_THRESHOLD:              minimum Haiku score to surface
//   - MAX_CANDIDATES_PER_RUN:       hard cap on drafts per run (cost control)
//   - gatherInternalCandidates():   query events/drafts/hot_leads → CandidateInput[]
//   - gatherMetaCandidates():       query meta_inbox_messages → CandidateInput[]
//   - buildCandidateContext():      build rich context block for Sonnet
//   - normalizeSentiment():         coerce Watcher's signals into 3-bucket sentiment

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CandidateInput,
  CandidateContext,
  CandidateMetadata,
  GrowthDraftChannel,
  GrowthSource,
  ScoredCandidate,
} from "./types";

// ─────────────────────────────────────────────────────────────
// Tunable constants (review before changing — affects cost + quality)
// ─────────────────────────────────────────────────────────────

/**
 * A customer is "dormant" if their last interaction was more than this
 * many days ago. The Manager weekly report uses a longer window (90d);
 * Growth uses a tighter window so reactivation feels timely, not stale.
 */
export const DORMANCY_THRESHOLD_DAYS = 45;

/**
 * Customers with fewer than this many prior interactions are excluded.
 * One-off walk-ins are noise; we want real lapsed customers.
 */
export const REACTIVATION_MIN_INTERACTIONS = 2;

/**
 * Haiku scores 1-100. Below this threshold we skip drafting — cost
 * control + signal-to-noise. Aligns with the "don't draft if no strong
 * opportunity" rule from the user-facing UX.
 */
export const SCORE_THRESHOLD = 60;

/**
 * Hard cap on drafts per run. Even if Haiku scores 50 candidates above
 * threshold, we only draft the top 15. Prevents a single run from
 * generating an overwhelming inbox + caps Sonnet cost per run.
 */
export const MAX_CANDIDATES_PER_RUN = 15;

/**
 * If fewer than this many strong candidates surface, the run still
 * succeeds but the WhatsApp digest tells the owner "no strong
 * opportunities this week". Prevents weak digests from training the
 * owner to ignore the agent.
 */
export const MIN_CANDIDATES_FOR_DIGEST = 3;

/**
 * Look-back window for fetching Meta DMs. We only consider recent
 * unreplied messages — a 6-month-old DM is likely stale anyway.
 */
export const META_INBOX_LOOKBACK_DAYS = 60;

// ─────────────────────────────────────────────────────────────
// Sentiment normalization
// ─────────────────────────────────────────────────────────────

/**
 * Watcher emits a richer signal set; for Growth we collapse to
 * 3 buckets so Haiku has a clean signal.
 */
export function normalizeSentiment(
  rawSignal: string | null | undefined
): "positive" | "neutral" | "negative" | null {
  if (!rawSignal) return null;

  const positive = ["positive", "delighted", "satisfied", "thankful", "praise"];
  const negative = [
    "negative",
    "frustrated",
    "angry",
    "complaint",
    "urgent_negative",
  ];

  const lc = rawSignal.toLowerCase();
  if (positive.some((p) => lc.includes(p))) return "positive";
  if (negative.some((n) => lc.includes(n))) return "negative";
  return "neutral";
}

// ─────────────────────────────────────────────────────────────
// Internal candidate gathering (Source C — interactions)
// ─────────────────────────────────────────────────────────────

/**
 * Pull dormant customers from the tenant's interaction history.
 *
 * This intentionally uses a single aggregating query (not N+1) — for a
 * tenant with 500 customers, we don't want 500 round-trips. We let the
 * DB do the heavy lifting and get back a compact rollup.
 *
 * Returns up to ~200 candidates (bounded by SQL LIMIT for memory safety).
 */
export async function gatherInternalCandidates(
  db: SupabaseClient,
  tenantId: string
): Promise<CandidateInput[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DORMANCY_THRESHOLD_DAYS);
  const cutoffIso = cutoffDate.toISOString();

  // Fetch dormant customers via aggregation. The exact query depends on
  // Spike's `events` schema — this is the canonical shape:
  //   - phone identity
  //   - last interaction date (we want it BEFORE cutoffIso)
  //   - total prior interactions (must be >= REACTIVATION_MIN_INTERACTIONS)
  //
  // We use a Postgres function for clarity (defined in a follow-up
  // migration if desired); for now the inline form is fine.

  const { data: rollup, error } = await db
    .from("events")
    .select("phone, max(created_at), count(*)")
    .eq("tenant_id", tenantId)
    .eq("direction", "inbound")
    .not("phone", "is", null);

  if (error) {
    console.error("[growth/_shared] gatherInternalCandidates failed:", error);
    return [];
  }

  // The above `select` with aggregations relies on PostgREST aggregate
  // support. If your project doesn't have that enabled, swap to an RPC
  // function. The shape below assumes the rollup row format.

  type RollupRow = {
    phone: string;
    max: string;        // ISO date of latest interaction
    count: number;
  };

  const rows = (rollup as unknown as RollupRow[]) ?? [];

  const candidates: CandidateInput[] = [];
  const now = Date.now();

  for (const row of rows) {
    const lastTs = new Date(row.max).getTime();
    const daysSince = Math.floor((now - lastTs) / (1000 * 60 * 60 * 24));

    if (daysSince < DORMANCY_THRESHOLD_DAYS) continue;
    if (row.count < REACTIVATION_MIN_INTERACTIONS) continue;

    const metadata: CandidateMetadata = {
      daysSinceLastInteraction: daysSince,
      totalPriorInteractions: row.count,
      lastInteractionSentiment: null, // filled by enrichment step if needed
    };

    candidates.push({
      id: row.phone,
      source: "interactions",
      label: row.phone, // resolved to display name in buildCandidateContext
      metadata,
    });
  }

  // Sort by recency (most recently dormant first — they're most reachable)
  candidates.sort(
    (a, b) =>
      (a.metadata.daysSinceLastInteraction ?? Infinity) -
      (b.metadata.daysSinceLastInteraction ?? Infinity)
  );

  // Hard cap on candidate pool size for Haiku scan cost control
  return candidates.slice(0, 200);
}

// ─────────────────────────────────────────────────────────────
// Meta candidate gathering (Source G — IG/FB DMs)
// ─────────────────────────────────────────────────────────────

/**
 * Pull unreplied Meta inbox messages from the last META_INBOX_LOOKBACK_DAYS.
 * A "candidate" here is a single unanswered message — if the same sender
 * sent 3 messages and got no reply, we surface ONE candidate (the most
 * recent message), not three.
 */
export async function gatherMetaCandidates(
  db: SupabaseClient,
  tenantId: string
): Promise<CandidateInput[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - META_INBOX_LOOKBACK_DAYS);
  const cutoffIso = cutoffDate.toISOString();

  const { data: rows, error } = await db
    .from("meta_inbox_messages")
    .select(
      "id, channel, conversation_id, sender_username, sender_display_name, message_text, received_at, classification"
    )
    .eq("tenant_id", tenantId)
    .eq("was_replied", false)
    .gte("received_at", cutoffIso)
    .neq("classification", "spam") // exclude already-classified spam
    .order("received_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[growth/_shared] gatherMetaCandidates failed:", error);
    return [];
  }

  // Dedup by conversation_id — keep most recent message only
  const seen = new Set<string>();
  const candidates: CandidateInput[] = [];
  const now = Date.now();

  for (const row of rows ?? []) {
    if (seen.has(row.conversation_id)) continue;
    seen.add(row.conversation_id);

    const receivedTs = new Date(row.received_at).getTime();
    const daysSince = Math.floor((now - receivedTs) / (1000 * 60 * 60 * 24));

    const label =
      row.sender_username ||
      row.sender_display_name ||
      `(${row.channel})`;

    const metadata: CandidateMetadata = {
      daysSinceLastInteraction: daysSince,
      totalPriorInteractions: 1, // single unreplied message
      lastInteractionSentiment: null,
      lastMessagePreview: (row.message_text ?? "").slice(0, 200),
      metaChannel: row.channel,
    };

    candidates.push({
      id: row.id, // meta_inbox_message id
      source: row.channel, // 'instagram' | 'facebook'
      label,
      metadata,
    });
  }

  return candidates;
}

// ─────────────────────────────────────────────────────────────
// Channel selection
// ─────────────────────────────────────────────────────────────

/**
 * Decide which channel to draft for, based on the source.
 * For internal customers we always reply via WhatsApp (their primary
 * channel with the business). For Meta sources we reply on the same
 * channel the message came from.
 */
export function chooseDraftChannel(source: GrowthSource): GrowthDraftChannel {
  switch (source) {
    case "interactions":
      return "whatsapp";
    case "instagram":
      return "instagram";
    case "facebook":
      return "facebook";
  }
}

// ─────────────────────────────────────────────────────────────
// Cost calculation helpers (used by run.ts to populate growth_runs)
// ─────────────────────────────────────────────────────────────

const USD_TO_ILS = 3.7; // Aligns with the codebase-wide constant

// Anthropic pricing as of Q2 2026 (verified inngest research notes)
const HAIKU_INPUT_USD_PER_MTOK = 1;
const HAIKU_OUTPUT_USD_PER_MTOK = 5;
const SONNET_INPUT_USD_PER_MTOK = 3;
const SONNET_OUTPUT_USD_PER_MTOK = 15;
const SONNET_CACHE_READ_USD_PER_MTOK = 0.3; // 0.1x base = $0.30/MTok

export function calcHaikuCostIls(
  inputTokens: number,
  outputTokens: number
): number {
  const usd =
    (inputTokens * HAIKU_INPUT_USD_PER_MTOK) / 1_000_000 +
    (outputTokens * HAIKU_OUTPUT_USD_PER_MTOK) / 1_000_000;
  return Math.round(usd * USD_TO_ILS * 10000) / 10000;
}

export function calcSonnetCostIls(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number
): number {
  const nonCachedInputTokens = Math.max(0, inputTokens - cacheReadTokens);
  const usd =
    (nonCachedInputTokens * SONNET_INPUT_USD_PER_MTOK) / 1_000_000 +
    (cacheReadTokens * SONNET_CACHE_READ_USD_PER_MTOK) / 1_000_000 +
    (outputTokens * SONNET_OUTPUT_USD_PER_MTOK) / 1_000_000;
  return Math.round(usd * USD_TO_ILS * 10000) / 10000;
}

// ─────────────────────────────────────────────────────────────
// Context building (used by draft.ts in Sprint 1B)
// ─────────────────────────────────────────────────────────────

/**
 * Build a rich CandidateContext block for Sonnet to draft from.
 * This is invoked PER candidate (not per scan), so we make sure each
 * call is bounded — no fetching the entire conversation history.
 *
 * Implementation note: this function is INTENTIONALLY thin in Batch 1A.
 * The actual recentMessages / historicalSummary / lastInteractionTopic
 * enrichment is implemented in Sprint 1B alongside scan.ts and draft.ts,
 * because the exact event schema joins depend on prompts being finalized.
 */
export async function buildCandidateContext(
  db: SupabaseClient,
  tenantId: string,
  scored: ScoredCandidate
): Promise<CandidateContext> {
  // Sprint 1B will fill this in with the full event-history join.
  // For now, return a minimal-but-valid context so types are stable.
  return {
    label: scored.label,
    goal: scored.goal,
    reasonFromHaiku: scored.reason,
    recentMessages: [],
    historicalSummary: "",
    lastInteractionDate: null,
    lastInteractionTopic: null,
    draftChannel: chooseDraftChannel(scored.source),
  };
}
