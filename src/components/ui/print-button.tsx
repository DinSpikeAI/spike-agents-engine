// src/components/ui/print-button.tsx
//
// Sub-stage 1.13 — Print / Save as PDF button.
//
// Uses the browser's built-in `window.print()` API which opens the native
// print dialog. From there the user can:
//   - Print to a real printer
//   - Choose "Save as PDF" as the destination (every modern browser
//     including iOS Safari ships this option)
//
// Why this approach instead of a PDF library:
//   - Zero new dependencies
//   - Hebrew RTL works perfectly because the browser uses the page's
//     own DOM + fonts (no library re-rendering with broken RTL support)
//   - Works on mobile out of the box
//   - The same code path produces both real prints and PDFs
//
// What the button hides itself on print (`print:hidden`) so it doesn't
// appear in the printed output.
//
// Pages that use this button must mark their non-content chrome (sidebar,
// nav, FABs, action buttons) with `print:hidden` so only the report
// renders. See inventory page and reports detail page for examples.

"use client";

import { Printer } from "lucide-react";

interface PrintButtonProps {
  /** Visible label. Defaults to a Hebrew "Print / PDF" combo. */
  label?: string;
  /** ARIA label override; defaults to a Hebrew description. */
  ariaLabel?: string;
}

export function PrintButton({
  label = "הדפס / שמור PDF",
  ariaLabel = "הדפס את הדוח או שמור אותו כקובץ PDF",
}: PrintButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium transition-opacity hover:opacity-80 print:hidden"
      style={{
        background: "rgba(255,255,255,0.65)",
        border: "1px solid var(--color-hairline)",
        color: "var(--color-ink-2)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
      aria-label={ariaLabel}
      title="לחיצה תפתח דיאלוג הדפסה. שם תוכל לבחור מדפסת או 'שמור כ-PDF'."
    >
      <Printer size={13} strokeWidth={1.75} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
