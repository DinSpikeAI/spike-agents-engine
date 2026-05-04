// src/app/dashboard/showcase/page.tsx
//
// Sub-stage 1.6 — Showcase page (was /dashboard/demo, renamed in 1.6).
// Accessible to ALL onboarded users (admin gate removed in 1.6).
//
// Purpose: when a new tenant logs in for the first time and hasn't run any
// agent yet, the onboarding banner on /dashboard invites them here to see
// what Spike actually does, without committing to a real run.
//
// Renders within the full dashboard chrome (Sidebar + MobileHeader + BottomNav).

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
import { listPendingDrafts } from "@/app/dashboard/actions";
import { DemoPanel } from "@/components/demo/demo-panel";

export const dynamic = "force-dynamic";

export default async function ShowcasePage() {
  const { userEmail, tenantId } = await requireOnboarded();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  const draftsResult = await listPendingDrafts();
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
        <main className="spike-scroll mx-auto max-w-[1100px] px-4 pb-[96px] pt-6 sm:px-6 md:px-10 md:pb-20 md:pt-10">
          <h1
            className="mb-2 text-[26px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[30px]"
            style={{ color: "var(--color-ink)" }}
          >
            תראה את הקסם בזמן אמת
          </h1>
          <p
            className="mb-8 text-[14px] leading-[1.55]"
            style={{ color: "var(--color-ink-3)" }}
          >
            דוגמה חיה של איך Spike מקבל הודעת WhatsApp, מסווג אותה, ומכין טיוטת תגובה
            תוך 15 שניות. הכל לפני שאתה מתחבר ללקוחות אמיתיים.
          </p>

          <DemoPanel tenantId={tenantId} />
        </main>

        <WhatsAppFab />
      </div>

      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}
