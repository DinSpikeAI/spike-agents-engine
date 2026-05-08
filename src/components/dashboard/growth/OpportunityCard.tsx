"use client";

// src/components/dashboard/growth/OpportunityCard.tsx
//
// Sub-stage 1.15 — Sprint 2 Batch 2B
// Single card for one pending Growth candidate.
//
// 4 actions (Iron Rule 1.1 — none of them sends in Sprint 2):
//   [אשר]   approveGrowthCandidate — owner endorses the draft. In
//            Batch 2C this will fire WhatsApp send; here it just
//            flips status to 'approved' and revalidates.
//   [ערוך]  opens DraftEditor modal — owner rewrites the message
//   [סגרתי] inline panel with optional ₪ revenue → markClosed
//   [דחה]   inline panel with optional reason → reject
//
// All 4 actions surface result.message via sonner. After success
// the card disappears via the action's revalidatePath. We use
// useTransition to keep the card visually disabled during the
// flight so the user does not double-click — opacity + pointer-
// events-none on the Glass wrapper. Once revalidatePath fires,
// the page re-renders without this candidate and the card unmounts.
//
// Local draft state: the editor's onSaved callback updates `draft`
// immediately so the message in the card reflects the edit without
// waiting for the action's revalidatePath to round-trip. The action
// also revalidates, so this is purely a UX optimization.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Check,
  Pencil,
  Trophy,
  X,
  RefreshCw,
  Phone,
} from "lucide-react";
import { Glass } from "@/components/ui/glass";
import {
  approveGrowthCandidate,
  rejectGrowthCandidate,
  markGrowthCandidateClosed,
  type PendingGrowthCandidate,
} from "@/app/dashboard/actions/growth";
import { DraftEditor } from "./DraftEditor";

interface OpportunityCardProps {
  candidate: PendingGrowthCandidate;
}

const HEBREW_GOAL_LABEL: Record<string, string> = {
  reactivation: "חידוש קשר",
  lead_discovery: "ליד פוטנציאלי",
};

const HEBREW_CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
};

function formatExpiresAt(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "פג תוקף";
    if (diffDays === 0) return "תקף עד מחר";
    if (diffDays === 1) return "תקף ליום";
    return `תקף ל-${diffDays} ימים`;
  } catch {
    return "";
  }
}

function priorityStyleFor(score: number): { bg: string; fg: string } {
  // 80+ pink (urgent), 60-79 amber (warm), <60 insight-green (default)
  if (score >= 80) {
    return { bg: "rgba(214,51,108,0.14)", fg: "var(--color-sys-pink)" };
  }
  if (score >= 60) {
    return { bg: "rgba(224,169,61,0.18)", fg: "var(--color-sys-amber)" };
  }
  return { bg: "var(--color-cat-insight)", fg: "var(--color-cat-insight-fg)" };
}

