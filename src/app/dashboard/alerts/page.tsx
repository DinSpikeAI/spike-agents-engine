// src/app/dashboard/alerts/page.tsx
//
// Sub-stage 1.10 — Alerts page (notifications inbox).
//
// Server Component: renders the dashboard chrome, initial-loads notifications
// for tab='all', and passes them to <AlertsList> which handles tab switching
// + mark-as-read interactions.
//
// Note: <AlertsList> re-fetches when the tab changes (via the same listNotifications
// server action). This keeps server-side filtering rather than fetching all 100
// rows up front and JS-filtering — better for tenants with high notification volume.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOnboarded } from "@/lib/auth/require-onboarded";
import { isAdminEmail } from "@/lib/admin/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileHeader } from "@/components/dashboard/mobile-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { WhatsAppFab } from "@/components/dashboard/whatsapp-fab";
import { AppleBg } from "@/components/ui/apple-bg";
import { AlertsList } from "@/components/dashboard/alerts-list";
import { listPendingDrafts } from "@/app/dashboard/actions";
import { listNotifications } from "./actions";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const { userEmail, tenantId } = await requireOnboarded();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Tenant identity for sidebar
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

  // Initial load: 'all' tab + drafts count for sidebar/bottom nav
  const [draftsResult, initialNotifications] = await Promise.all([
    listPendingDrafts(),
    listNotifications("all"),
  ]);

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
          <h1
            className="mb-2 text-[26px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[30px]"
            style={{ color: "var(--color-ink)" }}
          >
            התראות
          </h1>
          <p
            className="mb-6 text-[14px] leading-[1.55]"
            style={{ color: "var(--color-ink-3)" }}
          >
            עדכונים חיים על הפעילות בעסק. הסוכנים מדווחים כאן על לידים חדשים,
            טיוטות שהוכנו, וחריגות שדורשות תשומת לב.
          </p>

          <AlertsList
            initialNotifications={initialNotifications.notifications ?? []}
            initialUnreadCount={initialNotifications.unreadCount ?? 0}
          />
        </main>

        <WhatsAppFab />
      </div>

      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}
