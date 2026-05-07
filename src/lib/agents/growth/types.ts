// src/lib/agents/growth/types.ts
//
// TypeScript types for the Growth Agent (Sub-stage 1.15).
//
// These mirror the DB schema in migration 023_growth_agent.sql.
// Keep them in lockstep — when SQL changes, this file changes.
//
// Why: DB rows come back from Supabase as `unknown`, and we want
// type-safe consumers throughout the codebase. By centralizing the
// shape here, downstream files (scan.ts, draft.ts, run.ts, dashboard
// components) can import a single source of truth.

import "server-only";

// ─────────────────────────────────────────────────────────────
// Enum-like string unions (must match SQL CHECK constraints)
// ─────────────────────────────────────────────────────────────

export type MetaChannel = "instagram" | "facebook";

export type MetaMessageType =
  | "text"
  | "image"
  | "voice"
  | "video"
  | "sticker"
  | "other";

export type MetaInboxClassification =
  | "lead"
  | "question"
  | "compliment"
  | "spam"
  | "other";

export type GrowthRunTrigger = "cron" | "on_demand";

export type GrowthRunStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "partial";

export type GrowthSource = "interactions" | "instagram" | "facebook";

export type GrowthGoal = "reactivation" | "lead_discovery";

export type GrowthCandidateStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "closed"
  | "expired";

export type GrowthDraftChannel = "whatsapp" | "instagram" | "facebook";

export type GrowthOutcomeType =
  | "sent"
  | "replied"
  | "closed"
  | "rejected_by_owner"
  | "expired";

// ─────────────────────────────────────────────────────────────
// DB row types (snake_case, match Supabase return shape)
// ─────────────────────────────────────────────────────────────

export interface MetaInboxMessageRow {
  id: string;
  tenant_id: string;
  channel: MetaChannel;
  platform_msg_id: string;
  conversation_id: string;
  sender_platform_id: string;
  sender_username: string | null;
  sender_display_name: string | null;
  message_text: string | null;
  message_type: MetaMessageType;
  received_at: string;
  was_replied: boolean;
  replied_at: string | null;
  classification: MetaInboxClassification | null;
  classification_at: string | null;
  created_at: string;
}

export interface GrowthRunRow {
  id: string;
  tenant_id: string;
  trigger: GrowthRunTrigger;
  triggered_by: string | null;
  status: GrowthRunStatus;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  scanned_count: number | null;
  candidates_count: number | null;
  haiku_input_tokens: number | null;
  haiku_output_tokens: number | null;
  haiku_cost_ils: number | null;
  drafts_count: number | null;
  sonnet_input_tokens: number | null;
  sonnet_output_tokens: number | null;
  sonnet_cache_read_tokens: number | null;
  sonnet_cost_ils: number | null;
  total_cost_ils: number | null;
  created_at: string;
}

export interface GrowthCandidateRow {
  id: string;
  tenant_id: string;
  run_id: string;
  customer_phone: string | null;
  meta_inbox_msg_id: string | null;
  source: GrowthSource;
  goal: GrowthGoal;
  priority_score: number;
  why_explanation: string;
  candidate_label: string;
  candidate_subtitle: string | null;
  draft_message: string;
  draft_channel: GrowthDraftChannel;
  status: GrowthCandidateStatus;
  decided_at: string | null;
  decided_by: string | null;
  closed_at: string | null;
  closed_value_ils: number | null;
  expires_at: string;
  created_at: string;
}

export interface GrowthOutcomeRow {
  id: string;
  tenant_id: string;
  candidate_id: string;
  outcome_type: GrowthOutcomeType;
  reported_value_ils: number | null;
  reported_at: string;
}

// ─────────────────────────────────────────────────────────────
// Pipeline-internal types (NOT in DB — used between stages)
// ─────────────────────────────────────────────────────────────

/**
 * A potential candidate before Haiku scoring. Either an internal
 * customer (interactions source) or an unreplied Meta DM.
 */
export interface CandidateInput {
  /** Stable identifier — phone for internal, meta_inbox_msg_id for Meta */
  id: string;
  source: GrowthSource;
  /** Display label — name for internal, @handle for Meta */
  label: string;
  /** Compact metadata for Haiku to score against */
  metadata: CandidateMetadata;
}

export interface CandidateMetadata {
  // Common to both sources
  daysSinceLastInteraction: number | null;
  totalPriorInteractions: number;
  lastInteractionSentiment: "positive" | "neutral" | "negative" | null;

  // Internal source only
  totalRevenueIls?: number;
  servicesUsed?: string[];
  appointmentHistory?: {
    completed: number;
    noShows: number;
    cancelled: number;
  };

  // Meta source only
  lastMessagePreview?: string;
  metaChannel?: MetaChannel;
}

/**
 * Output from Haiku stage — one per scored candidate that passed threshold.
 */
export interface ScoredCandidate {
  id: string;
  source: GrowthSource;
  score: number;        // 1-100
  reason: string;       // Hebrew, one sentence
  goal: GrowthGoal;
  label: string;        // echoed from CandidateInput
  /** Full context block for Sonnet (built fresh per candidate) */
  context: CandidateContext;
}

/**
 * Rich context block sent to Sonnet for draft generation.
 * Includes the customer's history beyond the metadata Haiku saw.
 */
export interface CandidateContext {
  label: string;
  goal: GrowthGoal;
  reasonFromHaiku: string;

  // Recent conversation snippets (3-5 messages, redacted of PII other than name)
  recentMessages: Array<{
    direction: "inbound" | "outbound";
    text: string;
    timestamp: string;
  }>;

  // Service / appointment / purchase summary
  historicalSummary: string;

  // Last interaction context
  lastInteractionDate: string | null;
  lastInteractionTopic: string | null;

  // Channel hint for the draft
  draftChannel: GrowthDraftChannel;
}

/**
 * Output from Sonnet stage — the message ready to insert as a candidate.
 */
export interface DraftedCandidate extends ScoredCandidate {
  draftMessage: string;
  draftChannel: GrowthDraftChannel;
  candidateSubtitle: string;
}

// ─────────────────────────────────────────────────────────────
// Aggregated views (used by dashboard server actions)
// ─────────────────────────────────────────────────────────────

/**
 * Single candidate as the dashboard sees it — joined with outcomes.
 */
export interface GrowthCandidateView extends GrowthCandidateRow {
  outcomes: GrowthOutcomeRow[];
}

/**
 * Weekly ROI rollup for the stat strip at top of /dashboard/growth.
 */
export interface GrowthWeeklyStats {
  approvedCount: number;
  closedCount: number;
  reportedRevenueIls: number;
  /** ISO date of week start (Sunday) */
  weekStart: string;
}
