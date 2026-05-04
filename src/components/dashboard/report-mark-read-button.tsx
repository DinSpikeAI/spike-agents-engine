"use client";

// src/components/dashboard/report-mark-read-button.tsx
//
// Client Component — "סמן כנקרא" button on /dashboard/reports/[id].
//
// This is the moment the 7-day Manager lock starts. Per the Iron Rule
// "AI מסמן, בעלים מחליט" the lock is consequential, so we require an
// explicit click — never auto-fire on view/scroll/hover. The owner
// consciously commits.
//
// Behavior:
//   - initialReadAt !== null → render a green "נקרא ב..." pill (read-only).
//   - initialReadAt === null → render an active blue CTA button.
//   - On click: useTransition pending state → call markManagerReportRead.
//       Success: sonner toast + optimistic local switch to the green pill +
//                router.refresh() so server-rendered fields update
//                (next_eligible_run_at populates).
//       Failure: sonner error toast, button re-enabled.
//
// Idempotency: the server action filters .is("read_at", null), so a
// double-click or a second tab won't extend the 7-day lock. The component
// still optimistically updates state on first click to prevent UI flicker
// during the round-trip.
//
// Styling: Calm Frosted via inline style + CSS variables from globals.css.
// Per CLAUDE.md §2.12 we use CSS variables in inline style={{}}, NOT
// Tailwind preset color classes (no bg-blue-500, etc).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { markManagerReportRead } from "@/app/dashboard/actions";

interface ReportMarkReadButtonProps {
  reportId: string;
  /** ISO timestamp if the report has already been read, otherwise null. */
  initialReadAt: string | null;
}

export function ReportMarkReadButton({
  reportId,
  initialReadAt,
}: ReportMarkReadButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Local mirror so the button updates instantly on success, before the
  // server-rendered page refreshes with the persisted read_at.
  const [optimisticReadAt, setOptimisticReadAt] = useState<string | null>(
    initialReadAt
  );

  const isRead = optimisticReadAt !== null;

  const handleClick = () => {
    if (isRead || isPending) return;
    startTransition(async () => {
      const result = await markManagerReportRead(reportId);
      if (result.success) {
        const nowIso = new Date().toISOString();
        setOptimisticReadAt(nowIso);
        toast.success("סומן כנקרא. הסוכן יוכל לרוץ שוב בעוד 7 ימים.");
        router.refresh();
      } else {
        toast.error(result.error ?? "שגיאה בסימון הדוח כנקרא");
      }
    });
  };

  if (isRead) {
    return (
      <div
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] text-[13.5px] font-medium"
        style={{
          background: "var(--color-sys-green-soft)",
          color: "var(--color-sys-green)",
        }}
      >
        <CheckCircle2 size={16} strokeWidth={2.2} />
        <span>נקרא ב-{formatHebrewDate(optimisticReadAt!)}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--radius-md)] text-[14px] font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background: "var(--color-sys-blue)",
        color: "white",
        boxShadow: "var(--shadow-cta)",
      }}
    >
      <Check size={16} strokeWidth={2.4} />
      <span>{isPending ? "מסמן..." : "סמן כנקרא"}</span>
    </button>
  );
}

/**
 * Format an ISO timestamp as a short Hebrew date+time for the read-state pill.
 * Example: "5 במאי, 14:32"
 *
 * Uses toLocaleDateString/toLocaleTimeString with he-IL — the user's
 * timezone is implicit (browser local). This is fine for display purposes;
 * the canonical timestamp is stored in UTC server-side.
 */
function formatHebrewDate(iso: string): string {
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
  });
  const timeStr = d.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateStr}, ${timeStr}`;
}
