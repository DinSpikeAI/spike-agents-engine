// src/components/dashboard/spike-impact-widget.tsx
//
// Sprint 3F (2026-05-17) — Spike Impact owner-facing ROI widget.
//
// Headline 4-stat card. Tells the owner what Spike did for them this week
// in one 4-second scan. Mounted on /dashboard (top of main content, above
// existing KPI strip) and /dashboard/agents (top, above category sections).
//
// Empty state: if a tenant has no drafts AND no hot leads in the window,
// show a friendly "Spike is working, results soon" card instead of zeroes.
// Stops the awkward "the product looks broken" first-impression for new
// tenants in their first 24-48 hours.

import { Glass } from "@/components/ui/glass";
import { Sparkles, CheckCheck, Flame, Clock } from "lucide-react";
import type { SpikeImpactStats } from "@/lib/dashboard/spike-impact";

interface SpikeImpactWidgetProps {
  stats: SpikeImpactStats;
}

export function SpikeImpactWidget({ stats }: SpikeImpactWidgetProps) {
  if (!stats.hasMeaningfulActivity) {
    return (
      <Glass className="mb-6 p-5 sm:p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Sparkles
            size={26}
            strokeWidth={1.5}
            style={{ color: "var(--color-sys-blue)", opacity: 0.85 }}
          />
          <h2
            className="text-[15.5px] font-semibold tracking-tight"
            style={{ color: "var(--color-ink)" }}
          >
            Spike בעבודה
          </h2>
          <p
            className="max-w-md text-[12.5px] leading-[1.55]"
            style={{ color: "var(--color-ink-3)" }}
          >
            התוצאות הראשונות יופיעו כאן ברגע שהסוכנים יתחילו לרוץ. בינתיים — נסה
            ללחוץ "הרץ עכשיו" על סוכן ביקורות או רשתות חברתיות, ותראה כאן את
            הפעילות תוך דקות.
          </p>
        </div>
      </Glass>
    );
  }

  return (
    <Glass className="mb-6 p-5 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex items-baseline justify-between">
        <h2
          className="text-[15.5px] font-semibold tracking-tight"
          style={{ color: "var(--color-ink)" }}
        >
          השבוע ב-Spike
        </h2>
        <span
          className="text-[11px]"
          style={{ color: "var(--color-ink-3)" }}
        >
          {stats.windowDays} ימים אחרונים
        </span>
      </div>

      {/* 4-up grid: 2x2 on mobile, 4-wide on sm+ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCell
          Icon={Sparkles}
          accent="#8B5CF6"
          accentSoft="rgba(139, 92, 246, 0.08)"
          value={stats.draftsCreated}
          label="טיוטות נוצרו"
        />
        <StatCell
          Icon={CheckCheck}
          accent="var(--color-sys-green)"
          accentSoft="rgba(48, 209, 88, 0.10)"
          value={stats.draftsApprovedOrSent}
          label="אישרת ושלחנו"
        />
        <StatCell
          Icon={Flame}
          accent="#F59E0B"
          accentSoft="rgba(245, 158, 11, 0.10)"
          value={stats.hotLeadsCount}
          label="לידים חמים"
        />
        <StatCell
          Icon={Clock}
          accent="var(--color-sys-blue)"
          accentSoft="rgba(10, 132, 255, 0.08)"
          value={`~${stats.hoursSaved}`}
          label="שעות שחסכת"
        />
      </div>

      {/* Footer note explaining the hours-saved calculation — transparency
          builds trust; opaque metrics build suspicion. */}
      <p
        className="mt-3 text-[10.5px] leading-[1.5]"
        style={{ color: "var(--color-ink-3)" }}
      >
        "שעות שחסכת" מוערך על בסיס 2.5 דקות ניסוח ידני לכל הודעה שאישרת.
      </p>
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────
// Individual stat cell
// ─────────────────────────────────────────────────────────────

interface StatCellProps {
  Icon: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    style?: React.CSSProperties;
  }>;
  accent: string; // e.g. "#8B5CF6" or "var(--color-sys-blue)"
  accentSoft: string; // background tint for the icon chip
  value: number | string;
  label: string;
}

function StatCell({ Icon, accent, accentSoft, value, label }: StatCellProps) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-[10px] px-3 py-3"
      style={{
        background: "rgba(255,255,255,0.55)",
        border: "1px solid var(--color-hairline)",
      }}
    >
      <div
        className="flex h-6 w-6 items-center justify-center rounded-[7px]"
        style={{ background: accentSoft }}
      >
        <Icon size={13} strokeWidth={2} style={{ color: accent }} />
      </div>
      <div
        className="text-[22px] font-semibold leading-none tabular-nums"
        style={{ color: "var(--color-ink)" }}
      >
        {value}
      </div>
      <div
        className="text-[11px] leading-[1.3]"
        style={{ color: "var(--color-ink-3)" }}
      >
        {label}
      </div>
    </div>
  );
}
