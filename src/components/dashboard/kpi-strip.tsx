import { Glass } from "@/components/ui/glass";

interface KpiStripProps {
  pendingApprovals: number;
  todaysActions: number;
  monthlySpend: number;
  monthlyCap: number;
}

export function KpiStrip({
  pendingApprovals,
  todaysActions,
  monthlySpend,
  monthlyCap,
}: KpiStripProps) {
  // Format spend safely — tolerates zeros and decimals.
  const spendDisplay =
    monthlyCap > 0
      ? `₪${monthlySpend.toFixed(monthlySpend < 10 ? 2 : 0)}`
      : "—";
  const spendSub =
    monthlyCap > 0
      ? `מתוך ₪${monthlyCap} בחודש`
      : "טרם הוגדרה מכסה";
  const spendUtilPct =
    monthlyCap > 0
      ? Math.min(100, Math.round((monthlySpend / monthlyCap) * 100))
      : 0;

  const kpis = [
    {
      label: "מחכים לאישור",
      value: String(pendingApprovals),
      sub:
        pendingApprovals === 0
          ? "תיבת האישורים ריקה"
          : pendingApprovals === 1
          ? "פריט מחכה לי"
          : "פריטים מחכים לי",
      isPrimary: true,
    },
    {
      label: "פעולות היום",
      value: String(todaysActions),
      sub:
        todaysActions === 0
          ? "עדיין לא רץ סוכן היום"
          : todaysActions === 1
          ? "טיוטה הוכנה היום"
          : "טיוטות הוכנו היום",
      isPrimary: false,
    },
    {
      label: "עלות חודשית",
      value: spendDisplay,
      sub: spendSub,
      isPrimary: false,
      utilPct: spendUtilPct,
    },
  ];

  return (
    <div className="mb-[18px] grid grid-cols-1 gap-3 sm:grid-cols-3">
      {kpis.map((k, i) => (
        <Glass key={i} deep={k.isPrimary} className="px-[18px] py-4">
          <div
            className="text-[11.5px] font-medium"
            style={{ color: "var(--color-ink-3)" }}
          >
            {k.label}
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

          {/* Utilization bar — only on the spend card */}
          {k.utilPct !== undefined && monthlyCap > 0 && (
            <div
              className="mt-2.5 h-1 overflow-hidden rounded-full"
              style={{ background: "rgba(15,20,30,0.06)" }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${k.utilPct}%`,
                  background:
                    k.utilPct > 80
                      ? "var(--color-sys-pink)"
                      : k.utilPct > 50
                      ? "var(--color-sys-amber)"
                      : "var(--color-sys-green)",
                }}
              />
            </div>
          )}
        </Glass>
      ))}
    </div>
  );
}
