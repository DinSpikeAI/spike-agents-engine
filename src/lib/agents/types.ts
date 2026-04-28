/**
 * Spike Engine — Agent Infrastructure Types
 *
 * These types define the contract shared by all 9 agents.
 * Built once, used 9 times.
 *
 * NOTE: This is the MOCK phase (Day 3). Anthropic SDK integration comes Day 4.
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
}

export interface RunResult<T = unknown> {
  runId: string;
  status: RunStatus;
  output: T | null;
  error?: string;
  costEstimateIls: number;     // Pre-call estimate in ILS
  costActualIls: number | null; // Post-call actual (null if mocked)
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  startedAt: string;            // ISO
  finishedAt: string | null;    // ISO
  isMocked: boolean;            // TRUE during Day 3
}

// ─────────────────────────────────────────────────────────────
// Morning Agent specific output
// ─────────────────────────────────────────────────────────────

export interface MorningAgentOutput {
  greeting: string;             // "בוקר טוב, [שם]"
  headline: string;             // הכותרת הראשית של היום
  yesterdayMetrics: {
    revenue?: number;
    revenueChangePercent?: number;
    sameWeekdayCompare?: string;
  };
  thingsCompleted: string[];    // מה הסוכנים סיימו אתמול
  thingsNeedingApproval: number;
  insights: string[];           // 1-3 תובנות חכמות
  todaysSchedule: string[];     // לוח זמנים להיום
  callToAction: string;
}

// ─────────────────────────────────────────────────────────────
// Generic agent output (for non-Morning agents, future)
// ─────────────────────────────────────────────────────────────

export interface GenericAgentOutput {
  summary: string;
  details?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// Mock fixtures (Day 3 only — removed in Day 4)
// ─────────────────────────────────────────────────────────────

export interface MockBehavior {
  /** Force a specific outcome (for testing edge cases) */
  forceStatus?: RunStatus;
  /** Simulate delay in milliseconds */
  delayMs?: number;
}
