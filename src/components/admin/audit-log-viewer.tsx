// src/components/admin/audit-log-viewer.tsx
//
// Day 11B — Audit log feed for the Admin Command Center.
//
// Shows the most recent agent runs across ALL tenants. Lets the founder
// scan for issues at a glance (failed runs, expensive runs, suspicious
// activity, etc.).

import type { AdminRunRow } from "@/lib/admin/queries";

interface Props {
  runs: AdminRunRow[];
}

export function AuditLogViewer({ runs }: Props) {
  if (runs.length === 0) {
    return (
      <div
        className="rounded-xl px-6 py-8 text-center"
        style={{
          background: "var(--spike-surface)",
          border: "1px solid var(--spike-border)",
          color: "var(--spike-text-dim)",
        }}
      >
        אין ריצות סוכנים להצגה.
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
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-medium">סוכן</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-medium">סטטוס</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-medium">עלות</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-medium">משך</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-medium">מתי</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, idx) => (
              <tr
                key={r.runId}
                style={{
                  borderBottom:
                    idx < runs.length - 1
                      ? "1px solid var(--spike-border)"
                      : "none",
                }}
              >
                {/* Tenant */}
                <td className="px-4 py-3">
                  <div
                    className="text-sm font-medium"
                    style={{ color: "var(--spike-text)" }}
                  >
                    {r.tenantName}
                  </div>
                </td>

                {/* Agent ID */}
                <td className="px-4 py-3">
                  <code
                    className="rounded px-2 py-0.5 text-xs"
                    style={{
                      background: "rgba(148, 163, 184, 0.08)",
                      color: "var(--spike-cyan)",
                      direction: "ltr",
                    }}
                  >
                    {r.agentId}
                  </code>
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} errorMessage={r.errorMessage} />
                </td>

                {/* Cost */}
                <td
                  className="px-4 py-3 text-sm whitespace-nowrap"
                  style={{ color: "var(--spike-text)" }}
                >
                  {r.costActualIls === null
                    ? "—"
                    : `₪${r.costActualIls.toFixed(4)}`}
                </td>

                {/* Duration */}
                <td
                  className="px-4 py-3 text-sm whitespace-nowrap"
                  style={{ color: "var(--spike-text-dim)" }}
                >
                  {formatDuration(r.startedAt, r.finishedAt)}
                </td>

                {/* When */}
                <td
                  className="px-4 py-3 text-sm whitespace-nowrap"
                  style={{ color: "var(--spike-text-dim)" }}
                >
                  {formatRelativeTime(r.startedAt)}
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
// Internal: status badge
// ─────────────────────────────────────────────────────────────

function StatusBadge({
  status,
  errorMessage,
}: {
  status: string;
  errorMessage: string | null;
}) {
  const config: Record<
    string,
    { label: string; bg: string; color: string }
  > = {
    succeeded: {
      label: "הצלחה",
      bg: "rgba(34, 211, 176, 0.15)",
      color: "var(--spike-teal-light)",
    },
    no_op: {
      label: "ללא פעולה",
      bg: "rgba(91, 208, 242, 0.15)",
      color: "var(--spike-cyan)",
    },
    running: {
      label: "רץ",
      bg: "rgba(148, 163, 184, 0.15)",
      color: "var(--spike-text-dim)",
    },
    failed: {
      label: "נכשל",
      bg: "rgba(255, 164, 181, 0.18)",
      color: "rgba(255, 164, 181, 1)",
    },
  };

  const c = config[status] ?? {
    label: status,
    bg: "rgba(148, 163, 184, 0.12)",
    color: "var(--spike-text-mute)",
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
        style={{ background: c.bg, color: c.color }}
      >
        {c.label}
      </span>
      {errorMessage && status === "failed" && (
        <span
          className="text-xs truncate max-w-[180px]"
          style={{ color: "var(--spike-text-mute)" }}
          title={errorMessage}
        >
          {errorMessage}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Time helpers
// ─────────────────────────────────────────────────────────────

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "...";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "עכשיו";
  if (diffMin < 60) return `לפני ${diffMin} דק׳`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `לפני ${diffHr} שע׳`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `לפני ${diffDays} ימים`;
  return new Date(iso).toLocaleDateString("he-IL");
}
