import { Glass } from "@/components/ui/glass";

interface KpiStripProps {
  pendingApprovals: number;
  todaysActions: number;
  todaysActionsDelta: string;
  todaysActionsUp: boolean;
  todaysActionsSparkline: number[];
  weeklySavings: number;
  monthlySpend: number;
  monthlyCap: number;
}

export function KpiStrip({
  pendingApprovals,
  todaysActions,
  todaysActionsDelta,
  weeklySavings,
  monthlySpend,
  monthlyCap,
}: KpiStripProps) {
  const kpis = [
    {
      label: "מחכים לאישור",
      value: String(pendingApprovals),
      sub: pendingApprovals === 1 ? "פריט מחכה לי" : "פריטים מחכים לי",
      trend: "+3 מהיום",
      isPrimary: true,
    },
    {
      label: "פעולות היום",
      value: String(todaysActions),
      sub: "פעולות שהוכנו",
      trend: todaysActionsDelta,
      isPrimary: false,
    },
    {
      label: "חיסכון השבוע",
      value: `₪${weeklySavings.toLocaleString("en-US")}`,
      sub: "לעומת ניהול ידני",
      trend: "+12% מהשבוע",
      isPrimary: false,
    },
    {
      label: "עלות חודשית",
      value: `₪${monthlySpend}/${monthlyCap}`,
      sub: "תכנית חודשית",
      trend: "מינוס 1 לחודש",
      isPrimary: false,
    },
  ];

  return (
    <div className="mb-[18px] grid grid-cols-2 gap-3 lg:flex lg:gap-3">
      {kpis.map((k, i) => (
        <Glass
          key={i}
          deep={k.isPrimary}
          className="flex-1 px-[18px] py-4"
        >
          <div className="flex items-center justify-between">
            <div
              className="text-[11.5px] font-medium"
              style={{ color: "var(--color-ink-3)" }}
            >
              {k.label}
            </div>
            <span
              className="text-[10.5px] font-mono"
              style={{ color: "var(--color-sys-green)" }}
            >
              {k.trend}
            </span>
          </div>
          <div
            className="mt-2.5 text-[30px] font-semibold tracking-[-0.03em]"
            style={{ color: "var(--color-ink)" }}
          >
            {k.value}
          </div>
          <div
            className="mt-0.5 text-[12px]"
            style={{ color: "var(--color-ink-2)" }}
          >
            {k.sub}
          </div>
        </Glass>
      ))}
    </div>
  );
}
