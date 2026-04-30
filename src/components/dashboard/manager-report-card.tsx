"use client";

import type { ManagerReportRow } from "@/app/dashboard/actions";
import type {
  ManagerAgentOutput,
  AgentStatusEntry,
  QualityFinding,
  SystemHealthSignal,
  ManagerRecommendation,
} from "@/lib/agents/types";

const AGENT_LABELS: Record<string, string> = {
  morning: "סוכן הבוקר",
  watcher: "סוכן מעקב",
  reviews: "סוכן ביקורות",
  hot_leads: "סוכן לידים חמים",
  manager: "סוכן מנהל",
  social: "סוכן חברתי",
  sales: "סוכן מכירות",
  cleanup: "סוכן ניקיון",
  inventory: "סוכן מלאי",
};

const STATUS_LABELS: Record<string, string> = {
  succeeded: "הצליח",
  failed: "נכשל",
  skipped: "דולג",
  never_ran: "לא רץ",
};

const SEVERITY_STYLES: Record<
  "minor" | "moderate" | "critical",
  { bg: string; border: string; text: string; label: string }
> = {
  minor:    { bg: "rgba(59, 130, 246, 0.10)", border: "rgba(59, 130, 246, 0.40)", text: "#93C5FD", label: "קל" },
  moderate: { bg: "rgba(252, 211, 77, 0.10)", border: "rgba(252, 211, 77, 0.40)", text: "#FDE68A", label: "בינוני" },
  critical: { bg: "rgba(239, 68, 68, 0.10)",  border: "rgba(239, 68, 68, 0.40)",  text: "#FCA5A5", label: "קריטי" },
};

