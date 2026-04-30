"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerManagerAgentAction } from "@/app/dashboard/actions";

export function RunManagerButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
        className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-violet-400 disabled:opacity-50"
      >
        {isPending ? "🧠 מכין דוח מנהל..." : "🧠 הרץ סוכן מנהל עכשיו"}
      </button>

      {success && (
        <div className="mt-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          ✓ {success} — מעביר אותך לדף הדוח...
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
