// src/app/dashboard/reports/page.tsx
//
// Sub-stage (in progress) — Manager reports LIST view (replaces the
// /dashboard/reports placeholder, one of the 3 remaining 404s tracked in
// CLAUDE.md §11.2).
//
// Layout (Dean's UX choice (א) from spec discussion):
//   - Page header: title + subtitle.
//   - If 0 reports → EmptyState with explainer + <RunManagerButton />
//     (lockState.canRun is always true in empty state — no reports means
//     no lock can be active). Keeps the entry surface friendly for new
//     tenants right after onboarding.
//   - If ≥1 report:
//       Latest report — fully expanded via <ManagerReportCard isLatest />.
//       Older reports — compact <ReportListItem> cards linking to the
//                       detail page at /dashboard/reports/[id].
//   - Pagination: hard-cap at 12 (= listManagerReports default + 2 buffer).
//     If reports.length === 12 we show a quiet hint that older reports
//     exist beyond the visible window. No "load more" button in v1 — the
//     volume (1 report/week) means 12 covers ~3 months which is plenty
//     pre-launch. Revisit if a real customer fills it.
//
// Data: 3 parallel queries — reports + lock state + pending drafts (for
// the sidebar badge). Mirrors the agents/page.tsx Promise.all pattern.

import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOnboarded } from "@/lib/auth/require-onboarded";
import { isAdminEmail } from "@/lib/admin/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileHeader } from "@/components/dashboard/mobile-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { WhatsAppFab } from "@/components/dashboard/whatsapp-fab";
import { AppleBg } from "@/components/ui/apple-bg";
import { Glass } from "@/components/ui/glass";
import { ManagerReportCard } from "@/components/dashboard/manager-report-card";
import { RunManagerButton } from "@/components/dashboard/run-manager-button";
import { stripAiTellsDeep } from "@/lib/safety/anti-ai-strip";
import {
  listManagerReports,
  getManagerLockState,
  listPendingDrafts,
} from "@/app/dashboard/actions";
import type {
  ManagerReportRow,
  ManagerLockState,
} from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

// Default lock state used when getManagerLockState() fails — assume free
// to run; the action will re-validate before doing anything destructive.
const DEFAULT_LOCK_STATE: ManagerLockState = {
  canRun: true,
  reason: null,
  nextEligibleAt: null,
  daysUntilNext: 0,
  hoursUntilNext: 0,
  unreadReportId: null,
  lastReadAt: null,
};

const REPORTS_LIMIT = 12;

