// src/app/dashboard/reports/[id]/page.tsx
//
// Sub-stage (in progress) — Manager report DETAIL view.
//
// Renders ONE report by id, scoped to the active tenant.
//
// IMPORTANT: report-rendering logic lives in <ManagerReportCard> (already
// used on /dashboard/manager). This page is a thin wrapper around the card
// that adds:
//   - Chrome (Sidebar/MobileHeader/BottomNav/WhatsAppFab/AppleBg).
//   - Breadcrumb back to /dashboard/reports.
//   - <ReportMarkReadButton> + read-state hint, ABOVE the card so the
//     mark-as-read CTA is the first interactive element the owner sees.
//
// The 7-day Manager lock starts the moment markManagerReportRead() succeeds.
// Per the Iron Rule "AI מסמן, בעלים מחליט" the click MUST be explicit —
// never auto on view, scroll, or hover.
//
// Not-found: getManagerReport returns notFound=true → next/navigation
// notFound() renders the closest 404 boundary.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ChevronRight } from "lucide-react";
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
import { ReportMarkReadButton } from "@/components/dashboard/report-mark-read-button";
import { stripAiTellsDeep } from "@/lib/safety/anti-ai-strip";
import { listPendingDrafts } from "@/app/dashboard/actions";
import { getManagerReport } from "../actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ManagerReportDetailPage({ params }: PageProps) {
  const { id: reportId } = await params;
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

  // Fetch report + drafts in parallel.
  const [reportResult, draftsResult] = await Promise.all([
    getManagerReport(reportId),
    listPendingDrafts(),
  ]);

  const pendingCount = draftsResult.success
    ? draftsResult.drafts?.filter((d) => d.status === "pending").length ?? 0
    : 0;

  // Not-found vs error: notFound triggers the 404 boundary; other failures
  // render an in-page error shell so the user retains chrome navigation.
  if (!reportResult.success || !reportResult.report) {
    if (reportResult.notFound) notFound();
    return (
      <ErrorShell
        userEmail={userEmail}
        ownerName={ownerName}
        businessName={businessName}
        pendingCount={pendingCount}
        message={reportResult.error ?? "שגיאה בטעינת הדוח"}
      />
    );
  }

  // Sanitize JSONB payload at render time. Defense-in-depth on top of
  // manager/run.ts which already applies stripAiTellsDeep at write time
  // (1.5.1 hotfix in commit 06b686d). This catches pre-1.5.1 reports that
  // were persisted before the agent-side strip existed, and protects against
  // future regex-coverage gaps. Per CLAUDE.md §1.9, em-dash (—), en-dash (–)
  // mid-sentence, and inline #hashtags are forbidden in any agent output.
  const report = {
    ...reportResult.report,
    report: stripAiTellsDeep(reportResult.report.report),
  };
  const isUnread = report.read_at === null;

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
          {/* Breadcrumb */}
          <Link
            href="/dashboard/reports"
            className="mb-5 inline-flex items-center gap-1.5 text-[13px] transition-opacity hover:opacity-70"
            style={{ color: "var(--color-ink-3)" }}
          >
            <ChevronRight size={14} strokeWidth={2} />
            <span>חזרה לכל הדוחות</span>
          </Link>

          {/* Mark-as-read CTA + read-state hint, placed ABOVE the report card
              so the action is visible without scrolling on long reports. */}
          <div className="mb-5 flex flex-col gap-2.5">
            <ReportMarkReadButton
              reportId={report.id}
              initialReadAt={report.read_at}
            />
            {isUnread ? (
              <p
                className="text-[12.5px] leading-[1.5]"
                style={{ color: "var(--color-ink-3)" }}
              >
                לחיצה על "סמן כנקרא" פותחת לוק של 7 ימים עד הדוח הבא של
                סוכן המנהל.
              </p>
            ) : (
              report.next_eligible_run_at && (
                <p
                  className="text-[12.5px] leading-[1.5]"
                  style={{ color: "var(--color-ink-3)" }}
                >
                  הדוח הבא יהיה זמין מ-
                  {formatHebrewDateTime(report.next_eligible_run_at)}.
                </p>
              )
            )}
          </div>

          {/* Full report card — single source of truth for report rendering.
              isLatest=true gives the Glass-deep treatment regardless of
              chronological position, since "viewing this one" makes it
              focal. */}
          <ManagerReportCard report={report} isLatest={true} />
        </main>

        <WhatsAppFab />
      </div>

      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Error shell — same chrome but with a friendly error message.
// Used when getManagerReport fails for non-notFound reasons (auth, DB).
// ─────────────────────────────────────────────────────────────

function ErrorShell({
  userEmail,
  ownerName,
  businessName,
  pendingCount,
  message,
}: {
  userEmail: string;
  ownerName: string | null;
  businessName: string | null;
  pendingCount: number;
  message: string;
}) {
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
          <Link
            href="/dashboard/reports"
            className="mb-5 inline-flex items-center gap-1.5 text-[13px]"
            style={{ color: "var(--color-ink-3)" }}
          >
            <ChevronRight size={14} strokeWidth={2} />
            <span>חזרה לכל הדוחות</span>
          </Link>
          <Glass className="p-6">
            <div className="flex items-start gap-3">
              <AlertCircle
                size={20}
                strokeWidth={2.2}
                style={{
                  color: "var(--color-sys-pink)",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              />
              <div>
                <h2
                  className="mb-1 text-[16px] font-semibold"
                  style={{ color: "var(--color-ink)" }}
                >
                  לא ניתן לטעון את הדוח
                </h2>
                <p
                  className="text-[14px]"
                  style={{ color: "var(--color-ink-2)" }}
                >
                  {message}
                </p>
              </div>
            </div>
          </Glass>
        </main>
        <WhatsAppFab />
      </div>
      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}

function formatHebrewDateTime(iso: string): string {
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
  });
  const timeStr = d.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateStr}, ${timeStr}`;
}
