// src/components/demo/pipeline-status.tsx
//
// Sub-stage 1.4 — Pipeline progress visualization.
//
// Visual: Calm Frosted. Three Glass rows for the pipeline stages, each
// with a tile (matching dashboard agent-tile pattern) and a state pill.
// When the Sales QuickResponse draft is ready, it renders prominently
// in a deep Glass card with sys-green accent.

"use client";

import {
  CheckCircle2,
  Loader2,
  Circle,
  MinusCircle,
} from "lucide-react";
import { Glass } from "@/components/ui/glass";
import type { DemoStatusResponse } from "@/lib/demo/types";

interface PipelineStatusProps {
  status: DemoStatusResponse | null;
  template: string;
  isComplete: boolean;
}

type StageState = "waiting" | "running" | "done" | "skipped" | "failed";

interface StageInfo {
  label: string;
  caption?: string | null;
  state: StageState;
  emoji: string;
  tileGradient: string;
}

// ─────────────────────────────────────────────────────────────
// State indicator
// ─────────────────────────────────────────────────────────────

function StateIndicator({ state }: { state: StageState }) {
  switch (state) {
    case "running":
      return (
        <Loader2
          className="h-[18px] w-[18px] animate-spin"
          style={{ color: "var(--color-sys-blue)" }}
          aria-hidden
        />
      );
    case "done":
      return (
        <CheckCircle2
          className="h-[18px] w-[18px]"
          style={{ color: "var(--color-sys-green)" }}
          aria-hidden
        />
      );
    case "skipped":
      return (
        <MinusCircle
          className="h-[18px] w-[18px]"
          style={{ color: "var(--color-ink-3)" }}
          aria-hidden
        />
      );
    case "failed":
      return (
        <Circle
          className="h-[18px] w-[18px]"
          style={{ color: "var(--color-sys-pink)" }}
          aria-hidden
        />
      );
    case "waiting":
    default:
      return (
        <Circle
          className="h-[18px] w-[18px]"
          style={{ color: "rgba(15,20,30,0.18)" }}
          aria-hidden
        />
      );
  }
}

// ─────────────────────────────────────────────────────────────
// State chip (small pill next to title)
// ─────────────────────────────────────────────────────────────

function StateChip({ state }: { state: StageState }) {
  const map: Record<
    StageState,
    { label: string; bg: string; fg: string }
  > = {
    waiting: {
      label: "ממתין",
      bg: "rgba(15,20,30,0.05)",
      fg: "var(--color-ink-3)",
    },
    running: {
      label: "פועל",
      bg: "var(--color-sys-blue-soft)",
      fg: "var(--color-sys-blue)",
    },
    done: {
      label: "הסתיים",
      bg: "var(--color-sys-green-soft)",
      fg: "var(--color-sys-green)",
    },
    skipped: {
      label: "דילג",
      bg: "rgba(15,20,30,0.05)",
      fg: "var(--color-ink-3)",
    },
    failed: {
      label: "נכשל",
      bg: "rgba(214,51,108,0.10)",
      fg: "var(--color-sys-pink)",
    },
  };

  const m = map[state];

  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10.5px] font-medium"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Stage row
// ─────────────────────────────────────────────────────────────

