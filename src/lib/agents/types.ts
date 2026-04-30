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
  | "running"
  | "succeeded"
  | "failed"
  | "no_op";

export interface RunInput {
  tenantId: string;
  agentId: AgentId;
  triggerSource: "manual" | "scheduled" | "webhook";
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
// Morning Agent
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
// Watcher Agent
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

export type LeadBucket =
  | "cold"
  | "warm"
  | "hot"
  | "blazing"
  | "spam_or_unclear";

export type LeadSource =
  | "whatsapp"
  | "instagram_dm"
  | "website_form"
  | "email"
  | "phone_call_transcript";

export interface MockLead {
  id: string;
  source: LeadSource;
  displayName: string;
  sourceHandle: string;
  rawMessage: string;
  receivedAt: string;
}

export interface LeadFeatures {
  source: LeadSource;
  responseTimeMinutes: number | null;
  messageLengthTokens: number;
  intentKeywordsCount: number;
  urgencySignalsCount: number;
  hasSpecificProduct: boolean;
  mentionedBudget: boolean;
  questionCount: number;
}

export interface LeadClassification {
  leadId: string;
  bucket: LeadBucket;
  reason: string;
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
// Manager Agent — Day 10
// ─────────────────────────────────────────────────────────────
//
// The Manager is the orchestrator. It does NOT execute outbound actions.
// It produces a structured report covering 4 areas:
//   1. Quality Audit — samples drafts, flags brand-tone or defamation issues
//   2. System Health — analyzes agent_runs failures, cost anomalies
//   3. Growth Metrics — approval rate, time-to-approval, stale blazing leads
//   4. Recommendation — ONE actionable suggestion per run
//
// The Manager runs Sonnet 4.6 with thinking_budget 8000 because it must
// reason across heterogeneous signals (failure logs + draft samples +
// metrics + costs) and produce judgment calls about what matters most.

export type RecommendationType =
  | "prompt_tweak"          // suggest editing an agent's prompt
  | "scheduling"            // suggest changing run frequency
  | "configuration"         // suggest a tenant.config change (gender, vertical, brand voice)
  | "no_action_needed";     // healthy week, nothing to recommend

export type AgentStatusInWindow = "succeeded" | "failed" | "skipped" | "never_ran";

export interface AgentStatusEntry {
  agentId: AgentId;
  status: AgentStatusInWindow;
  /** Number of runs in window. */
  runCount: number;
  /** Number of failures. Used for 3-strikes detection. */
  failureCount: number;
  /** Most recent error message if any. */
  lastError: string | null;
}

export interface QualityFinding {
  /** drafts.id of the flagged draft. */
  draftId: string;
  /** What kind of issue: 'brand_tone' | 'defamation_followup' | 'pii_leak_suspicion' */
  issueType: string;
  /** Hebrew explanation for owner. */
  reasonHe: string;
  /** Severity: 'minor' | 'moderate' | 'critical'. */
  severity: "minor" | "moderate" | "critical";
}

export interface SystemHealthSignal {
  /** What kind of anomaly: 'cost_spike' | 'consecutive_failures' | 'token_anomaly' */
  anomalyType: string;
  /** Affected agent (if applicable). */
  agentId: AgentId | null;
  /** Hebrew explanation for owner. */
  descriptionHe: string;
  /** Severity. */
  severity: "minor" | "moderate" | "critical";
}

export interface GrowthMetrics {
  /** 0..1 — what fraction of drafts the owner approved. Null if no drafts in window. */
  approvalRate: number | null;
  /** Median minutes from draft creation to approval. Null if no approvals. */
  medianTimeToApprovalMinutes: number | null;
  /** Number of pending drafts older than 24 hours. */
  stalePendingDraftsCount: number;
  /** Number of blazing-bucket leads not contacted within 24h. Critical signal. */
  staleBlazingLeadsCount: number;
}

export interface ManagerRecommendation {
  type: RecommendationType;
  /** Which agent the recommendation is about, if specific. */
  targetAgent: AgentId | null;
  /** One-liner Hebrew title. */
  titleHe: string;
  /** Detailed Hebrew explanation. */
  detailHe: string;
  /** Concrete action the owner should consider. */
  suggestedActionHe: string;
}

export interface ManagerAgentOutput {
  /** Hebrew one-line summary of the report. */
  summary: string;

  status_summary: {
    agents: AgentStatusEntry[];
    /** Total successful runs in window. */
    totalSucceeded: number;
    /** Total failed runs in window. */
    totalFailed: number;
  };

  quality_findings: {
    draftsSampled: number;
    findings: QualityFinding[];
    /** Hebrew prose summary of quality state. */
    overallQualityHe: string;
  };

  system_health: {
    signals: SystemHealthSignal[];
    costWindowIls: number;
    costAnomalyDetected: boolean;
    /** Hebrew prose summary of system health. */
    overallHealthHe: string;
  };

  growth_metrics: GrowthMetrics & {
    /** Hebrew prose interpretation of metrics. */
    interpretationHe: string;
  };

  recommendation: ManagerRecommendation;

  /** Computed flag: TRUE if any signal is severity=critical. */
  hasCriticalIssues: boolean;
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
