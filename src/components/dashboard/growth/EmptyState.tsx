// src/components/dashboard/growth/EmptyState.tsx
//
// Sub-stage 1.15 — Sprint 2 Batch 2B
// Empty state for /dashboard/growth — shown when listPendingGrowthCandidates
// returns no rows (the agent has not run yet, or every candidate has
// been decided / expired).
//
// Scope decision: the on-demand re-run button does NOT live here. It
// belongs in the page header (Batch 2B-2) so it remains reachable
// regardless of whether the list has candidates. This component is
// purely "nothing to show, here is why, here is what is coming".
//
// Sprint 3 forward hint: a quiet pointer at the Instagram integration
// (which will start contributing DM-based opportunities once Meta
// Business verification + Embedded Signup land — see CLAUDE.md §12.3).
// Linking to /dashboard/integrations gives owners a clear next step
// rather than a dead-end empty state.

import Link from "next/link";
import { Glass } from "@/components/ui/glass";
import { Mascot } from "@/components/ui/mascot";
import { MessageCircle, CalendarClock } from "lucide-react";

export function EmptyState() {
  return (
    <Glass className="p-8 text-center sm:p-10">
      <div className="flex justify-center">
        <Mascot pose="phone-right" size={140} />
      </div>

      <h2
        className="mb-1.5 mt-3 text-[18px] font-semibold tracking-[-0.01em]"
        style={{ color: "var(--color-ink)" }}
      >
        אין הזדמנויות חדשות כרגע
      </h2>

      <p
        className="mx-auto max-w-[440px] text-[13px] leading-relaxed"
        style={{ color: "var(--color-ink-2)" }}
      >
        הסוכן רץ אוטומטית בכל יום ראשון בבוקר. הוא מחפש לקוחות שכדאי לחדש
        איתם קשר ולקוחות פוטנציאליים שלא ענית להם. כשתהיה הזדמנות חדשה היא
        תופיע כאן.
      </p>

      <div
        className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]"
        style={{
          background: "rgba(255,255,255,0.6)",
          color: "var(--color-ink-3)",
          border: "1px solid var(--color-hairline)",
        }}
      >
        <CalendarClock size={12} strokeWidth={1.75} />
        ריצה הבאה: יום ראשון, 07:00 בבוקר
      </div>

      {/* Sprint 3 forward hint — Instagram via Meta Business verification. */}
      <div
        className="mx-auto mt-6 flex max-w-[440px] items-start gap-2.5 rounded-[10px] p-3 text-start"
        style={{
          background: "rgba(255,255,255,0.5)",
          border: "1px solid var(--color-hairline)",
        }}
      >
        <div
          className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px]"
          style={{ background: "rgba(255,255,255,0.7)" }}
        >
          <MessageCircle
            size={13}
            strokeWidth={1.75}
            style={{ color: "var(--color-ink-2)" }}
          />
        </div>
        <div
          className="flex-1 text-[11.5px] leading-relaxed"
          style={{ color: "var(--color-ink-2)" }}
        >
          <span
            className="font-semibold"
            style={{ color: "var(--color-ink)" }}
          >
            בקרוב:{" "}
          </span>
          חיבור Instagram יוסיף הזדמנויות מ-DMs שלא ענית להם.
          <Link
            href="/dashboard/integrations"
            className="mr-1 underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-70"
            style={{ color: "var(--color-sys-blue)" }}
          >
            עוד פרטים
          </Link>
        </div>
      </div>
    </Glass>
  );
}
