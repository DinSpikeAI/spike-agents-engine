"use client";

import { useState, useTransition } from "react";
import { triggerMorningAgentAction } from "@/app/dashboard/actions";
import type { MorningAgentOutput } from "@/lib/agents/types";
import {
  Sun,
  X,
  Check,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  Lightbulb,
  Calendar,
  FlaskConical,
} from "lucide-react";

export function RunMorningButton() {
  const [isPending, startTransition] = useTransition();
  const [output, setOutput] = useState<MorningAgentOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMocked, setIsMocked] = useState(false);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await triggerMorningAgentAction();
      if (res.success && res.result?.output) {
        setOutput(res.result.output);
        setIsMocked(res.result.isMocked);
      } else {
        setError(res.error ?? "משהו השתבש");
      }
    });
  };

  return (
    <>
      {/* Trigger button */}
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
            הסוכן עובד...
          </>
        ) : (
          <>
            <Sun size={13} strokeWidth={1.75} />
            הרץ עכשיו
          </>
        )}
      </button>

      {/* Error toast */}
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

      {/* Output modal */}
      {output && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setOutput(null)}
          style={{
            background: "rgba(15, 22, 32, 0.45)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[18px] p-6"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
            style={{
              background: "var(--color-glass-deep)",
              backdropFilter: "blur(40px) saturate(180%)",
              WebkitBackdropFilter: "blur(40px) saturate(180%)",
              border: "1px solid var(--color-hairline-s)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.6) inset, 0 24px 60px rgba(15,20,30,0.18)",
            }}
          >
            {/* Header */}
            <div
              className="mb-4 flex items-start justify-between border-b pb-4"
              style={{ borderColor: "var(--color-hairline)" }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[12px]"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(245,247,252,0.7))",
                    border: "1px solid rgba(255,255,255,0.9)",
                    boxShadow:
                      "0 4px 12px rgba(15,20,30,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
                  }}
                >
                  <Sun
                    size={18}
                    strokeWidth={1.75}
                    style={{ color: "var(--color-sys-amber)" }}
                  />
                </div>
                <div>
                  <h2
                    className="text-[20px] font-bold tracking-tight"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {output.greeting}
                  </h2>
                  {isMocked && (
                    <span
                      className="mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold"
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
              </div>
              <button
                onClick={() => setOutput(null)}
                className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                style={{ color: "var(--color-ink-3)" }}
                aria-label="סגור"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            {/* Headline */}
            <p
              className="mb-4 text-[16px] font-semibold leading-snug"
              style={{ color: "var(--color-ink)" }}
            >
              {output.headline}
            </p>

            {/* Yesterday metrics */}
            {output.yesterdayMetrics.revenue != null && (
              <div
                className="mb-4 rounded-[14px] p-4"
                style={{
                  background: "rgba(255,255,255,0.5)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                <h3
                  className="mb-2 flex items-center gap-1.5 text-[12px] font-medium"
                  style={{ color: "var(--color-ink-3)" }}
                >
                  <TrendingUp size={12} strokeWidth={1.75} />
                  אתמול
                </h3>
                <div
                  className="text-[24px] font-bold tracking-[-0.02em]"
                  style={{ color: "var(--color-ink)" }}
                >
                  ₪{output.yesterdayMetrics.revenue.toLocaleString("he-IL")}
                </div>
                {output.yesterdayMetrics.sameWeekdayCompare && (
                  <div
                    className="mt-1 text-[12px]"
                    style={{ color: "var(--color-sys-green)" }}
                  >
                    {output.yesterdayMetrics.sameWeekdayCompare}
                  </div>
                )}
              </div>
            )}

            {/* Things completed */}
            {output.thingsCompleted.length > 0 && (
              <div className="mb-4">
                <h3
                  className="mb-2 flex items-center gap-1.5 text-[12px] font-medium"
                  style={{ color: "var(--color-ink-3)" }}
                >
                  <CheckCircle2 size={12} strokeWidth={1.75} />
                  מה הסוכנים סיימו
                </h3>
                <ul className="space-y-1">
                  {output.thingsCompleted.map((item, i) => (
                    <li
                      key={i}
                      className="text-[13px] leading-relaxed"
                      style={{ color: "var(--color-ink-2)" }}
                    >
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Insights */}
            {output.insights.length > 0 && (
              <div
                className="mb-4 rounded-[14px] p-4"
                style={{
                  background: "rgba(224, 169, 61, 0.06)",
                  border: "1px solid rgba(224, 169, 61, 0.20)",
                }}
              >
                <h3
                  className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold"
                  style={{ color: "var(--color-sys-amber)" }}
                >
                  <Lightbulb size={12} strokeWidth={1.75} />
                  תובנות חכמות
                </h3>
                <ul className="space-y-2">
                  {output.insights.map((item, i) => (
                    <li
                      key={i}
                      className="text-[13px] leading-relaxed"
                      style={{ color: "var(--color-ink)" }}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Today's schedule */}
            {output.todaysSchedule.length > 0 && (
              <div className="mb-4">
                <h3
                  className="mb-2 flex items-center gap-1.5 text-[12px] font-medium"
                  style={{ color: "var(--color-ink-3)" }}
                >
                  <Calendar size={12} strokeWidth={1.75} />
                  לוח הזמנים היום
                </h3>
                <ul className="space-y-1">
                  {output.todaysSchedule.map((item, i) => (
                    <li
                      key={i}
                      className="text-[13px] leading-relaxed"
                      style={{ color: "var(--color-ink-2)" }}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Footer */}
            <div
              className="mt-6 flex items-center justify-between border-t pt-4"
              style={{ borderColor: "var(--color-hairline)" }}
            >
              <span
                className="text-[12.5px]"
                style={{ color: "var(--color-ink-3)" }}
              >
                {output.thingsNeedingApproval > 0
                  ? `${output.thingsNeedingApproval} פריטים מחכים לאישור`
                  : "אין פריטים שמחכים"}
              </span>
              <button
                onClick={() => setOutput(null)}
                className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-[13px] font-medium text-white transition-all"
                style={{
                  background: "var(--color-sys-blue)",
                  boxShadow: "var(--shadow-cta)",
                }}
              >
                <Check size={13} strokeWidth={2} />
                {output.callToAction || "בסדר"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
