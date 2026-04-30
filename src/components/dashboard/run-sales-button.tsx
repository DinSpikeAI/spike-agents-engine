"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerSalesAgentAction } from "@/app/dashboard/actions";
import { Play } from "lucide-react";

const LOADING_STAGES = [
  "מזהה לידים תקועים...",
  "כותב follow-ups...",
  "מתאים את הטון...",
  "מסיים...",
];

export function RunSalesButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState(0);

  useEffect(() => {
    if (!isPending) {
      setLoadingStage(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStage((prev) =>
        prev >= LOADING_STAGES.length - 1 ? prev : prev + 1
      );
    }, 3000);
    return () => clearInterval(interval);
  }, [isPending]);

  const handleClick = () => {
    setError(null);
    setSuccess(null);
    setLoadingStage(0);
    startTransition(async () => {
      const res = await triggerSalesAgentAction();
      if (res.success && res.result) {
        const n = res.result.draftIds.length;
        const stuckCount = res.result.stuckLeadsCount;

        if (n === 0) {
          const reason = res.result.output?.noOpReason ?? "אין מה לעשות";
          setSuccess(reason);
          return;
        }

        let msg = `${n} ${n === 1 ? "follow-up" : "follow-ups"} מוכנים`;
        if (stuckCount > n) msg += ` (מ-${stuckCount} לידים)`;
        setSuccess(msg);

        setTimeout(() => router.push("/dashboard/approvals"), 1000);
      } else {
        setError(res.error ?? "משהו השתבש");
      }
    });
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-medium text-white transition-all disabled:opacity-50"
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
            <span>{LOADING_STAGES[loadingStage]}</span>
          </>
        ) : (
          <>
            <Play size={11} strokeWidth={2} />
            הרץ
          </>
        )}
      </button>

      {success && (
        <div
          className="mt-2 rounded-md px-3 py-2 text-xs"
          style={{
            background: "var(--color-sys-green-soft)",
            color: "var(--color-sys-green)",
          }}
        >
          ✓ {success}
        </div>
      )}

      {error && (
        <div
          className="mt-2 rounded-md px-3 py-2 text-xs"
          style={{
            background: "rgba(214, 51, 108, 0.1)",
            color: "var(--color-sys-pink)",
          }}
        >
          ⚠️ {error}
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
