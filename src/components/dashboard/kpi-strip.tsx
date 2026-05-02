import { Glass } from "@/components/ui/glass";
import { Inbox, Activity, Wallet } from "lucide-react";

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

  type Kpi = {
    label: string;
    value: string;
    sub: string;
    Icon: typeof Inbox;
    isPrimary: boolean;
    utilPct?: number;
  };

  const kpis: Kpi[] = [
    {
      label: "מחכים לאישור",
      value: String(pendingApprovals),
      sub:
        pendingApprovals === 0
          ? "תיבת האישורים ריקה"
          : pendingApprovals === 1
            ? "פריט מחכה לי"
            : "פריטים מחכים לי",
      Icon: Inbox,
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
      Icon: Activity,
      isPrimary: false,
    },
    {
      label: "עלות חודשית",
      value: spendDisplay,
      sub: spendSub,
      Icon: Wallet,
      isPrimary: false,
      utilPct: spendUtilPct,
    },
  ];

  return (
    <div
      className="
        mb-[18px]
        -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 spike-scroll
        sm:mx-0 sm:grid sm:snap-none sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0
      "
      style={{ scrollbarWidth: "none" }}
    >
      {kpis.map((k, i) => {
        const Icon = k.Icon;
        return (
          <div
            key={i}
            className="
              flex-shrink-0 snap-center
              w-[78%] min-w-[260px]
              sm:w-auto sm:min-w-0
            "
          >
            <Glass deep={k.isPrimary} className="h-full px-[18px] py-4">
              <div className="flex items-center justify-between">
                <div
                  className="text-[11.5px] font-medium"
                  style={{ color: "var(--color-ink-3)" }}
                >
                  {k.label}
                </div>
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-md"
                  style={{
                    background: k.isPrimary
                      ? "var(--color-sys-blue-soft)"
                      : "rgba(15,20,30,0.04)",
                    color: k.isPrimary
                      ? "var(--color-sys-blue)"
                      : "var(--color-ink-3)",
                  }}
                >
                  <Icon size={12} strokeWidth={1.75} />
                </div>
              </div>

              <div
                className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.035em]"
                style={{ color: "var(--color-ink)" }}
              >
                {k.value}
              </div>

              <div
                className="mt-1 text-[12px]"
                style={{ color: "var(--color-ink-2)" }}
              >
                {k.sub}
              </div>

              {k.utilPct !== undefined && monthlyCap > 0 && (
                <div className="mt-3">
                  <div
                    className="h-1 overflow-hidden rounded-full"
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
                        transition:
                          "width var(--duration-slow) var(--ease-soft)",
                      }}
                    />
                  </div>
                  <div
                    className="mt-1 text-[10.5px] font-medium tabular-nums"
                    style={{ color: "var(--color-ink-3)" }}
                  >
                    {k.utilPct}% נוצל
                  </div>
                </div>
              )}
            </Glass>
          </div>
        );
      })}
    </div>
  );
}
