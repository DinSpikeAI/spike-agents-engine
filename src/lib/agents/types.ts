/**
 * Spike Engine — Agent Infrastructure Types
 *
 * These types define the contract shared by all 9 agents.
 * Built once, used 9 times.
 */

import type { WatcherCategory, WatcherSeverity } from "./watcher/hierarchy";

// ─────────────────────────────────────────────────────────────
// Agent identity
// ─────────────────────────────────────────────────────────────

export type AgentId =
  | "morning"
  | "reviews"
  | "social"
  | "manager"
  | "watcher"
  | "cleanup"
  | "sales"
  | "inventory"
  | "hot_leads";

export type AgentModel =
  | "claude-haiku-4-5"
  | "claude-sonnet-4-6"
  | "claude-opus-4-7";

// ─────────────────────────────────────────────────────────────
// Run lifecycle
// ─────────────────────────────────────────────────────────────

export type RunStatus =
  | "running"        // Agent is executing
  | "succeeded"      // Completed normally
  | "failed"         // Errored out
  | "no_op";         // Safely halted (nothing to do — NOT a failure!)

export interface RunInput {
  tenantId: string;
  agentId: AgentId;
  triggerSource: "manual" | "scheduled" | "webhook";
  /** Model used for cost calculation. Each agent declares its own. */
  model: AgentModel;
}

export interface RunResult<T = unknown> {
  runId: string;
  status: RunStatus;
  output: T | null;
  error?: string;
  costEstimateIls: number;
  costActualIls: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  startedAt: string;
  finishedAt: string | null;
  isMocked: boolean;
}

// ─────────────────────────────────────────────────────────────
// Morning Agent specific output
// ─────────────────────────────────────────────────────────────

export interface MorningAgentOutput {
  greeting: string;
  headline: string;
  yesterdayMetrics: {
    revenue: number | null;
    revenueChangePercent: number | null;
    sameWeekdayCompare: string | null;
  };
  thingsCompleted: string[];
  thingsNeedingApproval: number;
  insights: string[];
  todaysSchedule: string[];
  callToAction: string;
}

// ─────────────────────────────────────────────────────────────
// Watcher Agent specific output
// ─────────────────────────────────────────────────────────────
//
// Severity is assigned by CODE (NOT by LLM). The LLM only classifies
// category; ./watcher/hierarchy.ts maps category → severity.

export interface WatcherAlert {
  category: WatcherCategory;
  severity: WatcherSeverity;
  /** Hebrew title — what happened (max ~80 chars). */
  title: string;
  /** Hebrew context — why it matters + suggested action (max ~200 chars). */
  context: string;
  /** Hebrew label for the data source (e.g., "Google Reviews"). */
  source: string;
  /** ISO timestamp or human-readable Hebrew like "לפני 12 דקות". */
  occurredAt: string;
}

export interface WatcherAgentOutput {
  alerts: WatcherAlert[];
  scanSummary: string;
  scannedSources: string[];
  totalCount: number;
}

// ─────────────────────────────────────────────────────────────
// Reviews Agent — Day 8
// ─────────────────────────────────────────────────────────────
//
// Input: a single review from a customer (Google Reviews / Yelp / etc.).
// Output: a draft reply + classification of the review tone.
//
// IMPORTANT: ReviewsAgentOutput contains both classification (so the
// owner sees what the agent thought of the review) AND a Hebrew draft
// reply (the actual deliverable). The defamation guard checks the
// reply against the original review text.

export type ReviewSentiment = "positive" | "neutral" | "negative" | "very_negative";

export type ReviewIntent =
  | "praise"          // 5★ thank-you, no complaint
  | "minor_complaint" // 3-4★, specific issue
  | "major_complaint" // 1-2★, dissatisfaction
  | "abusive"         // hostile language, defamation against the business
  | "spam_or_fake";   // looks fake or spam

export interface MockReview {
  id: string;
  reviewerName: string;
  rating: number; // 1..5
  text: string;
  occurredAt: string; // ISO
}

export interface ReviewsAgentInput {
  reviews: MockReview[];
}

export interface ReviewDraft {
  /** Foreign key to the source review (mock ID for now, real Google ID later). */
  reviewId: string;
  /** Reviewer's name as displayed (preserved — not scrubbed). */
  reviewerName: string;
  /** 1..5 stars from the source. */
  rating: number;
  /** Original text of the review (after PII scrub) for owner reference. */
  reviewTextDisplay: string;
  /** Agent's classification of the review tone. */
  sentiment: ReviewSentiment;
  /** Agent's classification of intent (drives default tone). */
  intent: ReviewIntent;
  /** The Hebrew draft reply. */
  draftText: string;
  /** Brief Hebrew rationale shown to owner ("למה אני מציע את זה"). */
  rationale: string;
  /** Whether the reply suggests offline contact (typical for negative reviews). */
  suggestsOfflineContact: boolean;
}

export interface ReviewsAgentOutput {
  /** One draft per review. Empty array if no reviews to handle. */
  drafts: ReviewDraft[];
  /** Hebrew summary for owner. */
  summary: string;
  /** Total reviews processed this run. */
  totalProcessed: number;
}

// ─────────────────────────────────────────────────────────────
// Generic agent output (placeholder for not-yet-implemented agents)
// ─────────────────────────────────────────────────────────────

export interface GenericAgentOutput {
  summary: string;
  details?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// Mock fixtures (testing only)
// ─────────────────────────────────────────────────────────────

export interface MockBehavior {
  forceStatus?: RunStatus;
  delayMs?: number;
}