export function OpportunityCard({ candidate }: OpportunityCardProps) {
  const [draft, setDraft] = useState(candidate.draftMessage);
  const [editorOpen, setEditorOpen] = useState(false);
  const [closePanelOpen, setClosePanelOpen] = useState(false);
  const [rejectPanelOpen, setRejectPanelOpen] = useState(false);
  const [closeValue, setCloseValue] = useState<string>("");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const goalLabel = HEBREW_GOAL_LABEL[candidate.goal] ?? candidate.goal;
  const channelLabel =
    HEBREW_CHANNEL_LABEL[candidate.draftChannel] ?? candidate.draftChannel;
  const priority = priorityStyleFor(candidate.priorityScore);
  const expiresLabel = formatExpiresAt(candidate.expiresAt);

  function closeAllPanels() {
    setClosePanelOpen(false);
    setRejectPanelOpen(false);
    setCloseValue("");
    setRejectReason("");
  }

  function handleApprove() {
    if (isPending) return;
    closeAllPanels();
    startTransition(async () => {
      const result = await approveGrowthCandidate(candidate.id);
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleSubmitClose() {
    if (isPending) return;
    let parsedValue: number | undefined;
    if (closeValue.trim().length > 0) {
      // Strip thousands separators / shekel sign before parsing
      const numeric = Number(closeValue.replace(/[,\s₪]/g, ""));
      if (isNaN(numeric)) {
        toast.error("ערך הסגירה חייב להיות מספר.");
        return;
      }
      parsedValue = numeric;
    }
    startTransition(async () => {
      const result = await markGrowthCandidateClosed(
        candidate.id,
        parsedValue
      );
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleSubmitReject() {
    if (isPending) return;
    const reason =
      rejectReason.trim().length > 0 ? rejectReason.trim() : undefined;
    startTransition(async () => {
      const result = await rejectGrowthCandidate(candidate.id, reason);
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <>
      <Glass
        className={`p-4 transition-opacity sm:p-5 ${
          isPending ? "pointer-events-none opacity-55" : ""
        }`}
      >
        {/* Header row: score badge + title + meta */}
        <div className="flex items-start gap-3 sm:gap-4">
          {/* Score badge */}
          <div
            className="flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-[12px]"
            style={{
              background: priority.bg,
              border: "1px solid var(--color-frost-edge)",
              color: priority.fg,
            }}
          >
            <span className="text-[16px] font-bold leading-none tabular-nums">
              {Math.round(candidate.priorityScore)}
            </span>
            <span className="mt-0.5 text-[8.5px] font-medium tracking-wider">
              SCORE
            </span>
          </div>

          {/* Title + subtitle + meta */}
          <div className="min-w-0 flex-1">
            <h3
              className="truncate text-[15.5px] font-semibold tracking-[-0.015em]"
              style={{ color: "var(--color-ink)" }}
            >
              {candidate.candidateLabel}
            </h3>
            {candidate.candidateSubtitle && (
              <p
                className="mt-0.5 truncate text-[12.5px]"
                style={{ color: "var(--color-ink-2)" }}
              >
                {candidate.candidateSubtitle}
              </p>
            )}
            <div
              className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"
              style={{ color: "var(--color-ink-3)" }}
            >
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                style={{
                  background: "rgba(255,255,255,0.6)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                <RefreshCw size={10} strokeWidth={2} />
                {goalLabel}
              </span>
              <span aria-hidden>·</span>
              <span>{channelLabel}</span>
              {candidate.customerPhone && (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1" dir="ltr">
                    <Phone size={10} strokeWidth={2} />
                    {candidate.customerPhone}
                  </span>
                </>
              )}
              {expiresLabel && (
                <>
                  <span aria-hidden>·</span>
                  <span>{expiresLabel}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Why — Haiku's reasoning, surfaced for transparency */}
        <div
          className="mt-3.5 rounded-[10px] p-3 text-[12.5px] leading-relaxed"
          style={{
            background: "rgba(255,255,255,0.55)",
            border: "1px solid var(--color-hairline)",
            color: "var(--color-ink-2)",
          }}
        >
          <span
            className="font-semibold"
            style={{ color: "var(--color-ink)" }}
          >
            למה הסוכן הציע:{" "}
          </span>
          {candidate.whyExplanation}
        </div>

        {/* Draft */}
        <div className="mt-3">
          <div
            className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider"
            style={{ color: "var(--color-ink-3)" }}
          >
            טיוטה
          </div>
          <div
            className="whitespace-pre-wrap rounded-[11px] p-3.5 text-[13.5px] leading-relaxed"
            style={{
              background: "rgba(255,255,255,0.78)",
              border: "1px solid var(--color-hairline-s)",
              color: "var(--color-ink)",
            }}
            dir="rtl"
          >
            {draft}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "var(--color-sys-blue)",
              boxShadow: !isPending ? "var(--shadow-cta)" : "none",
            }}
          >
            <Check size={13} strokeWidth={2} />
            אשר
          </button>
          <button
            type="button"
            onClick={() => {
              closeAllPanels();
              setEditorOpen(true);
            }}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "rgba(255,255,255,0.7)",
              color: "var(--color-ink)",
              border: "1px solid var(--color-hairline)",
            }}
          >
            <Pencil size={13} strokeWidth={1.75} />
            ערוך
          </button>
          <button
            type="button"
            onClick={() => {
              setRejectPanelOpen(false);
              setRejectReason("");
              setClosePanelOpen((v) => !v);
            }}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: closePanelOpen
                ? "var(--color-sys-green-soft)"
                : "rgba(255,255,255,0.7)",
              color: closePanelOpen
                ? "var(--color-sys-green)"
                : "var(--color-ink)",
              border: "1px solid var(--color-hairline)",
            }}
          >
            <Trophy size={13} strokeWidth={1.75} />
            סגרתי
          </button>
          <button
            type="button"
            onClick={() => {
              setClosePanelOpen(false);
              setCloseValue("");
              setRejectPanelOpen((v) => !v);
            }}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: rejectPanelOpen
                ? "rgba(214,51,108,0.12)"
                : "rgba(255,255,255,0.7)",
              color: rejectPanelOpen
                ? "var(--color-sys-pink)"
                : "var(--color-ink-3)",
              border: "1px solid var(--color-hairline)",
            }}
          >
            <X size={13} strokeWidth={2} />
            דחה
          </button>
        </div>

        {/* Inline panel — close-the-deal */}
        {closePanelOpen && (
          <div
            className="mt-3 rounded-[11px] p-3.5"
            style={{
              background: "var(--color-sys-green-soft)",
              border: "1px solid rgba(48,179,107,0.25)",
            }}
          >
            <label
              className="mb-2 block text-[12px] font-medium"
              style={{ color: "var(--color-ink)" }}
            >
              ערך הסגירה{" "}
              <span style={{ color: "var(--color-ink-3)" }}>
                (אופציונלי, ב-₪)
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={closeValue}
                onChange={(e) => setCloseValue(e.target.value)}
                placeholder="למשל 250"
                disabled={isPending}
                dir="ltr"
                className="flex-1 rounded-[9px] px-3 py-2 text-[13px] disabled:opacity-60"
                style={{
                  background: "rgba(255,255,255,0.85)",
                  border: "1px solid var(--color-hairline)",
                  color: "var(--color-ink)",
                  outline: "none",
                  minWidth: 140,
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setClosePanelOpen(false);
                  setCloseValue("");
                }}
                disabled={isPending}
                className="rounded-[9px] px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-50"
                style={{
                  background: "rgba(255,255,255,0.7)",
                  color: "var(--color-ink-2)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleSubmitClose}
                disabled={isPending}
                className="rounded-[9px] px-3 py-2 text-[12px] font-medium text-white transition-colors disabled:opacity-50"
                style={{ background: "var(--color-sys-green)" }}
              >
                סגירה
              </button>
            </div>
          </div>
        )}

        {/* Inline panel — reject */}
        {rejectPanelOpen && (
          <div
            className="mt-3 rounded-[11px] p-3.5"
            style={{
              background: "rgba(214,51,108,0.07)",
              border: "1px solid rgba(214,51,108,0.18)",
            }}
          >
            <label
              className="mb-2 block text-[12px] font-medium"
              style={{ color: "var(--color-ink)" }}
            >
              סיבת הדחייה{" "}
              <span style={{ color: "var(--color-ink-3)" }}>(אופציונלי)</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="למשל: לקוח לא רלוונטי"
                disabled={isPending}
                className="flex-1 rounded-[9px] px-3 py-2 text-[13px] disabled:opacity-60"
                style={{
                  background: "rgba(255,255,255,0.85)",
                  border: "1px solid var(--color-hairline)",
                  color: "var(--color-ink)",
                  outline: "none",
                  minWidth: 200,
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setRejectPanelOpen(false);
                  setRejectReason("");
                }}
                disabled={isPending}
                className="rounded-[9px] px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-50"
                style={{
                  background: "rgba(255,255,255,0.7)",
                  color: "var(--color-ink-2)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleSubmitReject}
                disabled={isPending}
                className="rounded-[9px] px-3 py-2 text-[12px] font-medium text-white transition-colors disabled:opacity-50"
                style={{ background: "var(--color-sys-pink)" }}
              >
                דחה
              </button>
            </div>
          </div>
        )}
      </Glass>

      <DraftEditor
        candidateId={candidate.id}
        currentMessage={draft}
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={(newMsg) => setDraft(newMsg)}
      />
    </>
  );
}
