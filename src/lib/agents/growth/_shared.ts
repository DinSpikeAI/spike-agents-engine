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
//   - gatherInternalCandidates():   query events → CandidateInput[]
//   - gatherMetaCandidates():       query meta_inbox_messages → CandidateInput[]
//   - chooseDraftChannel():         decide WhatsApp vs IG vs FB based on source
//   - normalizeSentiment():         coerce Watcher's signals into 3-bucket sentiment
//   - cost calculators              for Haiku and Sonnet usage
//
// SCHEMA NOTE — events table:
//   events is the universal event log. The relevant columns:
//     - tenant_id (uuid)
//     - provider (text)         e.g. 'whatsapp'
//     - event_type (text)       e.g. 'whatsapp_message_received' (inbound)
//     - payload (jsonb)         contains contact_phone, contact_name, raw_message
//     - received_at (timestamptz)
//   There is NO direct phone column. Phone is at payload->>'contact_phone'.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CandidateInput,
  CandidateMetadata,
  GrowthDraftChannel,
  GrowthSource,
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

/**
 * How many recent inbound events to fetch per scan. We aggregate in JS
 * by phone (PostgREST does not support GROUP BY on jsonb keys), so
 * this is the bounded raw input. 2000 events covers ~6-12 months of
 * a busy SMB.
 */
const EVENTS_FETCH_LIMIT = 2000;

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
 * Pull dormant customers from the tenant's WhatsApp interaction history.
 *
 * Approach:
 *   1. Query the `events` table for inbound WhatsApp messages, ordered
 *      by received_at DESC, capped at EVENTS_FETCH_LIMIT.
 *   2. Aggregate in JS — group by contact_phone, count interactions,
 *      keep the most-recent received_at as last interaction.
 *   3. Filter:
 *        - last interaction at least DORMANCY_THRESHOLD_DAYS old
 *        - at least REACTIVATION_MIN_INTERACTIONS prior interactions
 *   4. Sort by recency (most-recently-dormant first — they're most
 *      reachable, least likely to have moved on permanently).
 *
 * Why JS aggregation instead of SQL: PostgREST doesn't expose Postgres
 * GROUP BY on jsonb keys cleanly. A Postgres function would be cleaner
 * eventually, but for now JS aggregation on 2000 rows is well under
 * 50ms and avoids a migration.
 */
export async function gatherInternalCandidates(
  db: SupabaseClient,
  tenantId: string
): Promise<CandidateInput[]> {
  const { data: events, error } = await db
    .from("events")
    .select("payload, received_at")
    .eq("tenant_id", tenantId)
    .eq("provider", "whatsapp")
    .eq("event_type", "whatsapp_message_received")
    .order("received_at", { ascending: false })
    .limit(EVENTS_FETCH_LIMIT);

  if (error) {
    console.error("[growth/_shared] gatherInternalCandidates failed:", error);
    return [];
  }

  type EventPayload = {
    contact_phone?: string;
    contact_name?: string;
    raw_message?: string;
  };

  type EventRow = {
    payload: EventPayload | null;
    received_at: string;
  };

  // Group by phone. Because rows are ordered DESC by received_at, the
  // FIRST time we see a phone is its most-recent event.
  type PhoneAggregate = {
    name: string | null;
    count: number;
    lastReceivedAt: string; // ISO
    lastMessagePreview: string | null;
  };

  const byPhone = new Map<string, PhoneAggregate>();

  for (const ev of (events ?? []) as EventRow[]) {
    const payload = ev.payload ?? {};
    const phone = (payload.contact_phone ?? "").trim();
    if (!phone) continue;

    const existing = byPhone.get(phone);
    if (!existing) {
      byPhone.set(phone, {
        name: payload.contact_name ?? null,
        count: 1,
        lastReceivedAt: ev.received_at,
        lastMessagePreview: (payload.raw_message ?? "").slice(0, 200) || null,
      });
    } else {
      existing.count += 1;
      // received_at is DESC-sorted; first occurrence wins for last-seen.
      // Just bump the count.
    }
  }

  const now = Date.now();
  const candidates: CandidateInput[] = [];

  for (const [phone, agg] of byPhone) {
    if (agg.count < REACTIVATION_MIN_INTERACTIONS) continue;

    const lastTs = new Date(agg.lastReceivedAt).getTime();
    const daysSince = Math.floor((now - lastTs) / (1000 * 60 * 60 * 24));

    if (daysSince < DORMANCY_THRESHOLD_DAYS) continue;

    const metadata: CandidateMetadata = {
      daysSinceLastInteraction: daysSince,
      totalPriorInteractions: agg.count,
      lastInteractionSentiment: null,
    };

    candidates.push({
      id: phone,
      source: "interactions",
      label: agg.name || phone,
      metadata,
    });
  }

  // Most-recently dormant first — those are the freshest opportunities.
  candidates.sort(
    (a, b) =>
      (a.metadata.daysSinceLastInteraction ?? Infinity) -
      (b.metadata.daysSinceLastInteraction ?? Infinity)
  );

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
      row.sender_username || row.sender_display_name || `(${row.channel})`;

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

const USD_TO_ILS = 3.7;

// Anthropic pricing as of Q2 2026
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
