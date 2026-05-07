// src/app/dashboard/loading.tsx
//
// Sub-stage 1.14.3 — Instant visual feedback on sidebar navigation.
//
// Next.js shows this component immediately while the matching page.tsx
// is still loading server-side. Without it, clicking a sidebar link
// looked frozen for 1-2s on Vercel cold starts + Frankfurt DB latency.
//
// Note: this REPLACES the sidebar during loading because Sidebar lives
// in page.tsx (not layout.tsx). Sidebar will flicker once per navigation,
// but the alternative — no feedback at all — felt worse to Dean.
// Long-term fix: move Sidebar into a /dashboard/layout.tsx (deferred).

export default function DashboardLoading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      dir="rtl"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-8 w-8 animate-spin rounded-full"
          style={{
            border: "2px solid var(--color-hairline)",
            borderTopColor: "var(--color-sys-blue)",
          }}
        />
        <span
          className="text-[12.5px]"
          style={{ color: "var(--color-ink-3)" }}
        >
          טוען...
        </span>
      </div>
    </div>
  );
}
