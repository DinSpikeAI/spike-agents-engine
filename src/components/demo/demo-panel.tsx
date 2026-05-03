// src/components/demo/demo-panel.tsx
//
// Sub-stage 1.4 — Demo UI orchestrator.
//
// Visual: Calm Frosted (Direction D) — uses <Glass> primitive, agent-card
// hover utility, section-divider headers, and inline CSS variables for
// colors. Each template card mirrors the agent-card pattern from the
// dashboard but with WhatsApp message-preview semantics.

"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { Glass } from "@/components/ui/glass";
import { runDemoTemplate } from "@/app/dashboard/demo/actions";
import {
  DEMO_TEMPLATES,
  type DemoTemplate,
  type DemoStatusResponse,
} from "@/lib/demo/types";
import { PipelineStatus } from "./pipeline-status";

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;

// ─────────────────────────────────────────────────────────────
// Visual config per template — matches Calm Frosted vocabulary
// (tile gradients + pill colors borrowed from dashboard category metas)
// ─────────────────────────────────────────────────────────────

interface TemplateVisual {
  emoji: string;
  badge: string;
  tileGradient: string;
  pillBg: string;
  pillFg: string;
  outcomeHint: string;
}

const TEMPLATE_VISUALS: Record<DemoTemplate, TemplateVisual> = {
  hot_lead: {
    emoji: "🔥",
    badge: "ליד חם",
    // Warm pink gradient, pulled toward sys-pink
    tileGradient:
      "linear-gradient(135deg, rgba(255,232,235,0.95), rgba(252,218,224,0.75))",
    pillBg: "rgba(214, 51, 108, 0.10)",
    pillFg: "rgba(150, 30, 75, 0.95)",
    outcomeHint: "Spike יזהה דחיפות + תקציב, ויכין טיוטת תגובה תוך שניות",
  },
  question: {
    emoji: "💬",
    badge: "שאלה",
    // Routine blue (matches dashboard's routine category)
    tileGradient:
      "linear-gradient(135deg, rgba(232,239,255,0.95), rgba(225,234,250,0.7))",
    pillBg: "var(--color-cat-routine)",
    pillFg: "var(--color-cat-routine-fg)",
    outcomeHint: "Spike יסמן וימתין שתגיב — לא חם מספיק לטיוטה אוטומטית",
  },
  complaint: {
    emoji: "⚠️",
    badge: "תלונה",
    // Amber-soft gradient, status (warning) tint
    tileGradient:
      "linear-gradient(135deg, rgba(255,247,224,0.95), rgba(252,238,200,0.7))",
    pillBg: "rgba(224, 169, 61, 0.16)",
    pillFg: "rgba(140, 95, 20, 0.95)",
    outcomeHint: "Spike יזהה את התלונה ויעלה אותה לראש ה-feed",
  },
  review: {
    emoji: "👍",
    badge: "ביקורת חיובית",
    // Insight green (matches dashboard's insight category)
    tileGradient:
      "linear-gradient(135deg, rgba(238,250,244,0.95), rgba(225,245,235,0.7))",
    pillBg: "var(--color-cat-insight)",
    pillFg: "var(--color-cat-insight-fg)",
    outcomeHint: "Spike יזהה את ההזדמנות ויציע לבקש ביקורת בגוגל",
  },
};

type FlowState =
  | { kind: "idle" }
  | { kind: "sending"; template: DemoTemplate }
  | {
      kind: "polling";
      template: DemoTemplate;
      eventId: string;
      status: DemoStatusResponse | null;
      startedAt: number;
    }
  | {
      kind: "complete";
      template: DemoTemplate;
      eventId: string;
      status: DemoStatusResponse;
    }
  | { kind: "error"; message: string };

interface DemoPanelProps {
  tenantId: string;
}

// ─────────────────────────────────────────────────────────────
// Section header — matches dashboard pattern exactly
// ─────────────────────────────────────────────────────────────

