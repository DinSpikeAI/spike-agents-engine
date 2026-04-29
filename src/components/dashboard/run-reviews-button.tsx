"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerReviewsAgentAction } from "@/app/dashboard/actions";

export function RunReviewsButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await triggerReviewsAgentAction();
      if (res.success && res.result) {
        const n = res.result.draftIds.length;
        const blocked = res.result.defamationFlags.filter(
          (f) => f.risk === "high"
        ).length;

        let msg = `הוכנו ${n} ${n === 1 ? "טיוטה" : "טיוטות"}`;
        if (blocked > 0) {
          msg += ` (${blocked} נחסמו לשון הרע)`;
        }
        setSuccess(msg);

        // Navigate to approvals after a brief flash
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
        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 transition-all hover:bg-teal-400 disabled:opacity-50"
      >
        {isPending ? "✍️ כותב טיוטות..." : "✍️ הרץ סוכן ביקורות עכשיו"}
      </button>

      {success && (
        <div className="mt-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          ✓ {success} — מעביר אותך לתיבת האישורים...
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
