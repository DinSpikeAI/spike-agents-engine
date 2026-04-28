"use client";

import type { AgentConfig } from "@/lib/agents/config";
import { AgentStatusPill, type AgentUiStatus } from "./agent-status-pill";

export interface AgentCardData {
  config: AgentConfig;
  status: AgentUiStatus;
  pendingCount: number;
  /** e.g. "רץ הבא בעוד 14:32" or "הושלם · 08:01" */
  metaText?: string;
}

interface AgentCardProps {
  data: AgentCardData;
  onClick?: () => void;
}

export function AgentCard({ data, onClick }: AgentCardProps) {
  const { config, status, pendingCount, metaText } = data;
  const isApproval = status === "approval" && pendingCount > 0;

  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-xl p-5 text-right transition-all hover:-translate-y-0.5"
      style={{
        background: isApproval
          ? "linear-gradient(180deg, rgba(252, 211, 77, 0.04), var(--spike-bg-2))"
          : "linear-gradient(180deg, var(--spike-surface), var(--spike-bg-2))",
        border: isApproval
          ? "1px solid rgba(252, 211, 77, 0.18)"
          : "1px solid var(--spike-border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = isApproval
          ? "rgba(252, 211, 77, 0.3)"
          : "rgba(34, 211, 176, 0.25)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isApproval
          ? "rgba(252, 211, 77, 0.18)"
          : "var(--spike-border)";
      }}
    >
      {/* Pending badge in top-end corner */}
      {isApproval && (
        <span
          className="absolute top-3 text-[10px] font-bold"
          style={{
            insetInlineStart: 12,
            background: "var(--spike-amber)",
            color: "#07111A",
            padding: "3px 9px",
            borderRadius: "999px",
          }}
        >
          {pendingCount} ממתינים
        </span>
      )}

      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex size-11 flex-shrink-0 items-center justify-center rounded-xl text-xl"
            style={{ background: config.gradient }}
          >
            {config.emoji}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-white truncate">{config.name}</h3>
            <div
              className="mt-0.5 flex items-center gap-1 text-[11px]"
              style={{ color: "var(--spike-text-mute)" }}
            >
              <span>⏰</span>
              <span className="truncate">{config.schedule}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <p
        className="mb-4 text-sm leading-relaxed"
        style={{ color: "var(--spike-text-dim)" }}
      >
        {config.description}
      </p>

      {/* Foot: status + open chat */}
      <div className="flex items-center justify-between gap-2">
        <AgentStatusPill status={status} pendingCount={pendingCount} />
        <span
          className="text-xs font-medium transition-all group-hover:-translate-x-0.5"
          style={{ color: "var(--spike-text-dim)" }}
        >
          פתח שיחה ←
        </span>
      </div>

      {/* Meta line under foot if exists */}
      {metaText && (
        <div
          className="mt-2 text-[11px]"
          style={{ color: "var(--spike-text-mute)" }}
        >
          {metaText}
        </div>
      )}
    </button>
  );
}
