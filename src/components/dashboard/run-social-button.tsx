"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerSocialAgentAction } from "@/app/dashboard/actions";
import { Smartphone, Check, AlertTriangle, Info } from "lucide-react";

const LOADING_STAGES = [
  "כותב פוסט בוקר...",
  "כותב פוסט צהריים...",
  "כותב פוסט ערב...",
  "מסיים את העבודה...",
];

export function RunSocialButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [noOpReason, setNoOpReason] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState(0);

  // Rotate loading message every 2.5s while pending
  useEffect(() => {
    if (!isPending) {
      setLoadingStage(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStage((prev) => {
        if (prev >= LOADING_STAGES.length - 1) return prev;
        return prev + 1;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [isPending]);

  const handleClick = () => {
    setError(null);
    setSuccess(null);
    setNoOpReason(null);
    setLoadingStage(0);
    startTransition(async () => {
      const res = await triggerSocialAgentAction();
      if (res.success && res.result) {
        const n = res.result.draftIds.length;
        if (n === 0) {
          const reason = res.result.output?.noOpReason ?? "אין פוסטים להיום";
          setNoOpReason(reason);
          return;
        }
        setSuccess(`הוכנו ${n} טיוטות פוסטים לבוקר, צהריים וערב`);
        setTimeout(() => router.push("/dashboard/approvals"), 1200);
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
            <span>{LOADING_STAGES[loadingStage]}</span>
          </>
        ) : (
          <>
            <Smartphone size={13} strokeWidth={1.75} />
            הרץ עכשיו
          </>
        )}
      </button>

      {success && (
        <div
          className="mt-3 flex items-start gap-2 rounded-[10px] px-3 py-2 text-[12.5px]"
          style={{
            background: "var(--color-sys-green-soft)",
            border: "1px solid rgba(48, 179, 107, 0.25)",
            color: "var(--color-sys-green)",
          }}
        >
          <Check size={14} strokeWidth={2} className="mt-0.5 flex-shrink-0" />
          <span>{success} — מעביר אותך לתיבת האישורים...</span>
        </div>
      )}

      {noOpReason && (
        <div
          className="mt-3 flex items-start gap-2 rounded-[10px] px-3 py-2 text-[12.5px]"
          style={{
            background: "var(--color-sys-blue-soft)",
            border: "1px solid rgba(10, 132, 255, 0.20)",
            color: "var(--color-sys-blue)",
          }}
        >
          <Info size={14} strokeWidth={2} className="mt-0.5 flex-shrink-0" />
          <span>לא הוכנו פוסטים — {noOpReason}</span>
        </div>
      )}

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

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
