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

export interface WatcherAlert {
  category: WatcherCategory;
  severity: WatcherSeverity;
  title: string;
  context: string;
  source: string;
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

export type ReviewSentiment = "positive" | "neutral" | "negative" | "very_negative";

export type ReviewIntent =
  | "praise"
  | "minor_complaint"
  | "major_complaint"
  | "abusive"
  | "spam_or_fake";

export interface MockReview {
  id: string;
  reviewerName: string;
  rating: number;
  text: string;
  occurredAt: string;
}

export interface ReviewsAgentInput {
  reviews: MockReview[];
}

export interface ReviewDraft {
  reviewId: string;
  reviewerName: string;
  rating: number;
  reviewTextDisplay: string;
  sentiment: ReviewSentiment;
  intent: ReviewIntent;
  draftText: string;
  rationale: string;
  suggestsOfflineContact: boolean;
}

export interface ReviewsAgentOutput {
  drafts: ReviewDraft[];
  summary: string;
  totalProcessed: number;
}

// ─────────────────────────────────────────────────────────────
// Hot Leads Agent — Day 9
// ─────────────────────────────────────────────────────────────
//
// Classification, not drafting. Output is a bucket per inbound lead.
//
// Bucketed enum (NOT 0-100 score) is mandatory: small models like
// Haiku 4.5 cluster around 50/70/85 in freeform numeric output. The
// bucket enum forces the model to commit to a discrete category,
// which improves both consistency and explainability.
//
// CRITICAL BIAS FIREWALL:
//   - The LLM receives ONLY behavior features (response_time, message
//     length, intent keywords, urgency signals, product mention, budget mention).
//   - Names, demographics, and source handles are STRIPPED before the
//     LLM call. They are stored in the leads table for the owner UI but
//     never enter the prompt.

export type LeadBucket =
  | "cold"             // No real intent — just browsing or generic question
  | "warm"             // Genuine interest but no urgency or specifics
  | "hot"              // Specific product + budget OR specific timeframe
  | "blazing"          // All signals: specific product + budget + urgency
  | "spam_or_unclear"; // Bot, scam, or genuinely unclear

export type LeadSource =
  | "whatsapp"
  | "instagram_dm"
  | "website_form"
  | "email"
  | "phone_call_transcript";

export interface MockLead {
  id: string;
  source: LeadSource;
  /** Display name shown to owner. NOT passed to LLM. */
  displayName: string;
  /** Source handle (e.g., @username, hashed phone). NOT passed to LLM. */
  sourceHandle: string;
  /** The raw message text. PII is scrubbed before LLM but not the substance. */
  rawMessage: string;
  receivedAt: string; // ISO
}

/**
 * Behavior features extracted by code. These are what the LLM sees.
 * NO name, NO demographic, NO source handle — only behavior.
 */
export interface LeadFeatures {
  source: LeadSource;             // channel context (legitimate signal)
  responseTimeMinutes: number | null; // how long since their first contact (if known)
  messageLengthTokens: number;
  intentKeywordsCount: number;    // count of intent words (קונה, מעוניין, רוצה, צריך)
  urgencySignalsCount: number;    // count of urgency words (דחוף, היום, עכשיו, מהר)
  hasSpecificProduct: boolean;    // mentions a specific product/service
  mentionedBudget: boolean;       // mentions price/budget
  questionCount: number;          // how many questions asked (proxy for engagement)
}

export interface LeadClassification {
  leadId: string;
  bucket: LeadBucket;
  /** Hebrew reason shown to owner (~1 sentence). */
  reason: string;
  /** Hebrew suggested next step. */
  suggestedAction: string;
}

export interface HotLeadsAgentInput {
  leads: MockLead[];
}

export interface HotLeadsAgentOutput {
  classifications: LeadClassification[];
  summary: string;
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
