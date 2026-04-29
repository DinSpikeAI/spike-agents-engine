"use client";

import { useState, useTransition } from "react";
import { triggerWatcherAgentAction } from "@/app/dashboard/actions";
import type {
  WatcherAgentOutput,
  WatcherAlert,
} from "@/lib/agents/types";
import {
  CATEGORY_LABELS_HE,
  SEVERITY_LABELS_HE,
} from "@/lib/agents/watcher/hierarchy";

// ─────────────────────────────────────────────────────────────
// Color per severity tier — follows 06_BRAND_VOICE: no pure red.
// ─────────────────────────────────────────────────────────────
const SEVERITY_STYLES: Record<
  WatcherAlert["severity"],
  { bg: string; border: string; text: string }
> = {
  critical: {
    bg: "rgba(255, 164, 181, 0.10)",   // blush
    border: "rgba(255, 164, 181, 0.40)",
    text: "#FFA4B5",
  },
  high: {
    bg: "rgba(252, 211, 77, 0.10)",    // amber
    border: "rgba(252, 211, 77, 0.40)",
    text: "#FDE68A",
  },
  medium: {
    bg: "rgba(91, 208, 242, 0.10)",    // cyan
    border: "rgba(91, 208, 242, 0.30)",
    text: "#7DD3FC",
  },
  low: {
    bg: "rgba(148, 163, 184, 0.08)",
    border: "rgba(148, 163, 184, 0.20)",
    text: "#CBD5E1",
  },
};

// ─────────────────────────────────────────────────────────────
// Format occurredAt for Hebrew display.
// If ISO 8601 → relative ("לפני 25 דק'", "לפני 2 שעות", "אתמול 14:50",
// or full date for older). If non-ISO (LLM already formatted) → return as-is.
// ─────────────────────────────────────────────────────────────
function formatOccurredAt(s: string): string {
  const ts = Date.parse(s);
  if (!Number.isFinite(ts)) return s; // not ISO — show whatever the LLM returned

  const now = Date.now();
  const diffMs = now - ts;
  const diffMin = Math.round(diffMs / (60 * 1000));
  const diffHr = Math.round(diffMs / (60 * 60 * 1000));
  const diffDay = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (diffMin < 1) return "ממש עכשיו";
  if (diffMin < 60) return `לפני ${diffMin} דק'`;
  if (diffHr < 24) return `לפני ${diffHr} ${diffHr === 1 ? "שעה" : "שעות"}`;
  if (diffDay === 1) {
    const time = new Date(ts).toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `אתמול ${time}`;
  }
  if (diffDay < 7) return `לפני ${diffDay} ימים`;
  return new Date(ts).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
  });
}

// ─────────────────────────────────────────────────────────────

export function RunWatcherButton() {
  const [isPending, startTransition] = useTransition();
  const [output, setOutput] = useState<WatcherAgentOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMocked, setIsMocked] = useState(false);
  const [isNoOp, setIsNoOp] = useState(false);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await triggerWatcherAgentAction();
      if (res.success && res.result) {
        setOutput(res.result.output);
        setIsMocked(res.result.isMocked);
        setIsNoOp(res.result.status === "no_op");
      } else {
        setError(res.error ?? "משהו השתבש");
      }
    });
  };

  const close = () => {
    setOutput(null);
    setIsNoOp(false);
  };

  const hero = output && output.alerts.length > 0 ? output.alerts[0] : null;
  const others = output?.alerts.slice(1) ?? [];

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 transition-all hover:bg-teal-400 disabled:opacity-50"
      >
        {isPending ? "🔄 סורק..." : "🎯 הרץ סוכן מעקב עכשיו"}
      </button>

      {error && (
        <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
          ⚠️ {error}
        </div>
      )}

      {output && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={close}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Header */}
            <div className="mb-4 flex items-start justify-between border-b border-slate-700 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-teal-300">
                  🎯 סוכן מעקב
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {output.scanSummary}
                </p>
                {isMocked && (
                  <span className="mt-2 inline-block rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                    🧪 Mock data
                  </span>
                )}
              </div>
              <button
                onClick={close}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                aria-label="סגור"
              >
                ✕
              </button>
            </div>

            {/* No-op state — clean halt, not a failure */}
            {isNoOp && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
                <div className="mb-2 text-4xl">🌿</div>
                <h3 className="text-lg font-semibold text-emerald-300">
                  הכל שקט
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  אין אירועים חדשים שראויים לדיווח.
                  {output.scannedSources.length > 0 && (
                    <>
                      {" "}נסרקו: {output.scannedSources.join(", ")}.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Hero alert (top of stack) */}
            {hero && (
              <div
                className="mb-4 rounded-lg p-4"
                style={{
                  background: SEVERITY_STYLES[hero.severity].bg,
                  border: `1px solid ${SEVERITY_STYLES[hero.severity].border}`,
                }}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-md px-2 py-0.5 text-xs font-semibold"
                    style={{
                      color: SEVERITY_STYLES[hero.severity].text,
                      background: SEVERITY_STYLES[hero.severity].bg,
                      border: `1px solid ${SEVERITY_STYLES[hero.severity].border}`,
                    }}
                  >
                    {SEVERITY_LABELS_HE[hero.severity]}
                  </span>
                  <span className="text-xs text-slate-400">
                    {CATEGORY_LABELS_HE[hero.category]} · {hero.source} ·{" "}
                    {formatOccurredAt(hero.occurredAt)}
                  </span>
                </div>
                <h3 className="mb-1 text-lg font-semibold text-slate-100">
                  {hero.title}
                </h3>
                <p className="text-sm text-slate-300">{hero.context}</p>
              </div>
            )}

            {/* Other alerts */}
            {others.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  עוד {others.length}{" "}
                  {others.length === 1 ? "התראה" : "התראות"}
                </h4>
                {others.map((alert, i) => (
                  <div
                    key={i}
                    className="rounded-lg p-3"
                    style={{
                      background: SEVERITY_STYLES[alert.severity].bg,
                      border: `1px solid ${SEVERITY_STYLES[alert.severity].border}`,
                    }}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-xs font-medium"
                        style={{ color: SEVERITY_STYLES[alert.severity].text }}
                      >
                        {SEVERITY_LABELS_HE[alert.severity]}
                      </span>
                      <span className="text-xs text-slate-500">
                        {CATEGORY_LABELS_HE[alert.category]} · {alert.source} ·{" "}
                        {formatOccurredAt(alert.occurredAt)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-200">
                      {alert.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {alert.context}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="mt-6 flex items-center justify-between border-t border-slate-700 pt-4">
              <span className="text-sm text-slate-400">
                {output.totalCount > 0
                  ? `סה"כ ${output.totalCount} ${output.totalCount === 1 ? "התראה" : "התראות"} · נסרקו ${output.scannedSources.length} מקורות`
                  : `נסרקו ${output.scannedSources.length} מקורות`}
              </span>
              <button
                onClick={close}
                className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-teal-400"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
