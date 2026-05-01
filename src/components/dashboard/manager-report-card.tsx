"use client";

import type { ManagerReportRow } from "@/app/dashboard/actions";
import type {
  ManagerAgentOutput,
  AgentStatusEntry,
  QualityFinding,
  SystemHealthSignal,
  ManagerRecommendation,
} from "@/lib/agents/types";
import { Glass } from "@/components/ui/glass";
import {
  Bot,
  Search,
  Heart,
  TrendingUp,
  AlertTriangle,
  Pencil,
  Clock,
  Settings as SettingsIcon,
  Check,
  Lightbulb,
} from "lucide-react";

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
  minor: {
    bg: "var(--color-sys-blue-soft)",
    border: "rgba(10, 132, 255, 0.25)",
    text: "var(--color-sys-blue)",
    label: "קל",
  },
  moderate: {
    bg: "rgba(224, 169, 61, 0.12)",
    border: "rgba(224, 169, 61, 0.30)",
    text: "var(--color-sys-amber)",
    label: "בינוני",
  },
  critical: {
    bg: "rgba(214, 51, 108, 0.10)",
    border: "rgba(214, 51, 108, 0.30)",
    text: "var(--color-sys-pink)",
    label: "קריטי",
  },
};

const REC_TYPE_META: Record<
  string,
  { label: string; Icon: typeof Pencil }
