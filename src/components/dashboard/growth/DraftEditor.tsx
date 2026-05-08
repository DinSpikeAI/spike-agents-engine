"use client";

// src/components/dashboard/growth/DraftEditor.tsx
//
// Sub-stage 1.15 — Sprint 2 Batch 2B
// Modal editor for a Growth candidate's draft message.
//
// Lives as a controlled overlay opened from OpportunityCard (Batch
// 2B-2). The parent owns visibility via the `isOpen` prop. We keep
// our own internal text state seeded from `currentMessage` so the
// owner can cancel without losing the original.
//
// Server action: editGrowthDraft(id, newMsg). Belt-and-suspenders
// validation here mirrors the action's validation (≤2,000 chars,
// trimmed non-empty) so the owner gets immediate feedback rather
// than a server round-trip on obvious cases. The action also
// re-validates server-side and returns { ok, message }, so this
// is a UX optimization, not a security boundary.
//
// Iron Rule preserved (1.1): this only edits drafts, never sends.
//
// Accessibility:
//   - role="dialog" + aria-modal="true" + aria-labelledby
//   - ESC closes (unless a save is in flight)
//   - Backdrop click closes (unless a save is in flight)
//   - Focus moves to the textarea on open, with caret at end of text

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import { toast } from "sonner";
import { X, Save } from "lucide-react";
import { editGrowthDraft } from "@/app/dashboard/actions/growth";

const MAX_LENGTH = 2000;
const WARN_LENGTH = 1900;

interface DraftEditorProps {
  candidateId: string;
  currentMessage: string;
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful save with the trimmed new message. */
  onSaved?: (newMessage: string) => void;
}

export function DraftEditor({
  candidateId,
  currentMessage,
  isOpen,
  onClose,
  onSaved,
}: DraftEditorProps) {
  const [draft, setDraft] = useState(currentMessage);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset draft state whenever the modal opens against a (possibly
  // different) candidate. We also defer focus so any open transition
  // has time to settle before the caret jumps in.
  useEffect(() => {
    if (!isOpen) return;
    setDraft(currentMessage);
    const handle = window.setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(currentMessage.length, currentMessage.length);
      }
    }, 50);
    return () => window.clearTimeout(handle);
  }, [isOpen, currentMessage]);

  // ESC closes the modal — but not while a save is in flight, to avoid
  // dropping the owner's edit mid-RPC.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, isPending, onClose]);

  if (!isOpen) return null;

  const trimmed = draft.trim();
  const length = draft.length;
  const isEmpty = trimmed.length === 0;
  const isTooLong = length > MAX_LENGTH;
  const isUnchanged = trimmed === currentMessage.trim();
  const canSave = !isEmpty && !isTooLong && !isUnchanged && !isPending;

  const counterColor = isTooLong
    ? "var(--color-sys-pink)"
    : length >= WARN_LENGTH
      ? "var(--color-sys-amber)"
      : "var(--color-ink-3)";

  function handleSave() {
    if (!canSave) return;
    startTransition(async () => {
      const result = await editGrowthDraft(candidateId, trimmed);
      if (result.ok) {
        toast.success(result.message);
        onSaved?.(trimmed);
        onClose();
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    // Only close on a click that landed directly on the backdrop —
    // not on anything inside the dialog itself.
    if (event.target === event.currentTarget && !isPending) {
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-editor-title"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      dir="rtl"
      style={{
        background: "rgba(15, 20, 30, 0.45)",
        backdropFilter: "blur(8px) saturate(140%)",
        WebkitBackdropFilter: "blur(8px) saturate(140%)",
      }}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-[18px]"
        style={{
          background: "var(--color-glass-deep)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          border: "1px solid var(--color-frost-edge)",
          boxShadow: "var(--shadow-glass-deep)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-5 pb-3 pt-4"
          style={{ borderBottom: "1px solid var(--color-hairline)" }}
        >
          <h2
            id="draft-editor-title"
            className="text-[15px] font-semibold tracking-[-0.01em]"
            style={{ color: "var(--color-ink)" }}
          >
            עריכת ההודעה
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="סגור"
            className="flex h-7 w-7 items-center justify-center rounded-[8px] transition-colors disabled:opacity-50"
            style={{
              background: "rgba(255,255,255,0.5)",
              color: "var(--color-ink-2)",
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={isPending}
            rows={8}
            dir="rtl"
            className="w-full resize-y rounded-[11px] px-3.5 py-3 text-[14px] leading-relaxed transition-colors disabled:opacity-60"
            style={{
              background: "rgba(255,255,255,0.7)",
              color: "var(--color-ink)",
              border: "1px solid var(--color-hairline-s)",
              outline: "none",
              fontFamily: "var(--font-sans)",
              minHeight: 160,
            }}
            placeholder="כתוב את ההודעה כאן..."
          />

          <div className="mt-2 flex items-center justify-between gap-3">
            <p
              className="text-[11px]"
              style={{ color: "var(--color-ink-3)" }}
            >
              עד 2,000 תווים. אל תוסיף קישורים שלא הוזכרו בטיוטה המקורית.
            </p>
            <span
              className="text-[11px] tabular-nums"
              style={{ color: counterColor }}
            >
              {length.toLocaleString("he-IL")} / 2,000
            </span>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 pb-4 pt-3"
          style={{
            background: "rgba(255,255,255,0.35)",
            borderTop: "1px solid var(--color-hairline)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-[10px] px-3.5 py-2 text-[12.5px] font-medium transition-colors disabled:opacity-50"
            style={{
              background: "rgba(255,255,255,0.6)",
              color: "var(--color-ink-2)",
              border: "1px solid var(--color-hairline)",
            }}
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "var(--color-sys-blue)",
              boxShadow: canSave ? "var(--shadow-cta)" : "none",
            }}
          >
            <Save size={13} strokeWidth={2} />
            {isPending ? "שומר..." : "שמירה"}
          </button>
        </div>
      </div>
    </div>
  );
}
