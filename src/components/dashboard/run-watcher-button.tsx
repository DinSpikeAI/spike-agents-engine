"use client";

import { useState, useEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import { triggerWatcherAgentAction } from "@/app/dashboard/actions";
import type {
  WatcherAgentOutput,
  WatcherAlert,
} from "@/lib/agents/types";
import {
  CATEGORY_LABELS_HE,
  SEVERITY_LABELS_HE,
} from "@/lib/agents/watcher/hierarchy";
import { Target, X, AlertTriangle, FlaskConical, Sprout } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Severity styles — Calm Frosted edition (System palette)
// ─────────────────────────────────────────────────────────────
const SEVERITY_STYLES: Record<
  WatcherAlert["severity"],
  { bg: string; border: string; text: string }
> = {
  critical: {
    bg: "rgba(214, 51, 108, 0.08)",
    border: "rgba(214, 51, 108, 0.25)",
    text: "var(--color-sys-pink)",
  },
  high: {
    bg: "rgba(224, 169, 61, 0.10)",
    border: "rgba(224, 169, 61, 0.30)",
    text: "var(--color-sys-amber)",
  },
  medium: {
    bg: "var(--color-sys-blue-soft)",
    border: "rgba(10, 132, 255, 0.25)",
    text: "var(--color-sys-blue)",
  },
  low: {
    bg: "rgba(114, 121, 136, 0.08)",
    border: "rgba(114, 121, 136, 0.20)",
    text: "var(--color-ink-3)",
  },
};

// ─────────────────────────────────────────────────────────────
// Format occurredAt for Hebrew display.
// ─────────────────────────────────────────────────────────────
function formatOccurredAt(s: string): string {
  const ts = Date.parse(s);
  if (!Number.isFinite(ts)) return s;

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
  const [mounted, setMounted] = useState(false);

  // Portal target: only mount on the client. Avoids SSR mismatch.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!output) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [output]);

  // ESC closes modal
  useEffect(() => {
    if (!output) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output]);

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

  // The modal JSX, rendered via portal to escape the parent Glass card's
  // stacking context. Without the portal, sibling cards rendered later in
  // the dashboard grid would paint over the modal regardless of z-index.
  const modal = output && (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      onClick={close}
      dir="rtl"
      style={{
        background: "rgba(15, 22, 32, 0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="סוכן מעקב"
    >
      <div
        className="relative max-h-[88vh] w-full max-w-[560px] overflow-y-auto rounded-[20px]"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          border: "1px solid rgba(255,255,255,0.9)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.6) inset, 0 32px 80px rgba(15,20,30,0.24)",
        }}
      >
        {/* Close button — absolute corner */}
        <button
          onClick={close}
          className="absolute left-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5"
          style={{ color: "var(--color-ink-3)" }}
          aria-label="סגור"
        >
          <X size={16} strokeWidth={2} />
        </button>

        <div className="p-6 pt-7">
          {/* Header — title + subtitle */}
          <div
            className="mb-5 border-b pb-4"
            style={{ borderColor: "var(--color-hairline)" }}
          >
            <h2
              className="mb-1.5 text-[22px] font-bold tracking-[-0.02em]"
              style={{ color: "var(--color-ink)" }}
            >
              סוכן מעקב
            </h2>
            <p
              className="text-[13px] leading-relaxed"
              style={{ color: "var(--color-ink-2)" }}
            >
              {output.scanSummary}
            </p>
            {isMocked && (
              <span
                className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold"
                style={{
                  background: "rgba(224, 169, 61, 0.12)",
                  color: "var(--color-sys-amber)",
                }}
              >
                <FlaskConical size={10} strokeWidth={2} />
                Mock data
              </span>
            )}
          </div>

          {/* No-op state */}
          {isNoOp && (
            <div
              className="rounded-[14px] p-6 text-center"
              style={{
                background: "var(--color-sys-green-soft)",
                border: "1px solid rgba(48, 179, 107, 0.20)",
              }}
            >
              <Sprout
                size={32}
                strokeWidth={1.5}
                className="mx-auto mb-2"
                style={{ color: "var(--color-sys-green)" }}
              />
              <h3
                className="text-[16px] font-semibold"
                style={{ color: "var(--color-sys-green)" }}
              >
                הכל שקט
              </h3>
              <p
                className="mt-1 text-[12.5px]"
                style={{ color: "var(--color-ink-2)" }}
              >
                אין אירועים חדשים שראויים לדיווח.
                {output.scannedSources.length > 0 && (
                  <> נסרקו: {output.scannedSources.join(", ")}.</>
                )}
              </p>
            </div>
          )}

          {/* Hero alert */}
          {hero && (
            <div
              className="mb-4 rounded-[14px] p-4"
              style={{
                background: SEVERITY_STYLES[hero.severity].bg,
                border: `1px solid ${
                  SEVERITY_STYLES[hero.severity].border
                }`,
              }}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    color: SEVERITY_STYLES[hero.severity].text,
                    background: "rgba(255,255,255,0.7)",
                  }}
                >
                  {SEVERITY_LABELS_HE[hero.severity]}
                </span>
                <span
                  className="text-[11px]"
                  style={{ color: "var(--color-ink-3)" }}
                >
                  {CATEGORY_LABELS_HE[hero.category]} · {hero.source} ·{" "}
                  {formatOccurredAt(hero.occurredAt)}
                </span>
              </div>
              <h3
                className="mb-1 text-[16px] font-semibold tracking-tight"
                style={{ color: "var(--color-ink)" }}
              >
                {hero.title}
              </h3>
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: "var(--color-ink-2)" }}
              >
                {hero.context}
              </p>
            </div>
          )}

          {/* Other alerts */}
          {others.length > 0 && (
            <div className="space-y-2">
              <h4
                className="text-[10.5px] font-medium uppercase tracking-wider"
                style={{ color: "var(--color-ink-3)" }}
              >
                עוד {others.length}{" "}
                {others.length === 1 ? "התראה" : "התראות"}
              </h4>
              {others.map((alert, i) => (
                <div
                  key={i}
                  className="rounded-[12px] p-3"
                  style={{
                    background: SEVERITY_STYLES[alert.severity].bg,
                    border: `1px solid ${
                      SEVERITY_STYLES[alert.severity].border
                    }`,
                  }}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold"
                      style={{
                        color: SEVERITY_STYLES[alert.severity].text,
                      }}
                    >
                      {SEVERITY_LABELS_HE[alert.severity]}
                    </span>
                    <span
                      className="text-[10.5px]"
                      style={{ color: "var(--color-ink-3)" }}
                    >
                      {CATEGORY_LABELS_HE[alert.category]} · {alert.source} ·{" "}
                      {formatOccurredAt(alert.occurredAt)}
                    </span>
                  </div>
                  <p
                    className="text-[13px] font-medium"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {alert.title}
                  </p>
                  <p
                    className="mt-0.5 text-[11.5px] leading-relaxed"
                    style={{ color: "var(--color-ink-2)" }}
                  >
                    {alert.context}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div
            className="mt-6 flex items-center justify-between gap-3 border-t pt-4"
            style={{ borderColor: "var(--color-hairline)" }}
          >
            <span
              className="text-[12.5px]"
              style={{ color: "var(--color-ink-3)" }}
            >
              {output.totalCount > 0
                ? `סה"כ ${output.totalCount} ${
                    output.totalCount === 1 ? "התראה" : "התראות"
                  }`
                : `נסרקו ${output.scannedSources.length} מקורות`}
            </span>
            <button
              onClick={close}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-[13px] font-medium text-white transition-all"
              style={{
                background: "var(--color-sys-blue)",
                boxShadow: "var(--shadow-cta)",
              }}
            >
              סגור
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-medium text-white transition-all disabled:opacity-50"
        style={{
          background: "var(--color-sys-blue)",
          boxShadow: "var(--shadow-cta)",
        }}
      >
        {isPending ? (
          <>
            <span
              className="inline-block h-3 w-3 rounded-full border-2 border-white border-t-transparent"
              style={{ animation: "spin 0.8s linear infinite" }}
              aria-hidden="true"
            />
            סורק...
          </>
        ) : (
          <>
            <Target size={13} strokeWidth={1.75} />
            הרץ עכשיו
          </>
        )}
      </button>

      {error && (
        <div
          className="mt-3 flex items-start gap-2 rounded-[10px] px-3 py-2 text-[12.5px]"
          style={{
            background: "rgba(214, 51, 108, 0.08)",
            border: "1px solid rgba(214, 51, 108, 0.20)",
            color: "var(--color-sys-pink)",
          }}
        >
          <AlertTriangle
            size={14}
            strokeWidth={2}
            className="mt-0.5 flex-shrink-0"
          />
          <span>{error}</span>
        </div>
      )}

      {/* Render the modal via portal so it escapes the Glass card's stacking context */}
      {mounted && modal && createPortal(modal, document.body)}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
