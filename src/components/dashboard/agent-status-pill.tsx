"use client";

import type { RunStatus } from "@/lib/agents/types";

/** Extended status that includes UI-level states beyond RunStatus */
export type AgentUiStatus =
  | "idle"           // פעיל - waiting for next scheduled run
  | "running"        // בעבודה - executing now
  | "approval"       // דורש אישור - drafts pending
  | "done"           // הושלם - just finished
  | "no_op"          // אין מה לעשות 🌿 - safely halted
  | "failed"         // נכשל - errored (calm tone, NOT alarming)
  | "paused";        // מושהה

interface StatusConfig {
  label: string;
  color: string;
  background: string;
  border?: string;
  emoji?: string;
  animate?: "pulse" | "spin" | "none";
}

const STATUS_CONFIG: Record<AgentUiStatus, StatusConfig> = {
  idle: {
    label: "פעיל",
    color: "var(--spike-text-mute)",
    background: "rgba(148, 163, 184, 0.08)",
  },
  running: {
    label: "בעבודה",
    color: "var(--spike-teal)",
    background: "rgba(34, 211, 176, 0.12)",
    animate: "pulse",
  },
  approval: {
    label: "דורש אישור",
    color: "var(--spike-amber)",
    background: "rgba(252, 211, 77, 0.12)",
    border: "rgba(252, 211, 77, 0.25)",
  },
  done: {
    label: "הושלם",
    color: "var(--spike-teal-deep)",
    background: "rgba(20, 184, 166, 0.1)",
  },
  no_op: {
    label: "אין מה לעשות",
    color: "var(--spike-text-mute)",
    background: "transparent",
    border: "rgba(148, 163, 184, 0.2)",
    emoji: "🌿",
  },
  failed: {
    // Calm concern — NEVER alarming red
    label: "נכשל",
    color: "#FCA5A5",
    background: "rgba(252, 165, 165, 0.08)",
  },
  paused: {
    label: "מושהה",
    color: "var(--spike-text-dim)",
    background: "rgba(148, 163, 184, 0.06)",
  },
};

export interface AgentStatusPillProps {
  status: AgentUiStatus;
  /** Optional pending count (for approval state) */
  pendingCount?: number;
  /** Show a small indicator dot before the label */
  showDot?: boolean;
}

export function AgentStatusPill({ status, pendingCount, showDot = true }: AgentStatusPillProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium"
      style={{
        color: config.color,
        background: config.background,
        border: config.border ? `1px dashed ${config.border}` : "none",
      }}
    >
      {showDot && status !== "no_op" && (
        <span
          className={config.animate === "pulse" ? "spike-pulse-dot" : ""}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: config.color,
            display: "inline-block",
          }}
        />
      )}
      {config.emoji && <span>{config.emoji}</span>}
      <span>
        {status === "approval" && pendingCount
          ? `${config.label} · ${pendingCount}`
          : config.label}
      </span>
    </span>
  );
}

/** Convert backend RunStatus → UI display status */
export function runStatusToUi(runStatus: RunStatus | null | undefined, pending?: number): AgentUiStatus {
  if (!runStatus) return "idle";
  if (runStatus === "running") return "running";
  if (runStatus === "succeeded" && pending && pending > 0) return "approval";
  if (runStatus === "succeeded") return "done";
  if (runStatus === "no_op") return "no_op";
  if (runStatus === "failed") return "failed";
  return "idle";
}
