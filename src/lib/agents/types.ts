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
//
// Shape MUST match MORNING_AGENT_OUTPUT_SCHEMA in ./morning/schema.ts.

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
// Final alerts are sorted: severity asc (critical first), then
// occurredAt desc (newest first within same tier).

export interface WatcherAlert {
  category: WatcherCategory;
  severity: WatcherSeverity;
  /** Hebrew title — what happened (max ~80 chars). */
  title: string;
  /** Hebrew context — why it matters + suggested action (max ~200 chars). */
  context: string;
  /** Hebrew label for the data source (e.g. "Google Reviews"). */
  source: string;
  /** ISO timestamp or human-readable Hebrew like "לפני 12 דקות". */
  occurredAt: string;
}

export interface WatcherAgentOutput {
  /** Sorted by severity, then by occurredAt desc within tier. */
  alerts: WatcherAlert[];
  /** Hebrew summary of what was scanned this run. */
  scanSummary: string;
  /** Data sources that were checked, e.g. ["Google", "Instagram", "Calendar"]. */
  scannedSources: string[];
  /** Total alerts found this run. */
  totalCount: number;
}

// ─────────────────────────────────────────────────────────────
// Generic agent output (placeholder for non-Morning agents)
// ─────────────────────────────────────────────────────────────

export interface GenericAgentOutput {
  summary: string;
  details?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// Mock fixtures (testing only)
// ─────────────────────────────────────────────────────────────

export interface MockBehavior {
  /** Force a specific outcome (for testing edge cases) */
  forceStatus?: RunStatus;
  /** Simulate delay in milliseconds */
  delayMs?: number;
}
