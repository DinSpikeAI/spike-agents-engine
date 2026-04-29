"use client";

import { useState, useTransition } from "react";
import { triggerMorningAgentAction } from "@/app/dashboard/actions";
import type { MorningAgentOutput } from "@/lib/agents/types";

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
        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 transition-all hover:bg-teal-400 disabled:opacity-50"
      >
        {isPending ? "🔄 הסוכן עובד..." : "▶️ הרץ סוכן בוקר עכשיו"}
      </button>

      {/* Error toast */}
      {error && (
        <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
          ⚠️ {error}
        </div>
      )}

      {/* Output modal */}
      {output && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOutput(null)}
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
                  ☀️ {output.greeting}
                </h2>
                {isMocked && (
                  <span className="mt-1 inline-block rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                    🧪 Mock data — Day 3
                  </span>
                )}
              </div>
              <button
                onClick={() => setOutput(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                aria-label="סגור"
              >
                ✕
              </button>
            </div>

            {/* Headline */}
            <p className="mb-4 text-lg font-semibold text-slate-100">
              {output.headline}
            </p>

            {/* Yesterday metrics */}
            {output.yesterdayMetrics?.revenue !== undefined && (
              <div className="mb-4 rounded-lg bg-slate-800/50 p-4">
                <h3 className="mb-2 text-sm font-medium text-slate-400">
                  אתמול
                </h3>
                <div className="text-2xl font-bold text-teal-300">
                  ₪{output.yesterdayMetrics.revenue.toLocaleString("he-IL")}
                </div>
                {output.yesterdayMetrics.sameWeekdayCompare && (
                  <div className="mt-1 text-sm text-emerald-400">
                    {output.yesterdayMetrics.sameWeekdayCompare}
                  </div>
                )}
              </div>
            )}

            {/* Things completed */}
            {output.thingsCompleted?.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-sm font-medium text-slate-400">
                  ✅ מה הסוכנים סיימו
                </h3>
                <ul className="space-y-1">
                  {(Array.isArray(output.thingsCompleted) ? output.thingsCompleted : output.thingsCompleted.split("\n").filter(Boolean)).map((item, i) => (
                    <li key={i} className="text-sm text-slate-200">
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Insights */}
            {output.insights?.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <h3 className="mb-2 text-sm font-medium text-amber-300">
                  💡 תובנות חכמות
                </h3>
                <ul className="space-y-2">
                  {(Array.isArray(output.insights) ? output.insights : output.insights.split("\n").filter(Boolean)).map((item, i) => (
                    <li key={i} className="text-sm text-slate-200">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Today's schedule */}
            {output.todaysSchedule?.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-sm font-medium text-slate-400">
                  📅 לוח הזמנים היום
                </h3>
                <ul className="space-y-1">
                  {(Array.isArray(output.todaysSchedule) ? output.todaysSchedule : output.todaysSchedule.split("\n").filter(Boolean)).map((item, i) => (
                    <li key={i} className="text-sm text-slate-200">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* CTA + needs approval */}
            <div className="mt-6 flex items-center justify-between border-t border-slate-700 pt-4">
              <span className="text-sm text-slate-400">
                {output.thingsNeedingApproval > 0
                  ? `${output.thingsNeedingApproval} פריטים מחכים לאישור`
                  : "אין פריטים שמחכים"}
              </span>
              <button
                onClick={() => setOutput(null)}
                className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-teal-400"
              >
                {output.callToAction || "בסדר"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