export default async function ManagerReportsListPage() {
  const { userEmail, tenantId } = await requireOnboarded();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Tenant chrome (mirrors agents/page.tsx pattern).
  const adminDb = createAdminClient();
  const { data: tenantRow } = await adminDb
    .from("tenants")
    .select("name, config")
    .eq("id", tenantId)
    .maybeSingle();

  const tenantConfig =
    (tenantRow?.config as Record<string, unknown> | null) ?? {};
  const ownerName =
    typeof tenantConfig.owner_name === "string"
      ? tenantConfig.owner_name
      : null;
  const businessName =
    typeof tenantConfig.business_name === "string"
      ? tenantConfig.business_name
      : (tenantRow?.name as string | undefined) ?? null;

  // 3 parallel loads.
  const [reportsResult, lockResult, draftsResult] = await Promise.all([
    listManagerReports(REPORTS_LIMIT),
    getManagerLockState(),
    listPendingDrafts(),
  ]);

  // Sanitize JSONB payloads at render time. Defense-in-depth on top of
  // manager/run.ts which already applies stripAiTellsDeep at write time
  // (1.5.1 hotfix in commit 06b686d). This catches pre-1.5.1 reports that
  // were persisted before the agent-side strip existed, and protects against
  // future regex-coverage gaps. Per CLAUDE.md §1.9, em-dash (—), en-dash (–)
  // mid-sentence, and inline #hashtags are forbidden in any agent output.
  const reports: ManagerReportRow[] = (
    reportsResult.success ? reportsResult.reports ?? [] : []
  ).map((r) => ({
    ...r,
    report: stripAiTellsDeep(r.report),
  }));

  const lockState: ManagerLockState =
    lockResult.success && lockResult.state ? lockResult.state : DEFAULT_LOCK_STATE;

  const pendingCount = draftsResult.success
    ? draftsResult.drafts?.filter((d) => d.status === "pending").length ?? 0
    : 0;

  return (
    <div
      className="relative min-h-screen"
      dir="rtl"
      style={{ color: "var(--color-ink)" }}
    >
      <AppleBg />

      <Sidebar
        userEmail={userEmail}
        ownerName={ownerName}
        businessName={businessName}
        isAdmin={isAdminEmail(userEmail)}
        pendingCount={pendingCount}
      />
      <MobileHeader
        userEmail={userEmail}
        ownerName={ownerName}
        businessName={businessName}
        isAdmin={isAdminEmail(userEmail)}
        pendingCount={pendingCount}
      />

      <div className="md:mr-[232px]">
        <main className="spike-scroll mx-auto max-w-[920px] px-4 pb-[96px] pt-6 sm:px-6 md:px-10 md:pb-20 md:pt-10">
          {/* Page header */}
          <h1
            className="mb-2 text-[26px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[30px]"
            style={{ color: "var(--color-ink)" }}
          >
            דוחות מנהל
          </h1>
          <p
            className="mb-8 text-[14px] leading-[1.55]"
            style={{ color: "var(--color-ink-3)" }}
          >
            סקירה שבועית של ביצועי הסוכנים, איכות הטיוטות, מדדי צמיחה
            והמלצה לפעולה. מתעדכן כל יום ראשון או בהפעלה ידנית.
          </p>

          {reports.length === 0 ? (
            <EmptyState lockState={lockState} />
          ) : (
            <>
              {/* Latest report — fully expanded.
                  ManagerReportCard handles all 5 schema sections internally;
                  this page does NOT re-implement that rendering. */}
              <ManagerReportCard report={reports[0]} isLatest={true} />

              {reports.length > 1 && (
                <section className="mt-8">
                  <div className="mb-4 flex items-baseline gap-3">
                    <h2
                      className="text-[17px] font-semibold tracking-[-0.01em]"
                      style={{ color: "var(--color-ink)" }}
                    >
                      דוחות קודמים
                    </h2>
                    <span
                      className="text-[12.5px]"
                      style={{ color: "var(--color-ink-3)" }}
                    >
                      ({reports.length - 1})
                    </span>
                    <div className="section-divider flex-1" />
                  </div>

                  <div className="flex flex-col gap-3">
                    {reports.slice(1).map((r) => (
                      <ReportListItem key={r.id} report={r} />
                    ))}
                  </div>

                  {reports.length === REPORTS_LIMIT && (
                    <p
                      className="mt-5 text-center text-[12.5px]"
                      style={{ color: "var(--color-ink-3)" }}
                    >
                      מציג את {REPORTS_LIMIT} הדוחות האחרונים.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </main>

        <WhatsAppFab />
      </div>

      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Helper components — private to this file
// ═════════════════════════════════════════════════════════════

/**
 * Empty state shown when no reports exist for the tenant.
 *
 * Per Dean's UX answer (3-א): explanatory text + RunManagerButton (which
 * itself handles the lock state machine). When canRun is false the button
 * gracefully degrades to a different visual; no need to gate it here.
 */
function EmptyState({ lockState }: { lockState: ManagerLockState }) {
  return (
    <Glass className="p-8 text-center sm:p-10">
      <div className="mb-4 text-[40px] leading-none">📊</div>
      <h2
        className="mb-2 text-[18px] font-semibold tracking-[-0.01em]"
        style={{ color: "var(--color-ink)" }}
      >
        אין דוחות עדיין
      </h2>
      <p
        className="mx-auto mb-5 max-w-[480px] text-[14px] leading-[1.6]"
        style={{ color: "var(--color-ink-2)" }}
      >
        סוכן המנהל מסכם שבועית את ביצועי כל הסוכנים, דוגם טיוטות לבקרת
        איכות, ומציע פעולה אחת לשיפור. רוצה דוח ראשון?
      </p>
      <div className="flex justify-center">
        <RunManagerButton lockState={lockState} />
      </div>
    </Glass>
  );
}

/**
 * Compact card for an older report. The whole card is a link to the
 * detail page. Renders summary headline (truncated), date range, relative
 * "X days ago", critical badge if applicable, and read/unread pill.
 */
function ReportListItem({ report }: { report: ManagerReportRow }) {
  // Defensive read of summary — payload is typed Record<string, unknown>
  // by the action layer; runtime guarantees from manager/schema.ts.
  const payload = report.report as { summary?: string };
  const summary =
    typeof payload.summary === "string" && payload.summary.length > 0
      ? payload.summary
      : "דוח שבועי";

  const isUnread = report.read_at === null;
  const isCritical = report.has_critical_issues;

  return (
    <Link
      href={`/dashboard/reports/${report.id}`}
      className="block transition-opacity hover:opacity-90"
    >
      <Glass
        className="p-4 sm:p-5"
        style={
          isCritical
            ? { borderColor: "rgba(214, 51, 108, 0.30)" }
            : undefined
        }
      >
        <div className="flex items-start justify-between gap-3">
          {/* Left: dates + summary */}
          <div className="min-w-0 flex-1">
            <div
              className="mb-1 text-[11.5px]"
              style={{ color: "var(--color-ink-3)" }}
            >
              {formatDateRange(report.window_start, report.window_end)} ·{" "}
              {formatRelative(report.created_at)}
            </div>
            <p
              className="line-clamp-2 text-[14px] leading-[1.45]"
              style={{ color: "var(--color-ink)" }}
            >
              {summary}
            </p>
          </div>

          {/* Right: badges + chevron */}
          <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
            {isCritical && (
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold"
                style={{
                  background: "rgba(214, 51, 108, 0.10)",
                  border: "1px solid rgba(214, 51, 108, 0.30)",
                  color: "var(--color-sys-pink)",
                }}
              >
                <AlertTriangle size={10} strokeWidth={2.4} />
                דחוף
              </span>
            )}
            {isUnread ? (
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-medium"
                style={{
                  background: "var(--color-sys-blue-soft)",
                  color: "var(--color-sys-blue)",
                }}
              >
                לא נקרא
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px]"
                style={{ color: "var(--color-ink-3)" }}
              >
                <CheckCircle2 size={10} strokeWidth={2.4} />
                נקרא
              </span>
            )}
            <ChevronRight
              size={14}
              strokeWidth={1.75}
              style={{ color: "var(--color-ink-3)" }}
            />
          </div>
        </div>
      </Glass>
    </Link>
  );
}

// ═════════════════════════════════════════════════════════════
// Format helpers
// ═════════════════════════════════════════════════════════════

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startStr = start.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
  });
  const endStr = end.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${startStr} – ${endStr}`;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "היום";
  if (diffDays === 1) return "אתמול";
  if (diffDays < 7) return `לפני ${diffDays} ימים`;
  if (diffDays < 14) return "לפני שבוע";
  if (diffDays < 30) return `לפני ${Math.floor(diffDays / 7)} שבועות`;
  if (diffDays < 60) return "לפני חודש";
  return `לפני ${Math.floor(diffDays / 30)} חודשים`;
}
