// src/app/dashboard/integrations/page.tsx
//
// Sub-stage 2.0 — Integrations dashboard page.
//
// Lists all connected (and historically disconnected) provider integrations
// for the current tenant. Currently WhatsApp-only; the page is structured
// so adding Stripe / Google Calendar / etc. is just adding more provider
// sections without touching this file's plumbing.

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
import { IntegrationsForm } from "@/components/dashboard/integrations-form";
import { listPendingDrafts } from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

export interface IntegrationRow {
  id: string;
  provider: string;
  status: string;
  metadata: {
    phone_number_id?: string;
    display_phone_number?: string;
    whatsapp_business_account_id?: string;
    connected_via?: string;
    connected_at?: string;
    [k: string]: unknown;
  } | null;
  created_at: string;
  updated_at: string;
}

export default async function IntegrationsPage() {
  const { userEmail, tenantId } = await requireOnboarded();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const adminDb = createAdminClient();

  // Tenant info for sidebar greeting
  const { data: tenantRow } = await adminDb
    .from("tenants")
    .select("name, config")
    .eq("id", tenantId)
    .maybeSingle();

  const tenantConfig =
    (tenantRow?.config as Record<string, unknown> | null) ?? {};

  const sidebarOwnerName =
    (typeof tenantConfig.owner_name === "string" && tenantConfig.owner_name) ||
    userEmail.split("@")[0] ||
    "";
  const sidebarBusinessName =
    (typeof tenantConfig.business_name === "string" &&
      tenantConfig.business_name) ||
    (tenantRow?.name as string | undefined) ||
    "";

  // Pending count for the "דורש אישור" badge in sidebar/bottom nav.
  const draftsResult = await listPendingDrafts();
  const pendingCount = draftsResult.success
    ? draftsResult.drafts?.filter((d) => d.status === "pending").length ?? 0
    : 0;

  // Load this tenant's integrations (all statuses — UI shows connected
  // prominently, others as historical).
  const { data: integrationsData } = await adminDb
    .from("integrations")
    .select("id, provider, status, metadata, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  const integrations = (integrationsData ?? []) as IntegrationRow[];

  return (
    <div
      className="relative min-h-screen"
      dir="rtl"
      style={{ color: "var(--color-ink)" }}
    >
      <AppleBg />

      <Sidebar
        userEmail={userEmail}
        ownerName={sidebarOwnerName}
        businessName={sidebarBusinessName}
        isAdmin={isAdminEmail(userEmail)}
        pendingCount={pendingCount}
      />

      <MobileHeader
        userEmail={userEmail}
        ownerName={sidebarOwnerName}
        businessName={sidebarBusinessName}
        isAdmin={isAdminEmail(userEmail)}
        pendingCount={pendingCount}
      />

      <div className="md:mr-[232px]">
        <main className="spike-scroll mx-auto max-w-[760px] px-4 pb-[96px] pt-6 sm:px-6 md:px-10 md:pb-20 md:pt-10">
          <h1
            className="mb-2 text-[26px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[30px]"
            style={{ color: "var(--color-ink)" }}
          >
            אינטגרציות
          </h1>
          <p
            className="mb-8 text-[14px] leading-[1.55]"
            style={{ color: "var(--color-ink-3)" }}
          >
            חיבור שירותים חיצוניים שהסוכנים פועלים מולם. WhatsApp הוא הצעד
            הראשון — בעתיד יתווספו Stripe, Google Calendar ועוד. כל אינטגרציה
            פעילה מתעדת את הפעילות אצל ה-tenant שלך בלבד.
          </p>

          <IntegrationsForm initialIntegrations={integrations} />
        </main>

        <WhatsAppFab />
      </div>

      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}
