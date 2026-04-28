// src/components/dashboard/header.tsx
//
// Top header with 4 global KPIs.
// Mobile: collapses to horizontal scroll strip.

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Inbox, Activity, TrendingUp, Wallet } from "lucide-react";

interface KPI {
  label: string;
  value: string;
  icon: React.ElementType;
  variant?: "default" | "warning" | "success";
  hint?: string;
}

const KPIS: KPI[] = [
  {
    label: "דורש אישור",
    value: "0",
    icon: Inbox,
    variant: "default",
    hint: "אין פריטים מחכים",
  },
  {
    label: "פעולות היום",
    value: "0",
    icon: Activity,
    variant: "default",
    hint: "הסוכנים עוד לא רצו היום",
  },
  {
    label: "חיסכון השבוע",
    value: "₪0",
    icon: TrendingUp,
    variant: "success",
    hint: "נחשב אוטומטית",
  },
  {
    label: "עלות החודש",
    value: "₪0 / ₪50",
    icon: Wallet,
    variant: "default",
    hint: "תקציב חודשי",
  },
];

export function DashboardHeader() {
  return (
    <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mb-6">
      <div className="flex md:grid md:grid-cols-4 gap-3 min-w-max md:min-w-0">
        {KPIS.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card
              key={kpi.label}
              className={cn(
                "p-4 min-w-[180px] md:min-w-0",
                kpi.variant === "warning" && "border-amber-500/30",
                kpi.variant === "success" && "border-emerald-500/30"
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <Icon
                  className={cn(
                    "h-4 w-4",
                    kpi.variant === "warning" && "text-amber-500",
                    kpi.variant === "success" && "text-emerald-500",
                    kpi.variant === "default" && "text-muted-foreground"
                  )}
                />
              </div>
              <p className="text-2xl font-bold mb-1" dir="ltr">
                {kpi.value}
              </p>
              {kpi.hint && (
                <p className="text-xs text-muted-foreground">{kpi.hint}</p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}