"use client";

interface KPI {
  label: string;
  value: string;
  delta?: string;
  deltaUp?: boolean;
  alert?: boolean;
  icon: React.ReactNode;
  sparkline?: number[];
}

const InboxIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

const ClockIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6v6l4 2" />
  </svg>
);

const TrendIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);

const CardIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 9h18" />
  </svg>
);

function Sparkline({ points }: { points: number[] }) {
  if (!points.length) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const w = 60;
  const h = 20;
  const step = w / (points.length - 1);
  const polyPoints = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="absolute"
      style={{ bottom: 12, insetInlineStart: 16, opacity: 0.85 }}
    >
      <polyline
        points={polyPoints}
        fill="none"
        stroke="var(--spike-teal)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface KpiStripProps {
  pendingApprovals: number;
  todaysActions: number;
  todaysActionsDelta?: string;
  todaysActionsUp?: boolean;
  todaysActionsSparkline?: number[];
  weeklySavings: number;
  monthlySpend: number;
  monthlyCap: number;
}

export function KpiStrip({
  pendingApprovals,
  todaysActions,
  todaysActionsDelta = "▲ 8% מאתמול",
  todaysActionsUp = true,
  todaysActionsSparkline = [15, 12, 14, 8, 10, 4, 6],
  weeklySavings,
  monthlySpend,
  monthlyCap,
}: KpiStripProps) {
  const kpis: KPI[] = [
    {
      label: "דורש אישור",
      value: pendingApprovals.toString(),
      delta: pendingApprovals > 0 ? "פריטים חדשים מחכים" : "אין פריטים מחכים",
      alert: pendingApprovals > 0,
      icon: InboxIcon,
    },
    {
      label: "פעולות היום",
      value: todaysActions.toString(),
      delta: todaysActionsDelta,
      deltaUp: todaysActionsUp,
      icon: ClockIcon,
      sparkline: todaysActionsSparkline,
    },
    {
      label: "חיסכון השבוע",
      value: `₪${weeklySavings.toLocaleString("en-US")}`,
      delta: "לעומת ניהול ידני",
      icon: TrendIcon,
    },
    {
      label: "עלות החודש",
      value: `₪${monthlySpend.toFixed(0)}/${monthlyCap}`,
      delta: "חיוב ב-1 לחודש",
      icon: CardIcon,
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi, i) => (
        <div
          key={i}
          className="relative overflow-hidden rounded-2xl px-5 py-4.5 transition-all"
          style={{
            background: kpi.alert
              ? "linear-gradient(180deg, rgba(252, 211, 77, 0.08), rgba(252, 211, 77, 0.02))"
              : "linear-gradient(180deg, var(--spike-surface), var(--spike-bg-2))",
            border: kpi.alert
              ? "1px solid rgba(252, 211, 77, 0.25)"
              : "1px solid var(--spike-border)",
          }}
        >
          <div
            className="mb-3 flex items-center gap-2 text-xs font-medium"
            style={{ color: kpi.alert ? "var(--spike-amber)" : "var(--spike-text-mute)" }}
          >
            <span className="size-3.5">{kpi.icon}</span>
            {kpi.label}
          </div>
          <div
            className="text-[28px] font-extrabold leading-none text-white"
            style={{ letterSpacing: "-0.025em" }}
            dir={kpi.value.startsWith("₪") ? "ltr" : undefined}
          >
            {kpi.value}
          </div>
          {kpi.delta && (
            <div
              className="mt-2 flex items-center gap-1.5 text-xs"
              style={{
                color: kpi.deltaUp
                  ? "var(--spike-teal)"
                  : kpi.alert
                  ? "var(--spike-amber)"
                  : "var(--spike-text-mute)",
              }}
            >
              {kpi.delta}
            </div>
          )}
          {kpi.sparkline && <Sparkline points={kpi.sparkline} />}
        </div>
      ))}
    </div>
  );
}
