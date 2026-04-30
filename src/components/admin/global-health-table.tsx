// src/components/admin/global-health-table.tsx
//
// Day 11B + 11C — Global health table with admin actions.
//
// Day 11B: pure display (server component)
// Day 11C: actions (client component) — Manager trigger + active toggle
//
// We render as a client component because each row has interactive buttons
// that call server actions and need per-row loading state. The data itself
// is fetched server-side in admin/page.tsx and passed down as a prop.

"use client";

import { useState, useTransition } from "react";
import {
  triggerManagerForTenantAsAdmin,
  setTenantActive,
} from "@/app/admin/actions";
import type { AdminTenantRow, RiskLevel } from "@/lib/admin/queries";

interface Props {
  tenants: AdminTenantRow[];
}

export function GlobalHealthTable({ tenants }: Props) {
  // Per-tenant loading state. Two flags: 'manager' = trigger Manager,
  // 'toggle' = flip is_active. Map keyed by tenant id.
  const [busy, setBusy] = useState<Map<string, "manager" | "toggle">>(
    new Map()
  );
  const [, startTransition] = useTransition();

  function setTenantBusy(id: string, action: "manager" | "toggle" | null) {
    setBusy((prev) => {
      const next = new Map(prev);
      if (action === null) next.delete(id);
      else next.set(id, action);
      return next;
    });
  }

  async function handleTriggerManager(tenant: AdminTenantRow) {
    const ok = window.confirm(
      `להפעיל סוכן מנהל עבור "${tenant.name}"?\n\n` +
        `שים לב: זה יעקוף את נעילת השבוע ויעלה כ-₪0.50 ממכסת הלקוח.`
    );
    if (!ok) return;

    setTenantBusy(tenant.id, "manager");
    try {
      const result = await triggerManagerForTenantAsAdmin(tenant.id);
      if (result.success) {
        const cost = result.result?.costActualIls?.toFixed(4) ?? "0";
        window.alert(
          `✓ הפעלת סוכן מנהל הצליחה עבור ${tenant.name}.\nעלות: ₪${cost}`
        );
        startTransition(() => {
          // Page revalidates via revalidatePath in the action; trigger router refresh.
          window.location.reload();
        });
      } else {
        window.alert(`❌ הפעלה נכשלה: ${result.error ?? "שגיאה לא ידועה"}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
      window.alert(`❌ שגיאה: ${message}`);
    } finally {
      setTenantBusy(tenant.id, null);
    }
  }

  async function handleToggleActive(tenant: AdminTenantRow) {
    const newState = !tenant.isActive;
    const verb = newState ? "להפעיל" : "להשהות";
    const consequence = newState
      ? "החשבון יוכל להריץ סוכנים שוב."
      : "כל הסוכנים של הלקוח ייחסמו מיידית.";
    const ok = window.confirm(
      `${verb} את "${tenant.name}"?\n\n${consequence}`
    );
    if (!ok) return;

    setTenantBusy(tenant.id, "toggle");
    try {
      const result = await setTenantActive(tenant.id, newState);
      if (result.success) {
        window.location.reload();
      } else {
        window.alert(`❌ פעולה נכשלה: ${result.error ?? "שגיאה לא ידועה"}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
      window.alert(`❌ שגיאה: ${message}`);
    } finally {
      setTenantBusy(tenant.id, null);
    }
  }

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
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t, idx) => {
              const tenantBusy = busy.get(t.id) ?? null;
              return (
                <tr
                  key={t.id}
                  style={{
                    borderBottom:
                      idx < tenants.length - 1
                        ? "1px solid var(--spike-border)"
                        : "none",
                    background: t.isActive
                      ? "transparent"
                      : "rgba(255,164,181,0.04)",
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

                  {/* Active/inactive (clickable badge) */}
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

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {/* Trigger Manager */}
                      <button
                        type="button"
                        disabled={tenantBusy !== null}
                        onClick={() => handleTriggerManager(t)}
                        title="הפעל סוכן מנהל (עוקף נעילת שבוע)"
                        className="rounded px-2 py-1 text-xs font-medium transition-opacity disabled:opacity-50 hover:opacity-80"
                        style={{
                          background: "rgba(139, 92, 246, 0.15)",
                          color: "#A78BFA",
                          border: "1px solid rgba(139, 92, 246, 0.3)",
                        }}
                      >
                        {tenantBusy === "manager" ? "..." : "⚡ מנהל"}
                      </button>

                      {/* Toggle active */}
                      <button
                        type="button"
                        disabled={tenantBusy !== null}
                        onClick={() => handleToggleActive(t)}
                        title={
                          t.isActive
                            ? "השהה את החשבון (יחסום סוכנים)"
                            : "הפעל את החשבון מחדש"
                        }
                        className="rounded px-2 py-1 text-xs font-medium transition-opacity disabled:opacity-50 hover:opacity-80"
                        style={{
                          background: t.isActive
                            ? "rgba(255, 164, 181, 0.12)"
                            : "rgba(34, 211, 176, 0.15)",
                          color: t.isActive
                            ? "rgba(255, 164, 181, 1)"
                            : "var(--spike-teal-light)",
                          border: t.isActive
                            ? "1px solid rgba(255, 164, 181, 0.3)"
                            : "1px solid rgba(34, 211, 176, 0.3)",
                        }}
                      >
                        {tenantBusy === "toggle"
                          ? "..."
                          : t.isActive
                          ? "השהה"
                          : "הפעל"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
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
