// src/app/dashboard/growth/loading.tsx
//
// Sub-stage 1.15 — Sprint 2 Batch 2B
// Streaming fallback for /dashboard/growth.
//
// Picked up automatically by Next.js when the page suspends. Mirrors
// the eventual page's chrome offsets (md:mr-[232px] for the sidebar)
// so the layout doesn't jump on hand-off. Three placeholder cards is
// the most we'd typically show above the fold.

export default function GrowthLoading() {
  return (
    <div
      className="relative min-h-screen"
      dir="rtl"
      style={{
        color: "var(--color-ink)",
        background: "var(--color-mist-blue)",
      }}
    >
      <div className="md:mr-[232px]">
        <main className="spike-scroll mx-auto max-w-[1280px] px-4 pb-[96px] pt-5 sm:px-6 md:px-10 md:pb-20 md:pt-8">
          {/* Page header skeleton */}
          <div className="mb-7 flex items-center gap-3">
            <div
              className="h-11 w-11 animate-pulse rounded-[12px]"
              style={{ background: "rgba(255,255,255,0.6)" }}
            />
            <div className="flex-1 space-y-2">
              <div
                className="h-5 w-40 animate-pulse rounded-md"
                style={{ background: "rgba(255,255,255,0.6)" }}
              />
              <div
                className="h-3 w-60 animate-pulse rounded-md"
                style={{ background: "rgba(255,255,255,0.4)" }}
              />
            </div>
          </div>

          {/* ROI strip skeleton */}
          <div
            className="mb-6 h-[112px] animate-pulse rounded-[14px]"
            style={{
              background: "var(--color-glass)",
              boxShadow: "var(--shadow-glass)",
            }}
          />

          {/* List skeleton — 3 placeholder cards, staggered for calm */}
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[200px] animate-pulse rounded-[14px]"
                style={{
                  background: "var(--color-glass)",
                  boxShadow: "var(--shadow-glass)",
                  animationDelay: `${i * 120}ms`,
                }}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
