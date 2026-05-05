// src/app/dashboard/reports/[id]/page.tsx
//
// Sub-stage 1.11 — Manager report DETAIL view.
// Sub-stage 1.11 hotfix — render-time stripAiTellsDeep over JSONB.
// Sub-stage 1.13 — Print/PDF support: PrintButton in the action bar (next to
//   ReportMarkReadButton); chrome and action bar both `print:hidden` so the
//   printout shows only the page title (small) + the ManagerReportCard.
//
// What renders:
//   - Same chrome as the list page (sidebar etc).
//   - Breadcrumb back link to /dashboard/reports.
//   - ReportMarkReadButton + PrintButton at the top — placed ABOVE the card
//     so the action is visible without scrolling on long reports.
//   - <ManagerReportCard isLatest> for the actual content (same component
//     used on the list page for the latest report).
//
// Error handling:
//   - notFound (wrong tenant or non-existent ID) → next/navigation notFound()
//   - Other errors → in-page ErrorShell that retains chrome navigation.

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
import { PrintButton } from "@/components/ui/print-button";
import { stripAiTellsDeep } from "@/lib/safety/anti-ai-strip";
import { listPendingDrafts } from "@/app/dashboard/actions";
import { getManagerReport } from "../actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// ─── Error shell — chrome retained, in-page error ───────────────────

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
      <MobileHeader userEmail={userEmail} pendingCount={pendingCount} />
      <BottomNav pendingCount={pendingCount} />

      <div className="md:mr-[232px]">
        <main className="spike-scroll mx-auto max-w-[920px] px-4 pb-20 pt-6 md:px-8 md:pt-8">
          <Link
            href="/dashboard/reports"
            className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium hover:opacity-80"
            style={{ color: "var(--color-ink-2)" }}
          >
            <ChevronRight size={14} strokeWidth={1.75} />
            חזרה לרשימת הדוחות
          </Link>
          <Glass className="p-8 text-center">
            <AlertCircle
              size={20}
              strokeWidth={1.5}
              className="mx-auto mb-2"
              style={{ color: "var(--color-sys-pink)" }}
            />
            <div
              className="text-[15px] font-semibold"
              style={{ color: "var(--color-ink)" }}
            >
              לא ניתן לטעון את הדוח
            </div>
            <div
              className="mx-auto mt-1.5 max-w-[400px] text-[12.5px] leading-[1.55]"
              style={{ color: "var(--color-ink-2)" }}
            >
              {message}
            </div>
          </Glass>
        </main>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────

export default async function ReportDetailPage({ params }: PageProps) {
  const { id } = await params;

  await requireOnboarded();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const userEmail = user.email ?? "";

  // Tenant identity for the sidebar profile.
  const adminDb = createAdminClient();
  const userId = user.id;
  const { data: membership } = await adminDb
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
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

  const [reportResult, draftsResult] = await Promise.all([
    getManagerReport(id),
    listPendingDrafts(),
  ]);

  const pendingCount = draftsResult.success
    ? draftsResult.drafts?.filter((d) => d.status === "pending").length ?? 0
    : 0;

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

  // Sub-stage 1.11 hotfix: sanitize JSONB payload at render time. Defense-
  // in-depth on top of manager/run.ts which already applies stripAiTellsDeep
  // at write time (06b686d). Catches pre-1.5.1 reports persisted before the
  // agent-side strip existed.
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
      {/* Chrome — hidden on print. */}
      <div className="print:hidden">
        <AppleBg />
        <Sidebar
          userEmail={userEmail}
          ownerName={ownerName}
          businessName={businessName}
          isAdmin={isAdminEmail(userEmail)}
          pendingCount={pendingCount}
        />
        <MobileHeader userEmail={userEmail} pendingCount={pendingCount} />
        <BottomNav pendingCount={pendingCount} />
        <WhatsAppFab />
      </div>

      <div className="md:mr-[232px] print:!mr-0">
        <main className="spike-scroll mx-auto max-w-[920px] px-4 pb-20 pt-6 md:px-8 md:pt-8 print:!px-0 print:!py-4 print:!max-w-none">
          {/* Breadcrumb — hidden on print */}
          <Link
            href="/dashboard/reports"
            className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium transition-opacity hover:opacity-80 print:hidden"
            style={{ color: "var(--color-ink-2)" }}
          >
            <ChevronRight size={14} strokeWidth={1.75} />
            חזרה לרשימת הדוחות
          </Link>

          {/* Action bar — mark-as-read + Print/PDF. Hidden on print. */}
          <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
            <ReportMarkReadButton
              reportId={report.id}
              initialReadAt={report.read_at}
            />
            <PrintButton />
            {isUnread && (
              <span
                className="text-[11.5px]"
                style={{ color: "var(--color-ink-3)" }}
              >
                סימון כנקרא יפתח את האפשרות להריץ דוח חדש (גם ללא המתנה
                לראשון).
              </span>
            )}
          </div>

          {/* The actual report — printable content. */}
          <ManagerReportCard report={report} isLatest />
        </main>
      </div>
    </div>
  );
}
