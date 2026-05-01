"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { triggerInventoryAgentAction } from "@/app/dashboard/actions";
import {
  Package,
  Check,
  AlertTriangle,
  Info,
  Upload,
  ArrowLeft,
} from "lucide-react";

const LOADING_STAGES = [
  "טוען את קובץ המלאי...",
  "מחשב ימי כיסוי לכל מוצר...",
  "מנתח את המצב עם AI...",
  "מסיים את העבודה...",
];

export function RunInventoryButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [noOpReason, setNoOpReason] = useState<string | null>(null);
  const [needsUpload, setNeedsUpload] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);

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
    setNeedsUpload(false);
    setLoadingStage(0);

    startTransition(async () => {
      const res = await triggerInventoryAgentAction();

      // Action-level failure (rate limit, tenant lookup, etc.)
      if (!res.success) {
        setError(res.error ?? "משהו השתבש");
        return;
      }

      const result = res.result;
      if (!result) {
        setError("לא התקבלה תוצאה מהסוכן");
        return;
      }

      // The agent ran but reported failure — usually "no snapshot uploaded"
      if (result.status === "failed") {
        const errMsg = result.error ?? "הניתוח נכשל";
        if (errMsg.includes("אין קובץ מלאי")) {
          setNeedsUpload(true);
        } else {
          setError(errMsg);
        }
        return;
      }

      // Snapshot exists but contains zero products
      if (result.status === "no_op") {
        setNoOpReason("הקובץ אינו מכיל מוצרים תקפים");
        return;
      }

      // Success
      if (result.status === "succeeded") {
        const n = result.productCount;
        setSuccess(
          `הניתוח הושלם — ${n} ${n === 1 ? "מוצר נסקר" : "מוצרים נסקרו"}`
        );
        // Always land on the Inventory page so the user actually sees the new
        // analysis. From /dashboard/inventory this is a soft-navigate that
        // re-runs the server component (force-dynamic ensures fresh data).
        // From /dashboard/ this navigates the user to where the result lives.
        setTimeout(() => router.push("/dashboard/inventory"), 1200);
        return;
      }

      // Defensive fallback for unexpected status values
      setError("הסוכן החזיר סטטוס לא צפוי");
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
            <Package size={13} strokeWidth={1.75} />
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
          <span>{success}</span>
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
          <span>לא בוצע ניתוח — {noOpReason}</span>
        </div>
      )}

      {needsUpload && (
        <div
          className="mt-3 flex flex-wrap items-start gap-2 rounded-[10px] px-3 py-2 text-[12.5px]"
          style={{
            background: "rgba(224, 169, 61, 0.12)",
            border: "1px solid rgba(224, 169, 61, 0.30)",
            color: "var(--color-sys-amber)",
          }}
        >
          <Upload
            size={14}
            strokeWidth={2}
            className="mt-0.5 flex-shrink-0"
          />
          <span className="flex-1">אין קובץ מלאי. העלה CSV כדי להתחיל.</span>
          <Link
            href="/dashboard/inventory"
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-semibold transition-opacity hover:opacity-80"
            style={{
              background: "rgba(224, 169, 61, 0.20)",
              color: "var(--color-sys-amber)",
            }}
          >
            לעמוד המלאי
            <ArrowLeft size={11} strokeWidth={2} />
          </Link>
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
