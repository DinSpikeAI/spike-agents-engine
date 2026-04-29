/**
 * Spike Engine — Agent Infrastructure Types
 *
 * These types define the contract shared by all 9 agents.
 * Built once, used 9 times.
 */

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
// If you change this, update the schema in the same commit.

export interface MorningAgentOutput {
  /** "בוקר טוב, [שם]" — agent always greets as morning regardless of trigger time */
  greeting: string;
  /** One-sentence headline for today */
  headline: string;
  yesterdayMetrics: {
    revenue: number | null;
    revenueChangePercent: number | null;
    sameWeekdayCompare: string | null;
  };
  /** 2-3 items completed yesterday by the agents */
  thingsCompleted: string[];
  /** Count of items waiting for owner approval */
  thingsNeedingApproval: number;
  /** 1-3 actionable insights */
  insights: string[];
  /** Today's schedule, time-prefixed strings */
  todaysSchedule: string[];
  /** One specific action for today */
  callToAction: string;
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
