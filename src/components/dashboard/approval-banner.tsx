"use client";

interface ApprovalBannerProps {
  count: number;
  summary: string;
  onClick?: () => void;
}

const BoltIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

export function ApprovalBanner({ count, summary, onClick }: ApprovalBannerProps) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      className="group relative mb-6 flex w-full items-center gap-4 overflow-hidden rounded-2xl px-5 py-4 text-right transition-all"
      style={{
        background: "linear-gradient(135deg, rgba(252, 211, 77, 0.08), rgba(252, 211, 77, 0.02))",
        border: "1px solid rgba(252, 211, 77, 0.25)",
      }}
    >
      {/* Right indicator strip */}
      <span
        className="absolute top-0 bottom-0"
        style={{
          insetInlineEnd: 0,
          width: "3px",
          background: "var(--spike-amber)",
        }}
      />

      {/* Icon */}
      <div
        className="flex size-11 flex-shrink-0 items-center justify-center rounded-xl"
        style={{
          background: "rgba(252, 211, 77, 0.15)",
          color: "var(--spike-amber)",
        }}
      >
        {BoltIcon}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white">
          {count} פריטים מחכים לאישורך
        </div>
        <div
          className="mt-0.5 text-xs"
          style={{ color: "var(--spike-text-dim)" }}
        >
          {summary}
        </div>
      </div>

      {/* Arrow */}
      <span
        className="text-xl transition-transform group-hover:-translate-x-1"
        style={{ color: "var(--spike-amber)" }}
      >
        ←
      </span>
    </button>
  );
}
