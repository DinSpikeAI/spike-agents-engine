"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerManagerAgentAction } from "@/app/dashboard/actions";
import type { ManagerLockState } from "@/app/dashboard/actions";
import { Brain, Mail, Lock, Check, AlertTriangle } from "lucide-react";

export function RunManagerButton({
  lockState,
}: {
  lockState: ManagerLockState;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ─── Mode 1: there is an unread report ──────────────────────
  if (!lockState.canRun && lockState.reason === "unread_pending") {
    return (
      <button
        onClick={() => router.push("/dashboard/manager")}
        className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-medium text-white transition-all"
        style={{
          background: "var(--color-sys-blue)",
          boxShadow: "var(--shadow-cta)",
        }}
      >
        <Mail size={13} strokeWidth={1.75} />
        דוח חדש מחכה — לחץ לקריאה
      </button>
    );
  }

  // ─── Mode 2: locked for the week ───────────────────────────
  if (!lockState.canRun && lockState.reason === "weekly_lock") {
    const lockMsg =
      lockState.daysUntilNext > 0
        ? `הדוח הבא בעוד ${lockState.daysUntilNext} ${
            lockState.daysUntilNext === 1 ? "יום" : "ימים"
          }`
        : `הדוח הבא בעוד ${lockState.hoursUntilNext} ${
            lockState.hoursUntilNext === 1 ? "שעה" : "שעות"
          }`;

    return (
      <div className="space-y-2">
        <button
          disabled
          className="inline-flex cursor-not-allowed items-center gap-2 rounded-[10px] border px-4 py-2 text-[13px] font-medium"
          style={{
            background: "rgba(255,255,255,0.5)",
            borderColor: "var(--color-hairline)",
            color: "var(--color-ink-3)",
          }}
        >
          <Lock size={13} strokeWidth={1.75} />
          {lockMsg}
        </button>
        <button
          onClick={() => router.push("/dashboard/manager")}
          className="block text-[12px] underline transition-colors"
          style={{ color: "var(--color-ink-3)" }}
        >
          צפייה בדוח האחרון
        </button>
      </div>
    );
  }

  // ─── Mode 3: can run ───────────────────────────────────────
  const handleClick = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await triggerManagerAgentAction(7);
      if (res.success && res.result) {
        const r = res.result;
        if (r.status === "succeeded" && r.output) {
          const critical = r.output.hasCriticalIssues
            ? " — נמצאו עניינים דחופים"
            : "";
          setSuccess(`דוח מנהל הוכן${critical}`);
          setTimeout(() => router.push("/dashboard/manager"), 1200);
        } else {
          setError(r.error ?? "הריצה נכשלה");
        }
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
            מכין דוח מנהל...
          </>
        ) : (
          <>
            <Brain size={13} strokeWidth={1.75} />
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
          <span>{success} — מעביר אותך לדף הדוח...</span>
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