function SectionHeader({ label, tagline }: { label: string; tagline?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2
        className="text-[17px] font-semibold tracking-[-0.01em]"
        style={{ color: "var(--color-ink)" }}
      >
        {label}
      </h2>
      {tagline && (
        <span
          className="hidden text-[12px] sm:inline"
          style={{ color: "var(--color-ink-3)" }}
        >
          {tagline}
        </span>
      )}
      <div className="section-divider flex-1" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Single message-preview card
// ─────────────────────────────────────────────────────────────

interface MessageCardProps {
  template: DemoTemplate;
  onClick: (template: DemoTemplate) => void;
  isActive: boolean;
  isBusy: boolean;
  variant?: "featured" | "default";
}

function MessageCard({
  template,
  onClick,
  isActive,
  isBusy,
  variant = "default",
}: MessageCardProps) {
  const visual = TEMPLATE_VISUALS[template];
  const config = DEMO_TEMPLATES[template];
  const isFeatured = variant === "featured";

  return (
    <button
      type="button"
      onClick={() => onClick(template)}
      disabled={isBusy}
      className="block w-full text-right disabled:cursor-not-allowed"
    >
      <Glass
        deep={isFeatured}
        className={`agent-card flex flex-col gap-3 ${
          isFeatured ? "p-[20px] sm:p-[24px]" : "p-[14px] sm:p-[18px]"
        } ${isActive ? "ring-2 ring-offset-2 ring-offset-transparent" : ""}`}
      >
        {/* Top row — tile + sender / pill + spinner */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`agent-tile flex flex-shrink-0 items-center justify-center rounded-[12px] ${
                isFeatured ? "h-12 w-12 text-[24px]" : "h-11 w-11 text-[22px]"
              }`}
              style={{
                background: visual.tileGradient,
                border: "1px solid rgba(255,255,255,0.9)",
                boxShadow:
                  "0 4px 12px rgba(15,20,30,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
              }}
            >
              {visual.emoji}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div
                className={`truncate font-semibold tracking-tight ${
                  isFeatured ? "text-[16.5px]" : "text-[15.5px]"
                }`}
                style={{ color: "var(--color-ink)" }}
              >
                {config.contactName}
              </div>
              <div
                className="mt-0.5 text-[11.5px]"
                style={{ color: "var(--color-ink-3)" }}
              >
                דרך WhatsApp
              </div>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {isActive && isBusy && (
              <Loader2
                className="h-4 w-4 animate-spin"
                style={{ color: "var(--color-ink-3)" }}
                aria-hidden
              />
            )}
            <span
              className="rounded-full px-2 py-0.5 text-[10.5px] font-medium"
              style={{
                background: visual.pillBg,
                color: visual.pillFg,
              }}
            >
              {visual.badge}
            </span>
          </div>
        </div>

        {/* Message bubble — WhatsApp incoming style: white, asymmetric corner */}
        <div
          className={`rounded-[var(--radius-lg)] rounded-tr-sm leading-[1.6] ${
            isFeatured ? "px-4 py-3 text-[14.5px]" : "px-3.5 py-2.5 text-[13px]"
          }`}
          style={{
            background: "white",
            border: "1px solid var(--color-hairline)",
            color: "var(--color-ink)",
            boxShadow: "0 1px 2px rgba(15,20,30,0.04)",
          }}
        >
          {config.text}
        </div>
      </Glass>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────

export function DemoPanel({ tenantId: _tenantId }: DemoPanelProps) {
  const [flow, setFlow] = useState<FlowState>({ kind: "idle" });

  const handleTemplateClick = useCallback(async (template: DemoTemplate) => {
    setFlow({ kind: "sending", template });

    try {
      const result = await runDemoTemplate(template);
      if (!result.ok || !result.eventId) {
        setFlow({
          kind: "error",
          message: result.error ?? "שליחת הדמה נכשלה. נסה שוב.",
        });
        return;
      }

      setFlow({
        kind: "polling",
        template,
        eventId: result.eventId,
        status: null,
        startedAt: Date.now(),
      });
    } catch (err) {
      console.error("[DemoPanel] runDemoTemplate failed:", err);
      setFlow({
        kind: "error",
        message: `שגיאה: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }, []);

  // ─── Polling effect ──────────────────────────────────────
  useEffect(() => {
    if (flow.kind !== "polling") return;

    const { eventId, startedAt, template } = flow;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;

      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setFlow((current) => {
          if (current.kind !== "polling" || current.eventId !== eventId) {
            return current;
          }
          return current.status
            ? { kind: "complete", template, eventId, status: current.status }
            : {
                kind: "error",
                message: "Timeout — ה-pipeline לא הסתיים תוך דקה.",
              };
        });
        return;
      }

      try {
        const res = await fetch(
          `/api/demo/status?event_id=${encodeURIComponent(eventId)}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as DemoStatusResponse;

        if (cancelled) return;

        const sqr = data.sales_qr.status;
        const watcherDone =
          data.watcher.status === "succeeded" ||
          data.watcher.status === "failed" ||
          data.watcher.status === "no_op";
        const sqrTerminal = sqr === "draft_ready" || sqr === "skipped_cold_bucket";

        if (watcherDone && sqrTerminal) {
          setFlow({ kind: "complete", template, eventId, status: data });
          return;
        }

        setFlow((current) => {
          if (current.kind !== "polling" || current.eventId !== eventId) {
            return current;
          }
          return { ...current, status: data };
        });
      } catch (err) {
        console.error("[DemoPanel] polling fetch failed:", err);
      }
    };

    tick();
    const intervalId = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [flow]);

  const isBusy = flow.kind === "sending" || flow.kind === "polling";
  const currentTemplate =
    flow.kind === "sending" || flow.kind === "polling" || flow.kind === "complete"
      ? flow.template
      : null;
  const currentStatus =
    flow.kind === "polling" || flow.kind === "complete" ? flow.status : null;

  const handleReset = useCallback(() => {
    setFlow({ kind: "idle" });
  }, []);

  return (
    <div className="space-y-8">
      {/* ═════ Featured: Hot Lead (full-width, deep glass) ═════ */}
      <section>
        <SectionHeader label="ה-magic moment" />
        <MessageCard
          template="hot_lead"
          onClick={handleTemplateClick}
          isActive={currentTemplate === "hot_lead"}
          isBusy={isBusy}
          variant="featured"
        />
      </section>

      {/* ═════ Other 3 templates (3-col grid) ═════ */}
      <section>
        <SectionHeader label="תרחישים נוספים" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["question", "complaint", "review"] as const).map((template) => (
            <MessageCard
              key={template}
              template={template}
              onClick={handleTemplateClick}
              isActive={currentTemplate === template}
              isBusy={isBusy}
            />
          ))}
        </div>
      </section>

      {/* ═════ Pipeline status (during/after run) ═════ */}
      {(flow.kind === "polling" || flow.kind === "complete") && (
        <section>
          <SectionHeader label="ה-pipeline בזמן אמת" />
          <PipelineStatus
            status={currentStatus}
            template={flow.template}
            isComplete={flow.kind === "complete"}
          />
        </section>
      )}

      {/* ═════ Error state ═════ */}
      {flow.kind === "error" && (
        <Glass className="flex items-start gap-3 p-[16px]">
          <AlertCircle
            className="mt-0.5 h-5 w-5 flex-shrink-0"
            style={{ color: "var(--color-sys-pink)" }}
            aria-hidden
          />
          <div className="flex-1">
            <p
              className="text-[13.5px] font-semibold tracking-tight"
              style={{ color: "var(--color-ink)" }}
            >
              משהו השתבש
            </p>
            <p
              className="mt-1 text-[12.5px] leading-[1.55]"
              style={{ color: "var(--color-ink-2)" }}
            >
              {flow.message}
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="mt-3 rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-90"
              style={{
                background: "var(--color-ink)",
                color: "white",
              }}
            >
              נסה שוב
            </button>
          </div>
        </Glass>
      )}

      {/* ═════ Reset CTA (after complete) ═════ */}
      {flow.kind === "complete" && (
        <Glass className="flex items-center justify-between gap-3 px-[18px] py-[14px]">
          <div className="flex items-center gap-2.5">
            <CheckCircle2
              className="h-[18px] w-[18px] flex-shrink-0"
              style={{ color: "var(--color-sys-green)" }}
              aria-hidden
            />
            <span
              className="text-[13px] leading-[1.5]"
              style={{ color: "var(--color-ink-2)" }}
            >
              הטיוטה זמינה לאישור ב-
              <a
                href="/dashboard/approvals"
                className="font-medium underline-offset-2 hover:underline"
                style={{ color: "var(--color-sys-blue)" }}
              >
                /dashboard/approvals
              </a>
            </span>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-90"
            style={{
              background: "var(--color-ink)",
              color: "white",
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            הפעל שוב
          </button>
        </Glass>
      )}
    </div>
  );
}