> = {
  prompt_tweak: { label: "שיפור prompt", Icon: Pencil },
  scheduling: { label: "שינוי תזמון", Icon: Clock },
  configuration: { label: "שינוי הגדרה", Icon: SettingsIcon },
  no_action_needed: { label: "אין צורך בפעולה", Icon: Check },
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
  const isCritical = report.has_critical_issues;

  return (
    <Glass
      deep={isLatest}
      className="p-6"
      style={
        isCritical
          ? {
              borderColor: "rgba(214, 51, 108, 0.35)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 28px rgba(214,51,108,0.10), 0 1px 3px rgba(15,20,30,0.05)",
            }
          : undefined
      }
    >
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div
            className="mb-1.5 text-[11px]"
            style={{ color: "var(--color-ink-3)" }}
          >
            חלון ניתוח: {formatDate(report.window_start)} →{" "}
            {formatDate(report.window_end)}
          </div>
          <h2
            className="text-[19px] font-semibold tracking-[-0.01em]"
            style={{ color: "var(--color-ink)" }}
          >
            {r.summary}
          </h2>
        </div>
        {isCritical && (
          <div
            className="flex flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: "rgba(214, 51, 108, 0.10)",
              border: "1px solid rgba(214, 51, 108, 0.30)",
              color: "var(--color-sys-pink)",
            }}
          >
            <AlertTriangle size={11} strokeWidth={2} />
            דחוף
          </div>
        )}
      </div>

      <div className="space-y-5">
        {/* 1. Status Summary */}
        <Section title="סטטוס סוכנים" Icon={Bot}>
          <div
            className="mb-2 text-[11.5px]"
            style={{ color: "var(--color-ink-3)" }}
          >
            {r.status_summary.totalSucceeded} ריצות הצליחו ·{" "}
            {r.status_summary.totalFailed} נכשלו
          </div>
          {r.status_summary.agents.length === 0 ? (
            <p
              className="text-[12.5px]"
              style={{ color: "var(--color-ink-3)" }}
            >
              לא היו ריצות סוכנים בחלון
            </p>
          ) : (
            <div className="space-y-1">
              {r.status_summary.agents.map((a: AgentStatusEntry) => {
                const successCount = a.runCount - a.failureCount;
                return (
                  <div
                    key={a.agentId}
                    className="flex items-center justify-between rounded-md px-3 py-1.5 text-[12.5px]"
                    style={{ background: "rgba(255,255,255,0.5)" }}
                  >
                    <span style={{ color: "var(--color-ink)" }}>
                      {AGENT_LABELS[a.agentId] ?? a.agentId}
                    </span>
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--color-ink-3)" }}
                    >
                      {successCount}/{a.runCount}{" "}
                      {STATUS_LABELS[a.status] ?? a.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* 2. Quality Findings */}
        <Section title="בקרת איכות" Icon={Search}>
          <div
            className="mb-2 text-[11.5px]"
            style={{ color: "var(--color-ink-3)" }}
          >
            נדגמו {r.quality_findings.draftsSampled} טיוטות ·{" "}
            {r.quality_findings.findings.length} סומנו
          </div>
          <p
            className="mb-3 text-[12.5px] leading-relaxed"
            style={{ color: "var(--color-ink-2)" }}
          >
            {r.quality_findings.overallQualityHe}
          </p>
          {r.quality_findings.findings.length > 0 && (
            <div className="space-y-2">
              {r.quality_findings.findings.map((f: QualityFinding) => {
                const style = SEVERITY_STYLES[f.severity];
                return (
                  <div
                    key={f.draftId}
                    className="rounded-md p-3"
                    style={{
                      background: style.bg,
                      border: `1px solid ${style.border}`,
                    }}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                      <span
                        className="font-semibold"
                        style={{ color: style.text }}
                      >
                        {style.label}
                      </span>
                      <span style={{ color: "var(--color-ink-3)" }}>·</span>
                      <span style={{ color: "var(--color-ink-2)" }}>
                        {f.issueType}
                      </span>
                      <span style={{ color: "var(--color-ink-3)" }}>·</span>
                      <span style={{ color: "var(--color-ink-3)" }}>
                        {f.draftId.slice(0, 8)}
                      </span>
                    </div>
                    <p
                      className="text-[12.5px]"
                      style={{ color: "var(--color-ink)" }}
                    >
                      {f.reasonHe}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* 3. System Health */}
        <Section title="בריאות מערכת" Icon={Heart}>
          <div
            className="mb-2 flex flex-wrap items-center gap-3 text-[11.5px]"
            style={{ color: "var(--color-ink-3)" }}
          >
            <span>עלות בחלון: ₪{r.system_health.costWindowIls.toFixed(3)}</span>
            {r.system_health.costAnomalyDetected && (
              <span
                className="rounded-md px-2 py-0.5 text-[10.5px] font-semibold"
                style={{
                  background: "rgba(224, 169, 61, 0.12)",
                  border: "1px solid rgba(224, 169, 61, 0.30)",
                  color: "var(--color-sys-amber)",
                }}
              >
                חריגת עלות
              </span>
            )}
          </div>
          <p
            className="mb-3 text-[12.5px] leading-relaxed"
            style={{ color: "var(--color-ink-2)" }}
          >
            {r.system_health.overallHealthHe}
          </p>
          {r.system_health.signals.length > 0 && (
            <div className="space-y-2">
              {r.system_health.signals.map(
                (s: SystemHealthSignal, idx: number) => {
                  const style = SEVERITY_STYLES[s.severity];
                  return (
                    <div
                      key={idx}
                      className="rounded-md p-3"
                      style={{
                        background: style.bg,
                        border: `1px solid ${style.border}`,
                      }}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                          className="font-semibold"
                          style={{ color: style.text }}
                        >
                          {style.label}
                        </span>
                        <span style={{ color: "var(--color-ink-3)" }}>·</span>
                        <span style={{ color: "var(--color-ink-2)" }}>
                          {s.anomalyType}
                        </span>
                        {s.agentId && (
                          <>
                            <span style={{ color: "var(--color-ink-3)" }}>
                              ·
                            </span>
                            <span style={{ color: "var(--color-ink-2)" }}>
                              {AGENT_LABELS[s.agentId] ?? s.agentId}
                            </span>
                          </>
                        )}
                      </div>
                      <p
                        className="text-[12.5px]"
                        style={{ color: "var(--color-ink)" }}
                      >
                        {s.descriptionHe}
                      </p>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </Section>

        {/* 4. Growth Metrics */}
        <Section title="מדדי צמיחה" Icon={TrendingUp}>
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
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
          <p
            className="text-[12.5px] leading-relaxed"
            style={{ color: "var(--color-ink-2)" }}
          >
            {r.growth_metrics.interpretationHe}
          </p>
        </Section>

        {/* 5. Recommendation */}
        <RecommendationBlock rec={r.recommendation} />
      </div>

      <div
        className="mt-4 border-t pt-3 text-[11px]"
        style={{
          borderColor: "var(--color-hairline)",
          color: "var(--color-ink-3)",
        }}
      >
        דוח נוצר: {formatDate(report.created_at)}
      </div>
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function Section({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: typeof Bot;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[14px] p-4"
      style={{
        background: "rgba(255,255,255,0.5)",
        border: "1px solid var(--color-hairline)",
      }}
    >
      <h3
        className="mb-2.5 flex items-center gap-2 text-[14px] font-semibold tracking-tight"
        style={{ color: "var(--color-ink)" }}
      >
        <Icon
          size={14}
          strokeWidth={1.75}
          style={{ color: "var(--color-ink-2)" }}
        />
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
  const valueColor = critical
    ? "var(--color-sys-pink)"
    : warning
    ? "var(--color-sys-amber)"
    : "var(--color-ink)";
  return (
    <div
      className="rounded-md px-3 py-2"
      style={{ background: "rgba(255,255,255,0.7)" }}
    >
      <div
        className="mb-0.5 text-[10px]"
        style={{ color: "var(--color-ink-3)" }}
      >
        {label}
      </div>
      <div
        className="text-[18px] font-semibold tracking-[-0.02em]"
        style={{ color: valueColor }}
      >
        {value}
      </div>
    </div>
  );
}

function RecommendationBlock({ rec }: { rec: ManagerRecommendation }) {
  const meta = REC_TYPE_META[rec.type] ?? { label: rec.type, Icon: Lightbulb };
  const isNoAction = rec.type === "no_action_needed";
  const RecIcon = meta.Icon;

  return (
    <div
      className="rounded-[14px] p-4"
      style={{
        background: isNoAction
          ? "var(--color-sys-green-soft)"
          : "var(--color-sys-blue-soft)",
        border: isNoAction
          ? "1px solid rgba(48, 179, 107, 0.25)"
          : "1px solid rgba(10, 132, 255, 0.25)",
      }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11.5px]">
        <RecIcon
          size={13}
          strokeWidth={1.75}
          style={{
            color: isNoAction
              ? "var(--color-sys-green)"
              : "var(--color-sys-blue)",
          }}
        />
        <span
          className="font-semibold"
          style={{
            color: isNoAction
              ? "var(--color-sys-green)"
              : "var(--color-sys-blue)",
          }}
        >
          {meta.label}
        </span>
        {rec.targetAgent && (
          <>
            <span style={{ color: "var(--color-ink-3)" }}>·</span>
            <span style={{ color: "var(--color-ink-2)" }}>
              {AGENT_LABELS[rec.targetAgent] ?? rec.targetAgent}
            </span>
          </>
        )}
      </div>
      <h4
        className="mb-1 text-[15px] font-semibold tracking-tight"
        style={{ color: "var(--color-ink)" }}
      >
        {rec.titleHe}
      </h4>
      <p
        className="mb-2 text-[12.5px] leading-relaxed"
        style={{ color: "var(--color-ink-2)" }}
      >
        {rec.detailHe}
      </p>
      {!isNoAction && (
        <div
          className="rounded-md px-3 py-2 text-[11.5px]"
          style={{ background: "rgba(255,255,255,0.6)" }}
        >
          <span
            className="font-medium"
            style={{ color: "var(--color-ink-3)" }}
          >
            פעולה מוצעת:{" "}
          </span>
          <span style={{ color: "var(--color-ink)" }}>
            {rec.suggestedActionHe}
          </span>
        </div>
      )}
    </div>
  );
}