const REC_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  prompt_tweak:     { label: "שיפור prompt", icon: "✏️" },
  scheduling:       { label: "שינוי תזמון", icon: "⏰" },
  configuration:    { label: "שינוי הגדרה", icon: "⚙️" },
  no_action_needed: { label: "אין צורך בפעולה", icon: "✓" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPercent(n: number | null): string {
  if (n === null) return "—";
  return `${Math.round(n * 100)}%`;
}

export function ManagerReportCard({
  report,
  isLatest,
}: {
  report: ManagerReportRow;
  isLatest: boolean;
}) {
  const r = report.report as unknown as ManagerAgentOutput;

  return (
    <div
      className={`rounded-xl p-6 ${
        isLatest ? "border-2" : "border"
      } ${
        report.has_critical_issues
          ? "border-red-500/40 bg-red-500/5"
          : "border-slate-700 bg-slate-900/60"
      }`}
    >
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
            <span>חלון ניתוח: {formatDate(report.window_start)} → {formatDate(report.window_end)}</span>
          </div>
          <h2 className="text-xl font-bold text-slate-100">{r.summary}</h2>
        </div>
        {report.has_critical_issues && (
          <div className="rounded-md bg-red-500/15 border border-red-500/40 px-3 py-1 text-xs font-bold text-red-300">
            ⚠️ דחוף
          </div>
        )}
      </div>

      <div className="space-y-5">
        {/* 1. Status Summary */}
        <Section title="סטטוס סוכנים" icon="🤖">
          <div className="mb-2 text-xs text-slate-400">
            {r.status_summary.totalSucceeded} ריצות הצליחו · {r.status_summary.totalFailed} נכשלו
          </div>
          {r.status_summary.agents.length === 0 ? (
            <p className="text-sm text-slate-500">לא היו ריצות סוכנים בחלון</p>
          ) : (
            <div className="space-y-1">
              {r.status_summary.agents.map((a: AgentStatusEntry) => {
                // successCount is not a field in the schema — derive it.
                const successCount = a.runCount - a.failureCount;
                return (
                  <div
                    key={a.agentId}
                    className="flex items-center justify-between rounded bg-slate-950/40 px-3 py-1.5 text-sm"
                  >
                    <span className="text-slate-200">
                      {AGENT_LABELS[a.agentId] ?? a.agentId}
                    </span>
                    <span className="text-xs text-slate-400">
                      {successCount}/{a.runCount} {STATUS_LABELS[a.status] ?? a.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* 2. Quality Findings */}
        <Section title="בקרת איכות" icon="🔍">
          <div className="mb-2 text-xs text-slate-400">
            נדגמו {r.quality_findings.draftsSampled} טיוטות · {r.quality_findings.findings.length} סומנו
          </div>
          <p className="mb-3 text-sm text-slate-300">
            {r.quality_findings.overallQualityHe}
          </p>
          {r.quality_findings.findings.length > 0 && (
            <div className="space-y-2">
              {r.quality_findings.findings.map((f: QualityFinding) => {
                const style = SEVERITY_STYLES[f.severity];
                return (
                  <div
                    key={f.draftId}
                    className="rounded-lg p-3"
                    style={{ background: style.bg, border: `1px solid ${style.border}` }}
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <span style={{ color: style.text }} className="font-semibold">
                        {style.label}
                      </span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-400">{f.issueType}</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-500">{f.draftId.slice(0, 8)}</span>
                    </div>
                    <p className="text-sm text-slate-200">{f.reasonHe}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* 3. System Health */}
        <Section title="בריאות מערכת" icon="❤️">
          <div className="mb-2 flex items-center gap-3 text-xs text-slate-400">
            <span>עלות בחלון: ₪{r.system_health.costWindowIls.toFixed(3)}</span>
            {r.system_health.costAnomalyDetected && (
              <span className="rounded bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-amber-300">
                חריגת עלות
              </span>
            )}
          </div>
          <p className="mb-3 text-sm text-slate-300">{r.system_health.overallHealthHe}</p>
          {r.system_health.signals.length > 0 && (
            <div className="space-y-2">
              {r.system_health.signals.map((s: SystemHealthSignal, idx: number) => {
                const style = SEVERITY_STYLES[s.severity];
                return (
                  <div
                    key={idx}
                    className="rounded-lg p-3"
                    style={{ background: style.bg, border: `1px solid ${style.border}` }}
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <span style={{ color: style.text }} className="font-semibold">
                        {style.label}
                      </span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-400">{s.anomalyType}</span>
                      {s.agentId && (
                        <>
                          <span className="text-slate-500">·</span>
                          <span className="text-slate-400">
                            {AGENT_LABELS[s.agentId] ?? s.agentId}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-slate-200">{s.descriptionHe}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* 4. Growth Metrics */}
        <Section title="מדדי צמיחה" icon="📈">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <Metric
              label="שיעור אישור"
              value={formatPercent(r.growth_metrics.approvalRate)}
            />
            <Metric
              label="זמן עד אישור"
              value={
                r.growth_metrics.medianTimeToApprovalMinutes !== null
                  ? `${r.growth_metrics.medianTimeToApprovalMinutes} דק׳`
                  : "—"
              }
            />
            <Metric
              label="טיוטות תקועות"
              value={`${r.growth_metrics.stalePendingDraftsCount}`}
              warning={r.growth_metrics.stalePendingDraftsCount > 0}
            />
            <Metric
              label="לידים בוערים זנוחים"
              value={`${r.growth_metrics.staleBlazingLeadsCount}`}
              critical={r.growth_metrics.staleBlazingLeadsCount > 0}
            />
          </div>
          <p className="text-sm text-slate-300">
            {r.growth_metrics.interpretationHe}
          </p>
        </Section>

        {/* 5. Recommendation */}
        <RecommendationBlock rec={r.recommendation} />
      </div>

      <div className="mt-4 border-t border-slate-700 pt-3 text-xs text-slate-500">
        דוח נוצר: {formatDate(report.created_at)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/30 p-4">
      <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-100">
        <span>{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  warning,
  critical,
}: {
  label: string;
  value: string;
  warning?: boolean;
  critical?: boolean;
}) {
  const colorClass = critical
    ? "text-red-300"
    : warning
    ? "text-amber-300"
    : "text-slate-100";
  return (
    <div className="rounded bg-slate-900/60 px-3 py-2">
      <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
      <div className={`text-lg font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}

function RecommendationBlock({ rec }: { rec: ManagerRecommendation }) {
  const meta = REC_TYPE_LABELS[rec.type] ?? { label: rec.type, icon: "💡" };
  const isNoAction = rec.type === "no_action_needed";
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: isNoAction
          ? "rgba(34, 197, 94, 0.06)"
          : "rgba(139, 92, 246, 0.08)",
        border: isNoAction
          ? "1px solid rgba(34, 197, 94, 0.30)"
          : "1px solid rgba(139, 92, 246, 0.30)",
      }}
    >
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="text-base">{meta.icon}</span>
        <span className={isNoAction ? "text-emerald-300" : "text-violet-300"}>
          {meta.label}
        </span>
        {rec.targetAgent && (
          <>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">
              {AGENT_LABELS[rec.targetAgent] ?? rec.targetAgent}
            </span>
          </>
        )}
      </div>
      <h4 className="mb-1 text-base font-bold text-slate-100">{rec.titleHe}</h4>
      <p className="mb-2 text-sm text-slate-300">{rec.detailHe}</p>
      {!isNoAction && (
        <div className="rounded bg-slate-950/40 px-3 py-2 text-xs">
          <span className="font-medium text-slate-400">פעולה מוצעת: </span>
          <span className="text-slate-200">{rec.suggestedActionHe}</span>
        </div>
      )}
    </div>
  );
}
