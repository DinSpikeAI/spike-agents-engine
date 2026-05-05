// src/app/dashboard/reports/page.tsx
//
// Sub-stage 1.11 — Manager reports LIST view.
// Sub-stage 1.11 hotfix — render-time stripAiTellsDeep over JSONB.
// Sub-stage 1.13 — Print/PDF support: chrome elements get `print:hidden` so
//   if the user runs Ctrl+P from this page, only the latest expanded report
//   prints cleanly. The expanded ManagerReportCard at the top is the
//   printable content (already shown via `isLatest`). No explicit
//   PrintButton on this page — to print a specific historical report, the
//   user clicks into its detail page where the dedicated button lives.
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

// ─── Hebrew date helpers ──────────────────────────────────────────────

const HE_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${HE_MONTHS[start.getMonth()]}`;
  }
  if (sameYear) {
    return `${start.getDate()} ${HE_MONTHS[start.getMonth()]} – ${end.getDate()} ${HE_MONTHS[end.getMonth()]}`;
  }
  return `${start.getDate()} ${HE_MONTHS[start.getMonth()]} ${start.getFullYear()} – ${end.getDate()} ${HE_MONTHS[end.getMonth()]} ${end.getFullYear()}`;
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const ts = new Date(iso).getTime();
  const diffMs = now - ts;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "היום";
  if (diffDays === 1) return "אתמול";
  if (diffDays < 7) return `לפני ${diffDays} ימים`;
  if (diffDays < 14) return "לפני שבוע";
  if (diffDays < 30) return `לפני ${Math.floor(diffDays / 7)} שבועות`;
  if (diffDays < 60) return "לפני חודש";
  return `לפני ${Math.floor(diffDays / 30)} חודשים`;
}

// ─── Compact list item for older reports ─────────────────────────────

function ReportListItem({ report }: { report: ManagerReportRow }) {
  const isUnread = report.read_at === null;
  const isCritical = report.has_critical_issues;
  const dateRange = formatDateRange(report.window_start, report.window_end);
  const createdRelative = formatRelative(report.created_at);

  return (
    <Link
      href={`/dashboard/reports/${report.id}`}
      className="group block transition-opacity hover:opacity-90"
    >
      <Glass className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {isCritical ? (
                <AlertTriangle
                  size={14}
                  strokeWidth={1.75}
                  style={{ color: "var(--color-sys-pink)" }}
                  aria-label="דוח עם ממצאים קריטיים"
                />
              ) : (
                <CheckCircle2
                  size={14}
                  strokeWidth={1.75}
                  style={{ color: "var(--color-sys-green)" }}
                  aria-label="דוח ללא ממצאים קריטיים"
                />
              )}
              <span
                className="text-[14px] font-semibold tracking-tight"
                style={{ color: "var(--color-ink)" }}
              >
                {dateRange}
              </span>
              {isUnread && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    background: "rgba(10, 132, 255, 0.12)",
                    color: "var(--color-sys-blue)",
                  }}
                >
                  לא נקרא
                </span>
              )}
            </div>
            <div
              className="mt-1 text-[12px]"
              style={{ color: "var(--color-ink-3)" }}
            >
              נוצר {createdRelative} · {report.agents_succeeded} סוכנים רצו
              {report.drafts_flagged > 0 && (
                <> · {report.drafts_flagged} ממצאים</>
              )}
            </div>
          </div>
          <ChevronRight
            size={16}
            strokeWidth={1.5}
            className="flex-shrink-0 -rotate-180 transition-transform group-hover:-translate-x-0.5"
            style={{ color: "var(--color-ink-3)" }}
          />
        </div>
      </Glass>
    </Link>
  );
}

// ─── Main page ───────────────────────────────────────────────────────

export default async function ReportsListPage() {
  await requireOnboarded();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const userEmail = user.email ?? "";

  // Tenant identity for the sidebar profile.
  const adminDb = createAdminClient();
  const {
    data: { user: u2 },
  } = await supabase.auth.getUser();
  const userId = u2?.id;
  const { data: membership } = userId
    ? await adminDb
        .from("memberships")
        .select("tenant_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle()
    : { data: null };
  const tenantId = membership?.tenant_id ?? null;

  let ownerName: string | null = null;
  let businessName: string | null = null;
  if (tenantId) {
    const { data: tenantRow } = await adminDb
      .from("tenants")
      .select("name, config")
      .eq("id", tenantId)
      .maybeSingle();
    const tenantConfig =
      (tenantRow?.config as Record<string, unknown> | null) ?? {};
    ownerName =
      typeof tenantConfig.owner_name === "string"
        ? tenantConfig.owner_name
        : null;
    businessName =
      typeof tenantConfig.business_name === "string"
        ? tenantConfig.business_name
        : (tenantRow?.name as string | undefined) ?? null;
  }

  // 3 parallel queries.
  const [reportsResult, lockResult, draftsResult] = await Promise.all([
    listManagerReports(REPORTS_LIMIT),
    getManagerLockState(),
    listPendingDrafts(),
  ]);

  // Sub-stage 1.11 hotfix: sanitize JSONB payloads at render time.
  // Defense-in-depth on top of manager/run.ts which applies stripAiTellsDeep
  // at write time (06b686d). Catches pre-1.5.1 reports persisted before
  // the agent-side strip existed and protects against future regex-coverage
  // gaps. Per CLAUDE.md §1.9, em-dash, en-dash mid-sentence, and inline
  // #hashtags are forbidden in any agent output.
  const reports: ManagerReportRow[] = (
    reportsResult.success ? reportsResult.reports ?? [] : []
  ).map((r) => ({
    ...r,
    report: stripAiTellsDeep(r.report),
  }));

  const lockState = lockResult.success
    ? lockResult.state ?? DEFAULT_LOCK_STATE
    : DEFAULT_LOCK_STATE;

  const pendingCount = draftsResult.success
    ? draftsResult.drafts?.filter((d) => d.status === "pending").length ?? 0
    : 0;

  const isAdmin = isAdminEmail(userEmail);

  return (
    <div
      className="relative min-h-screen"
      dir="rtl"
      style={{ color: "var(--color-ink)" }}
    >
      {/* Chrome — hidden on print so a Ctrl+P from this page produces a
          clean printout of just the latest expanded report. */}
      <div className="print:hidden">
        <AppleBg />
        <Sidebar
          userEmail={userEmail}
          ownerName={ownerName}
          businessName={businessName}
          isAdmin={isAdmin}
          pendingCount={pendingCount}
        />
        <MobileHeader userEmail={userEmail} pendingCount={pendingCount} />
        <BottomNav pendingCount={pendingCount} />
        <WhatsAppFab />
      </div>

      <div className="md:mr-[232px] print:!mr-0">
        <main className="spike-scroll mx-auto max-w-[920px] px-4 pb-20 pt-6 md:px-8 md:pt-8 print:!px-0 print:!py-4 print:!max-w-none">
          {/* Page header */}
          <div className="mb-6 print:mb-3">
            <div className="mb-2 flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-[12px] text-[22px] print:hidden"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(245,247,252,0.7))",
                  border: "1px solid rgba(255,255,255,0.9)",
                  boxShadow:
                    "0 4px 12px rgba(15,20,30,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
                }}
              >
                📊
              </div>
              <h1
                className="text-[24px] font-semibold tracking-[-0.02em]"
                style={{ color: "var(--color-ink)" }}
              >
                דוחות
              </h1>
            </div>
            <p
              className="text-[13.5px] leading-[1.55] print:hidden"
              style={{ color: "var(--color-ink-2)" }}
            >
              סקירה שבועית שמסכמת את ביצועי הסוכנים, איכות הטיוטות, מצב
              המערכת והמלצה אחת על מה שכדאי לטפל בקרוב.
            </p>
          </div>

          {/* Empty state */}
          {reports.length === 0 ? (
            <Glass className="p-8 text-center print:hidden">
              <div
                className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full"
                style={{
                  background: "rgba(10, 132, 255, 0.08)",
                }}
              >
                <CheckCircle2
                  size={20}
                  strokeWidth={1.5}
                  style={{ color: "var(--color-sys-blue)" }}
                />
              </div>
              <div
                className="text-[15px] font-semibold"
                style={{ color: "var(--color-ink)" }}
              >
                עוד אין דוחות
              </div>
              <div
                className="mx-auto mt-1.5 max-w-[420px] text-[12.5px] leading-[1.6]"
                style={{ color: "var(--color-ink-2)" }}
              >
                הסוכן Manager רץ אוטומטית פעם בשבוע (ראשון בבוקר). אפשר גם
                להריץ אותו ידנית עכשיו כדי לקבל את הדוח הראשון.
              </div>
              <div className="mt-4 flex justify-center">
                <RunManagerButton lockState={lockState} />
              </div>
            </Glass>
          ) : (
            <>
              {/* Latest report — fully expanded via ManagerReportCard isLatest.
                  This is the printable content. Subsequent items are hidden
                  on print (compact list isn't useful in a printout). */}
              <div className="mb-6 print:mb-0">
                <ManagerReportCard report={reports[0]!} isLatest />
              </div>

              {/* Older reports — compact list. Hidden on print. */}
              {reports.length > 1 && (
                <div className="print:hidden">
                  <div className="mb-3 flex items-center justify-between">
                    <h2
                      className="text-[14px] font-semibold tracking-tight"
                      style={{ color: "var(--color-ink-2)" }}
                    >
                      דוחות קודמים
                      <span
                        className="ml-1.5 text-[12px] font-normal"
                        style={{ color: "var(--color-ink-3)" }}
                      >
                        ({reports.length - 1})
                      </span>
                    </h2>
                  </div>
                  <div className="space-y-2.5">
                    {reports.slice(1).map((report) => (
                      <ReportListItem key={report.id} report={report} />
                    ))}
                  </div>

                  {reports.length === REPORTS_LIMIT && (
                    <div
                      className="mt-3 text-center text-[11.5px]"
                      style={{ color: "var(--color-ink-3)" }}
                    >
                      מציג {REPORTS_LIMIT} דוחות אחרונים. דוחות ישנים יותר
                      קיימים אבל לא מוצגים כאן בגרסה זו.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
