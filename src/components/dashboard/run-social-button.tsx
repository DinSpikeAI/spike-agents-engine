"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerSocialAgentAction } from "@/app/dashboard/actions";

const LOADING_STAGES = [
  "✍️ כותב פוסט בוקר...",
  "☀️ כותב פוסט צהריים...",
  "🌙 כותב פוסט ערב...",
  "🎨 מסיים את העבודה...",
];

export function RunSocialButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState(0);

  // Rotate loading message every 2.5s while pending
  useEffect(() => {
    if (!isPending) {
      setLoadingStage(0);
      return;
    }

    const interval = setInterval(() => {
      setLoadingStage((prev) => {
        // Stop at last stage (don't loop back)
        if (prev >= LOADING_STAGES.length - 1) return prev;
        return prev + 1;
      });
    }, 2500);

    return () => clearInterval(interval);
  }, [isPending]);

  const handleClick = () => {
    setError(null);
    setSuccess(null);
    setLoadingStage(0);
    startTransition(async () => {
      const res = await triggerSocialAgentAction();
      if (res.success && res.result) {
        const n = res.result.draftIds.length;

        if (n === 0) {
          const reason = res.result.output?.noOpReason ?? "אין פוסטים להיום";
          setSuccess(`לא הוכנו פוסטים: ${reason}`);
          return;
        }

        const msg = `הוכנו ${n} טיוטות פוסטים לבוקר, צהריים וערב`;
        setSuccess(msg);

        setTimeout(() => {
          router.push("/dashboard/approvals");
        }, 1200);
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
        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 transition-all hover:bg-teal-400 disabled:opacity-50 inline-flex items-center gap-2"
      >
        {isPending ? (
          <>
            <span
              className="inline-block h-3 w-3 rounded-full border-2 border-slate-900 border-t-transparent"
              style={{ animation: "spin 0.8s linear infinite" }}
              aria-hidden="true"
            />
            <span>{LOADING_STAGES[loadingStage]}</span>
          </>
        ) : (
          "📱 הרץ סוכן רשתות עכשיו"
        )}
      </button>

      {success && (
        <div className="mt-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          ✓ {success}
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
          ⚠️ {error}
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
