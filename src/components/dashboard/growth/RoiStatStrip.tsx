// src/components/dashboard/growth/RoiStatStrip.tsx
//
// Sub-stage 1.15 — Sprint 2 Batch 2B
// Top-of-page ROI snapshot for /dashboard/growth.
//
// Pure server component. Receives the snapshot pre-fetched in page.tsx
// (via getGrowthRoi). Three stats inside a Glass surface, each tile
// tinted with --color-cat-insight — the same family that Hot Leads /
// Manager / Inventory share in the agent grid, since Growth is also
// "insight" in the calm-frosted taxonomy.
//
// Empty-state behavior: when there were no drafts in the last 30 days
// we still render the strip but values read "0" — the strip remains
// in place, with the window subtitle making clear there's just no
// activity yet rather than silently disappearing on first-run.
//
// Anti-AI hygiene (§1.9): no em-dashes, no hashtags, no inline quotes.
// Owner-facing UI is technically out of scope for the agent rules,
// but we keep the codebase consistent.

import { Glass } from "@/components/ui/glass";
import { FileText, TrendingUp, Coins } from "lucide-react";
import type { GrowthRoiSnapshot } from "@/app/dashboard/actions/growth";

interface RoiStatStripProps {
  snapshot: GrowthRoiSnapshot;
}

const ILS_FORMATTER = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("he-IL");

function formatRevenue(value: number): string {
  if (!isFinite(value) || value <= 0) return "₪0";
  // Drop fraction for readability — getGrowthRoi already rounds to 2dp,
  // and at the dashboard level whole shekels are enough.
  return ILS_FORMATTER.format(Math.round(value));
}

function formatConversion(rate: number, total: number): string {
  if (total === 0) return "0%";
  // rate is 0..1 with 4-decimal precision from getGrowthRoi
  return `${Math.round(rate * 100)}%`;
}

export function RoiStatStrip({ snapshot }: RoiStatStripProps) {
  const stats = [
    {
      label: "טיוטות שנוצרו",
      value: NUMBER_FORMATTER.format(snapshot.draftsCreated),
      Icon: FileText,
    },
    {
      label: "אחוז סגירה",
      value: formatConversion(snapshot.conversionRate, snapshot.draftsCreated),
      Icon: TrendingUp,
    },
    {
      label: "הכנסה מדווחת",
      value: formatRevenue(snapshot.revenueIls),
      Icon: Coins,
    },
  ];

  const closedLabel =
    snapshot.draftsClosed === 1 ? "סגירה אחת" : `${snapshot.draftsClosed} סגירות`;
  const rejectedLabel =
    snapshot.draftsRejected === 1
      ? "1 נדחתה"
      : `${snapshot.draftsRejected} נדחו`;

  return (
    <Glass className="mb-6 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          className="text-[13px] font-semibold tracking-[-0.01em]"
          style={{ color: "var(--color-ink)" }}
        >
          תוצאות ב-30 הימים האחרונים
        </h2>
        <span
          className="text-[11.5px]"
          style={{ color: "var(--color-ink-3)" }}
        >
          {closedLabel} · {rejectedLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {stats.map(({ label, value, Icon }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-[11px] p-3 sm:p-3.5"
            style={{
              background: "var(--color-cat-insight)",
              border: "1px solid var(--color-frost-edge)",
            }}
          >
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[9px]"
              style={{
                background: "rgba(255,255,255,0.7)",
                border: "1px solid var(--color-frost-edge)",
              }}
            >
              <Icon
                size={16}
                strokeWidth={1.75}
                style={{ color: "var(--color-cat-insight-fg)" }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="text-[11px] leading-tight"
                style={{ color: "var(--color-ink-2)" }}
              >
                {label}
              </div>
              <div
                className="mt-0.5 text-[18px] font-semibold tracking-[-0.02em] tabular-nums"
                style={{ color: "var(--color-ink)" }}
              >
                {value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Glass>
  );
}
