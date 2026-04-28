"use client";

import { useState, useMemo } from "react";
import { AGENT_LIST } from "@/lib/agents/config";
import { AgentCard, type AgentCardData } from "./agent-card";
import { AgentDrawer } from "./agent-drawer";
import type { AgentUiStatus } from "./agent-status-pill";

type FilterValue = "all" | "active" | "approval";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "active", label: "פעילים" },
  { value: "approval", label: "דורש אישור" },
];

/** Mock data per agent — Day 4 Stage 3 only.
 * Day 5+ will replace with real data from agent_runs + drafts tables.
 */
function getMockCardData(): AgentCardData[] {
  return AGENT_LIST.map((config) => {
    let status: AgentUiStatus = "idle";
    let pendingCount = 0;
    let metaText: string | undefined;

    // Distribute mock states across agents for visual demo
    if (config.id === "morning") {
      status = "idle";
      metaText = "רץ הבא ב-07:00";
    } else if (config.id === "reviews") {
      status = "approval";
      pendingCount = 3;
    } else if (config.id === "social") {
      status = "approval";
      pendingCount = 1;
    } else if (config.id === "manager") {
      status = "idle";
      metaText = "רץ הבא ב-19:00";
    } else if (config.id === "watcher") {
      status = "running";
    } else if (config.id === "cleanup") {
      status = "no_op";
    } else if (config.id === "sales") {
      status = "done";
      metaText = "הושלם · 10:14";
    } else if (config.id === "inventory") {
      status = "idle";
      metaText = "רץ הבא ב-08:00 מחר";
    } else if (config.id === "hot_leads") {
      status = "running";
    }

    return { config, status, pendingCount, metaText };
  });
}

export function AgentGrid() {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [openAgentId, setOpenAgentId] = useState<string | null>(null);

  const cards = useMemo(getMockCardData, []);

  const filtered = useMemo(() => {
    if (filter === "all") return cards;
    if (filter === "approval") return cards.filter((c) => c.status === "approval");
    if (filter === "active") return cards.filter((c) => c.status !== "no_op" && c.status !== "paused");
    return cards;
  }, [cards, filter]);

  const openAgent = openAgentId ? cards.find((c) => c.config.id === openAgentId) : null;

  return (
    <>
      {/* Section header with title + filters */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-semibold text-white">
          הסוכנים שלך
          <span
            className="inline-flex size-6 items-center justify-center rounded-full text-xs font-bold"
            style={{
              background: "rgba(34, 211, 176, 0.12)",
              color: "var(--spike-teal-light)",
            }}
          >
            {cards.length}
          </span>
        </h2>

        {/* Filter group */}
        <div
          className="inline-flex items-center gap-1 rounded-xl p-1"
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid var(--spike-border)",
          }}
        >
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                style={{
                  background: active ? "rgba(34, 211, 176, 0.12)" : "transparent",
                  color: active ? "var(--spike-teal-light)" : "var(--spike-text-dim)",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((card) => (
          <AgentCard
            key={card.config.id}
            data={card}
            onClick={() => setOpenAgentId(card.config.id)}
          />
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div
          className="rounded-xl px-6 py-12 text-center"
          style={{
            background: "var(--spike-surface)",
            border: "1px solid var(--spike-border)",
          }}
        >
          <div className="text-4xl">🌿</div>
          <p
            className="mt-3 text-sm"
            style={{ color: "var(--spike-text-dim)" }}
          >
            אין סוכנים שמתאימים לסינון הזה
          </p>
        </div>
      )}

      {/* Drawer */}
      {openAgent && (
        <AgentDrawer
          agent={openAgent}
          onClose={() => setOpenAgentId(null)}
        />
      )}
    </>
  );
}
