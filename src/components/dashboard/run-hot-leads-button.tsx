"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerHotLeadsAgentAction } from "@/app/dashboard/actions";

export function RunHotLeadsButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await triggerHotLeadsAgentAction();
      if (res.success && res.result) {
        const n = res.result.leadIds.length;
        const blazing = res.result.output?.classifications.filter(
          (c) => c.bucket === "blazing"
        ).length ?? 0;

        let msg = `סווגו ${n} לידים`;
        if (blazing > 0) {
          msg += ` (${blazing} בוערים)`;
        }
        setSuccess(msg);

        setTimeout(() => {
          router.push("/dashboard/leads");
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
        className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-900 transition-all hover:bg-orange-400 disabled:opacity-50"
      >
        {isPending ? "🔥 מסווג לידים..." : "🔥 הרץ סוכן לידים חמים עכשיו"}
      </button>

      {success && (
        <div className="mt-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          ✓ {success} — מעביר אותך ל-leads board...
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
          ⚠️ {error}
        </div>
      )}
    </>
  );
}