function StageRow({ stage }: { stage: StageInfo }) {
  return (
    <Glass className="flex items-center gap-3 p-[14px]">
      <div
        className="agent-tile flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] text-[18px]"
        style={{
          background: stage.tileGradient,
          border: "1px solid rgba(255,255,255,0.9)",
          boxShadow:
            "0 4px 12px rgba(15,20,30,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
        }}
      >
        {stage.emoji}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="text-[14px] font-semibold tracking-tight"
            style={{ color: "var(--color-ink)" }}
          >
            {stage.label}
          </span>
          <StateChip state={stage.state} />
        </div>
        {stage.caption && (
          <p
            className="mt-0.5 text-[12px] leading-[1.5]"
            style={{ color: "var(--color-ink-3)" }}
          >
            {stage.caption}
          </p>
        )}
      </div>

      <div className="flex-shrink-0">
        <StateIndicator state={stage.state} />
      </div>
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function PipelineStatus({ status, isComplete }: PipelineStatusProps) {
  // ─── Watcher stage ─────────────────────────────────────
  const watcherDone =
    status?.watcher.status === "succeeded" || status?.watcher.status === "no_op";
  const watcherStage: StageInfo = {
    label: "Watcher · סיווג ההודעה",
    caption: watcherDone && status?.watcher.cost_ils
      ? `הסתיים · עלות ₪${status.watcher.cost_ils.toFixed(4)}`
      : null,
    state: watcherDone
      ? "done"
      : status?.watcher.status === "failed"
      ? "failed"
      : status?.watcher.status === "running" || (!status?.watcher.status && !isComplete)
      ? "running"
      : "waiting",
    emoji: "🎯",
    // Routine blue tile
    tileGradient:
      "linear-gradient(135deg, rgba(232,239,255,0.95), rgba(225,234,250,0.7))",
  };

  // ─── Hot Leads stage ───────────────────────────────────
  const hlBucket = status?.hot_leads.bucket;
  const hotLeadsStage: StageInfo = {
    label: "Hot Leads · דירוג ליד",
    caption: hlBucket
      ? `${hlBucket}${
          status?.hot_leads.reason ? ` · ${status.hot_leads.reason}` : ""
        }`
      : null,
    state: hlBucket ? "done" : !isComplete ? "running" : "waiting",
    emoji: "🔥",
    // Insight green tile
    tileGradient:
      "linear-gradient(135deg, rgba(238,250,244,0.95), rgba(225,245,235,0.7))",
  };

  // ─── Sales QuickResponse stage ────────────────────────
  const sqrStatus = status?.sales_qr.status;
  let sqrState: StageState;
  let sqrCaption: string | null;

  switch (sqrStatus) {
    case "draft_ready":
      sqrState = "done";
      sqrCaption = "טיוטת תגובה מוכנה לאישור";
      break;
    case "skipped_cold_bucket":
      sqrState = "skipped";
      sqrCaption = "לא חם מספיק — Spike מסמן בלבד, לא מכין טיוטה אוטומטית";
      break;
    case "drafting":
      sqrState = "running";
      sqrCaption = "ליד חם זוהה. Spike כותב טיוטה...";
      break;
    case "pending_classification":
    case null:
    case undefined:
    default:
      sqrState = isComplete ? "waiting" : "running";
      sqrCaption = null;
      break;
  }

  const salesQrStage: StageInfo = {
    label: "Sales · טיוטת תגובה",
    caption: sqrCaption,
    state: sqrState,
    emoji: "💬",
    // Content lilac tile
    tileGradient:
      "linear-gradient(135deg, rgba(248,243,255,0.95), rgba(240,232,250,0.7))",
  };

  return (
    <div className="space-y-3">
      <StageRow stage={watcherStage} />
      <StageRow stage={hotLeadsStage} />
      <StageRow stage={salesQrStage} />

      {/* The draft — featured Glass card with sys-green accent */}
      {sqrState === "done" && status?.sales_qr.message_text && (
        <Glass deep className="mt-4 p-[20px]">
          <div className="flex items-center gap-2">
            <CheckCircle2
              className="h-[16px] w-[16px] flex-shrink-0"
              style={{ color: "var(--color-sys-green)" }}
              aria-hidden
            />
            <span
              className="text-[11px] font-medium uppercase tracking-[0.06em]"
              style={{ color: "var(--color-sys-green)" }}
            >
              הטיוטה ש-Spike הכין
            </span>
          </div>

          <p
            className="mt-3 text-[15px] leading-[1.6]"
            style={{ color: "var(--color-ink)" }}
          >
            {status.sales_qr.message_text}
          </p>

          <p
            className="mt-3 text-[11.5px] leading-[1.5]"
            style={{ color: "var(--color-ink-3)" }}
          >
            ✏️ הבעלים יראה את זה ב-/approvals · יוכל לערוך · ולשלוח. אף פעם לא
            נשלח אוטומטית.
          </p>
        </Glass>
      )}
    </div>
  );
}
