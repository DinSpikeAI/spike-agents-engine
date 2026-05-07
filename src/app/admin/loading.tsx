// src/app/admin/loading.tsx
//
// Sub-stage 1.14.3 — Instant visual feedback for /admin/* navigation.
// Same rationale as dashboard/loading.tsx — see that file for context.
// Uses --spike-* design tokens to match the admin command center theme.

export default function AdminLoading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      dir="rtl"
      style={{ background: "var(--spike-bg)" }}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-8 w-8 animate-spin rounded-full"
          style={{
            border: "2px solid rgba(255,255,255,0.08)",
            borderTopColor: "var(--spike-teal)",
          }}
        />
        <span
          className="text-[12.5px]"
          style={{ color: "var(--spike-text-mute)" }}
        >
          טוען...
        </span>
      </div>
    </div>
  );
}
