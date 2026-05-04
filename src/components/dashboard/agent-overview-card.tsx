"use client";

// src/components/dashboard/agent-overview-card.tsx
//
// Sub-stage 1.8 — Single agent card on /dashboard/agents.
//
// Shows emoji + name + role + description (from agents/config.ts) plus
// activity stats (last run, monthly count) and the agent's existing Run
// button (we reuse the same components the dashboard page uses).
//
// Design: Glass card with agent-card hover utility, mirrors the dashboard
// agent grid pattern from src/app/dashboard/page.tsx.

import { Glass } from "@/components/ui/glass";
import { AGENTS } from "@/lib/agents/config";
import type { AgentId } from "@/lib/agents/types";
import { CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";

// We reuse the existing run buttons. They're all client components.
import { RunMorningButton } from "./run-morning-button";
import { RunWatcherButton } from "./run-watcher-button";
import { RunReviewsButton } from "./run-reviews-button";
import { RunHotLeadsButton } from "./run-hot-leads-button";
import { RunManagerButton } from "./run-manager-button";
import { RunSocialButton } from "./run-social-button";
import { RunSalesButton } from "./run-sales-button";
import { RunInventoryButton } from "./run-inventory-button";

// Type for the manager lock state — needs to match RunManagerButton's prop.
// We accept it as `unknown` and pass through, since we don't manipulate it.
interface AgentOverviewCardProps {
  agentId: AgentId;
  lastRunAt: string | null;
  lastStatus: "succeeded" | "failed" | "running" | "no_op" | null;
  monthlyRunCount: number;
  // Passed straight to RunManagerButton; opaque to this component.
  managerLockState: React.ComponentProps<typeof RunManagerButton>["lockState"];
}

/**
 * Format an ISO timestamp into a Hebrew "time ago" string.
 * Mirrors formatTimeAgoHe in src/lib/agents/overview.ts but inlined here
 * because that file is "server-only".
 */
function formatTimeAgoHe(iso: string | null): string {
  if (!iso) return "לא רץ עדיין";

  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "לא ידוע";

  const now = Date.now();
  const diffMs = now - ts;
  const diffMin = Math.round(diffMs / (60 * 1000));
  const diffHr = Math.round(diffMs / (60 * 60 * 1000));
  const diffDay = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (diffMin < 1) return "ממש עכשיו";
  if (diffMin < 60) return `לפני ${diffMin} דק׳`;
  if (diffHr < 24) return `לפני ${diffHr} ${diffHr === 1 ? "שעה" : "שעות"}`;
  if (diffDay === 1) {
    const time = new Date(ts).toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jerusalem",
    });
    return `אתמול ${time}`;
  }
  if (diffDay < 7) return `לפני ${diffDay} ימים`;
  return new Date(ts).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jerusalem",
  });
}

/**
 * Compute the "X runs this month" string, with proper Hebrew pluralization.
 * 0 → "לא רץ עדיין"
 * 1 → "ריצה אחת החודש"
 * 2 → "2 ריצות החודש"
 * etc.
 */
function formatMonthlyCountHe(n: number): string {
  if (n === 0) return "לא רץ עדיין";
  if (n === 1) return "ריצה אחת החודש";
  return `${n} ריצות החודש`;
}

/**
 * Map last status to icon + color. Used as a small badge next to the
 * "last run" line.
 */
function getStatusVisual(status: AgentOverviewCardProps["lastStatus"]) {
  switch (status) {
    case "succeeded":
      return {
        Icon: CheckCircle2,
        color: "var(--color-sys-green)",
        label: "הצליח",
      };
    case "failed":
      return {
        Icon: AlertCircle,
        color: "var(--color-sys-pink)",
        label: "נכשל",
      };
    case "running":
      return {
        Icon: Loader2,
        color: "var(--color-sys-blue)",
        label: "רץ עכשיו",
      };
    case "no_op":
      return {
        Icon: CheckCircle2,
        color: "var(--color-ink-3)",
        label: "לא נדרש",
      };
    default:
      return null;
  }
}

export function AgentOverviewCard({
  agentId,
  lastRunAt,
  lastStatus,
  monthlyRunCount,
  managerLockState,
}: AgentOverviewCardProps) {
  const config = AGENTS[agentId];
  if (!config) return null;

  const lastRunStr = formatTimeAgoHe(lastRunAt);
  const monthlyStr = formatMonthlyCountHe(monthlyRunCount);
  const statusVisual = getStatusVisual(lastStatus);

  // Pick the right Run button per agent.
  const RunButton = (() => {
    switch (agentId) {
      case "morning":
        return <RunMorningButton />;
      case "watcher":
        return <RunWatcherButton />;
      case "reviews":
        return <RunReviewsButton />;
      case "hot_leads":
        return <RunHotLeadsButton />;
      case "manager":
        return <RunManagerButton lockState={managerLockState} />;
      case "social":
        return <RunSocialButton />;
      case "sales":
        return <RunSalesButton />;
      case "inventory":
        return <RunInventoryButton />;
      default:
        return null;
    }
  })();

  return (
    <Glass className="agent-card flex flex-col gap-2.5 p-[14px] sm:p-[18px]">
      {/* Top row: emoji tile + role badge */}
      <div className="flex items-start justify-between">
        <div
          className="agent-tile flex h-11 w-11 items-center justify-center rounded-[12px] text-[22px]"
          style={{
            background: config.gradient,
            border: "1px solid rgba(255,255,255,0.9)",
            boxShadow:
              "0 4px 12px rgba(15,20,30,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
          }}
        >
          {config.emoji}
        </div>
      </div>

      {/* Name + schedule */}
      <div>
        <div
          className="text-[15.5px] font-semibold tracking-tight"
          style={{ color: "var(--color-ink)" }}
        >
          {config.name}
        </div>
        <div
          className="mt-0.5 text-[11.5px]"
          style={{ color: "var(--color-ink-3)" }}
        >
          {config.schedule}
        </div>
      </div>

      {/* Description */}
      <div
        className="text-[12.5px] leading-[1.55]"
        style={{ color: "var(--color-ink-2)" }}
      >
        {config.description}
      </div>

      {/* Activity stats */}
      <div
        className="flex flex-col gap-1.5 rounded-[10px] px-3 py-2.5"
        style={{
          background: "rgba(255,255,255,0.5)",
          border: "1px solid var(--color-hairline)",
        }}
      >
        {/* Last run */}
        <div className="flex items-center gap-2 text-[12px]">
          <Clock
            size={12}
            strokeWidth={1.75}
            style={{ color: "var(--color-ink-3)" }}
          />
          <span style={{ color: "var(--color-ink-2)" }}>ריצה אחרונה:</span>
          <span
            className="font-medium"
            style={{ color: "var(--color-ink)" }}
          >
            {lastRunStr}
          </span>
          {statusVisual && (
            <statusVisual.Icon
              size={11}
              strokeWidth={2}
              className={lastStatus === "running" ? "animate-spin" : ""}
              style={{ color: statusVisual.color, marginInlineStart: "auto" }}
              aria-label={statusVisual.label}
            />
          )}
        </div>

        {/* Monthly count */}
        <div className="text-[12px]" style={{ color: "var(--color-ink-2)" }}>
          <span
            className="font-medium"
            style={{ color: "var(--color-ink)" }}
          >
            {monthlyStr}
          </span>
        </div>
      </div>

      {/* Run button */}
      <div className="mt-auto pt-2.5">{RunButton}</div>
    </Glass>
  );
}
