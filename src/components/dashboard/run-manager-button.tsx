"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerManagerAgentAction, type ManagerLockState } from "@/app/dashboard/actions";
import { Play, Lock, Eye } from "lucide-react";
import Link from "next/link";

interface RunManagerButtonProps {
  lockState: ManagerLockState;
}

export function RunManagerButton({ lockState }: RunManagerButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await triggerManagerAgentAction();
      if (res.success && res.result) {
        setSuccess("הדוח השבועי מוכן");
        setTimeout(() => router.refresh(), 1000);
      } else {
        setError(res.error ?? "משהו השתבש");
      }
    });
  };

  // Locked state — unread report waiting
  if (lockState.reason === "unread_pending" && lockState.unreadReportId) {
    return (
      <Link
        href={`/dashboard/reports/${lockState.unreadReportId}`}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-medium text-white transition-all"
        style={{
          background: "var(--color-sys-blue)",
          boxShadow: "var(--shadow-cta)",
        }}
      >
        <Eye size={11} strokeWidth={2} />
        קרא את הדוח האחרון
      </Link>
    );
  }

  // Locked state — weekly cooldown
  if (lockState.reason === "weekly_lock") {
    const timeText =
      lockState.daysUntilNext > 0
        ? `הדוח הבא בעוד ${lockState.daysUntilNext} ${
            lockState.daysUntilNext === 1 ? "יום" : "ימים"
          }`
        : `הדוח הבא בעוד ${lockState.hoursUntilNext} שעות`;

    return (
      <div
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px]"
        style={{
          background: "rgba(255,255,255,0.5)",
          borderColor: "var(--color-hairline)",
          color: "var(--color-ink-3)",
        }}
      >
        <Lock size={11} strokeWidth={1.5} />
        {timeText}
      </div>
    );
  }

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
            <span>חושב...</span>
          </>
        ) : (
          <>
            <Play size={11} strokeWidth={2} />
            הרץ עכשיו
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
