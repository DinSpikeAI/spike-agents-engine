// src/components/admin/global-health-table.tsx
//
// Day 11B — Global health table for the Admin Command Center.
//
// Shows every tenant with risk badge, spend utilization bar, and key metrics.
// Pre-sorted by listAllTenantsWithHealth: at_risk → warning → unknown → healthy.

import type { AdminTenantRow, RiskLevel } from "@/lib/admin/queries";

interface Props {
  tenants: AdminTenantRow[];
}

export function GlobalHealthTable({ tenants }: Props) {
  if (tenants.length === 0) {
    return (
      <div
        className="rounded-xl px-6 py-8 text-center"
        style={{
          background: "var(--spike-surface)",
          border: "1px solid var(--spike-border)",
          color: "var(--spike-text-dim)",
        }}
      >
        אין לקוחות במערכת.
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--spike-surface)",
        border: "1px solid var(--spike-border)",
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-right">
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--spike-border)",
                color: "var(--spike-text-mute)",
              }}
            >
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-medium">לקוח</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-medium">סטטוס</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-medium">בריאות</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-medium">ניצול מכסה</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-medium">הוצאה / מכסה</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-medium">vertical</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t, idx) => (
              <tr
                key={t.id}
                style={{
                  borderBottom:
                    idx < tenants.length - 1
                      ? "1px solid var(--spike-border)"
                      : "none",
                  background: t.isActive ? "transparent" : "rgba(255,164,181,0.04)",
                }}
              >
                {/* Tenant name + ID */}
                <td className="px-4 py-3">
                  <div className="font-medium" style={{ color: "var(--spike-text)" }}>
                    {t.name}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--spike-text-mute)", direction: "ltr" }}
                  >
                    {t.id.slice(0, 8)}
                  </div>
                </td>

                {/* Active/inactive */}
                <td className="px-4 py-3">
                  {t.isActive ? (
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-xs"
                      style={{
                        background: "rgba(34, 211, 176, 0.15)",
                        color: "var(--spike-teal-light)",
                      }}
                    >
                      פעיל
                    </span>
                  ) : (
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-xs"
                      style={{
                        background: "rgba(255, 164, 181, 0.15)",
                        color: "rgba(255, 164, 181, 1)",
                      }}
                    >
                      מושהה
                    </span>
                  )}
                </td>

                {/* Health badge */}
                <td className="px-4 py-3">
                  <RiskBadge level={t.riskLevel} score={t.healthScore} />
                </td>

                {/* Utilization bar */}
                <td className="px-4 py-3 min-w-[140px]">
                  <UtilizationBar utilization={t.utilization} />
                </td>

                {/* Spend / cap numbers */}
                <td
                  className="px-4 py-3 text-sm whitespace-nowrap"
                  style={{ color: "var(--spike-text)" }}
                >
                  ₪{t.spendUsedIls.toFixed(2)}
                  <span style={{ color: "var(--spike-text-mute)" }}>
                    {" / ₪"}
                    {t.spendCapIls.toFixed(0)}
                  </span>
                </td>

                {/* Vertical */}
                <td
                  className="px-4 py-3 text-sm"
                  style={{ color: "var(--spike-text-dim)" }}
                >
                  {t.vertical}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Internal: risk badge
// ─────────────────────────────────────────────────────────────

function RiskBadge({
  level,
  score,
}: {
  level: RiskLevel;
  score: number | null;
}) {
  const config = {
    at_risk: {
      label: "בסיכון",
      bg: "rgba(255, 164, 181, 0.18)",
      color: "rgba(255, 164, 181, 1)",
    },
    warning: {
      label: "אזהרה",
      bg: "rgba(252, 211, 77, 0.18)",
      color: "var(--spike-amber)",
    },
    healthy: {
      label: "בריא",
      bg: "rgba(34, 211, 176, 0.18)",
      color: "var(--spike-teal-light)",
    },
    unknown: {
      label: "טרם חושב",
      bg: "rgba(148, 163, 184, 0.12)",
      color: "var(--spike-text-mute)",
    },
  }[level];

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
        style={{ background: config.bg, color: config.color }}
      >
        {config.label}
      </span>
      {score !== null && (
        <span
          className="text-xs font-mono"
          style={{ color: "var(--spike-text-mute)", direction: "ltr" }}
        >
          {score}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Internal: utilization bar
// ─────────────────────────────────────────────────────────────

function UtilizationBar({ utilization }: { utilization: number }) {
  // Color thresholds
  const pct = Math.round(utilization * 100);
  const displayPct = Math.min(100, pct); // bar caps at 100% visually

  const color =
    utilization < 0.2
      ? "var(--spike-amber)" // disengagement
      : utilization > 0.95
      ? "rgba(255, 164, 181, 1)" // at-risk
      : utilization > 0.8
      ? "var(--spike-amber)" // approaching cap
      : "var(--spike-teal)"; // healthy

  return (
    <div className="flex items-center gap-2">
      <div
        className="relative h-2 flex-1 overflow-hidden rounded-full"
        style={{ background: "rgba(148, 163, 184, 0.12)" }}
      >
        <div
          className="absolute right-0 top-0 h-full rounded-full transition-all"
          style={{
            width: `${displayPct}%`,
            background: color,
          }}
        />
      </div>
      <span
        className="text-xs font-mono whitespace-nowrap"
        style={{ color: "var(--spike-text-mute)", direction: "ltr", minWidth: "3ch" }}
      >
        {pct}%
      </span>
    </div>
  );
}
