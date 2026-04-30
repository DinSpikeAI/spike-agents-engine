"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerWatcherAgentAction } from "@/app/dashboard/actions";
import { Play } from "lucide-react";

export function RunWatcherButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await triggerWatcherAgentAction();
      if (res.success && res.result) {
        const alerts = res.result.output?.alerts.length ?? 0;
        setSuccess(
          alerts === 0
            ? "אין התראות חדשות"
            : `${alerts} התראות זוהו`
        );
        setTimeout(() => router.refresh(), 800);
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
            <span>סורק...</span>
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
