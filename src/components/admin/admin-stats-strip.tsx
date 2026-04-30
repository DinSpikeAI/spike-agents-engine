// src/components/admin/admin-stats-strip.tsx
//
// Day 11B — Top-of-page metrics for the Admin Command Center.
//
// 5 KPI cards arranged in a single row (responsive: stack on mobile).
// Same visual language as components/dashboard/kpi-strip.tsx.

import type { GlobalSpendStats } from "@/lib/admin/queries";

interface Props {
  stats: GlobalSpendStats;
}

export function AdminStatsStrip({ stats }: Props) {
  const utilizationPct = Math.round(stats.utilizationPercent * 100);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {/* Total tenants */}
      <KpiCard
        label="לקוחות"
        value={stats.tenantCount.total.toString()}
        sublabel={`${stats.tenantCount.active} פעילים · ${stats.tenantCount.inactive} מושהים`}
        accentColor="var(--spike-teal)"
      />

      {/* At-risk count */}
      <KpiCard
        label="בסיכון"
        value={stats.atRiskCount.toString()}
        sublabel={
          stats.atRiskCount === 0
            ? "אין לקוחות בסיכון"
            : `דורש תשומת לב`
        }
        accentColor={
          stats.atRiskCount === 0 ? "var(--spike-teal)" : "rgba(255, 164, 181, 1)"
        }
      />

      {/* Total spend this month */}
      <KpiCard
        label="הוצאה החודש"
        value={`₪${stats.totalSpendThisMonthIls.toFixed(2)}`}
        sublabel="עלות API בפועל"
        accentColor="var(--spike-cyan)"
      />

      {/* Total revenue potential */}
      <KpiCard
        label="פוטנציאל מכסה"
        value={`₪${stats.totalRevenuePotentialIls.toFixed(0)}`}
        sublabel="סכום מכסות פעילות"
        accentColor="var(--spike-warm)"
      />

      {/* Aggregate utilization */}
      <KpiCard
        label="ניצול גלובלי"
        value={`${utilizationPct}%`}
        sublabel={
          utilizationPct < 20
            ? "שימוש נמוך — engagement חלש"
            : utilizationPct > 80
            ? "שימוש גבוה — בדוק caps"
            : "טווח בריא"
        }
        accentColor={
          utilizationPct < 20
            ? "var(--spike-amber)"
            : utilizationPct > 80
            ? "rgba(255, 164, 181, 1)"
            : "var(--spike-teal)"
        }
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Internal: one KPI card
// ─────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  sublabel: string;
  accentColor: string;
}

function KpiCard({ label, value, sublabel, accentColor }: KpiCardProps) {
  return (
    <div
      className="rounded-xl px-4 py-4"
      style={{
        background: "var(--spike-surface)",
        border: "1px solid var(--spike-border)",
      }}
    >
      <div
        className="mb-2 text-xs uppercase tracking-wider"
        style={{ color: "var(--spike-text-mute)" }}
      >
        {label}
      </div>
      <div
        className="mb-1 text-2xl font-bold"
        style={{ color: accentColor }}
      >
        {value}
      </div>
      <div
        className="text-xs"
        style={{ color: "var(--spike-text-dim)" }}
      >
        {sublabel}
      </div>
    </div>
  );
}
