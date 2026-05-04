// src/app/dashboard/settings/page.tsx
//
// Sub-stage 1.7 — Settings page.
//
// Renders within the full dashboard chrome (Sidebar + MobileHeader + BottomNav).
// Loads current tenant data and passes it to the client SettingsForm.

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
import { SettingsForm } from "@/components/dashboard/settings-form";
import { listPendingDrafts } from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { userEmail, tenantId } = await requireOnboarded();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load current tenant settings via admin client (RLS-bypassing).
  const adminDb = createAdminClient();
  const { data: tenantRow } = await adminDb
    .from("tenants")
    .select("name, vertical, business_owner_gender, config")
    .eq("id", tenantId)
    .maybeSingle();

  const tenantConfig =
    (tenantRow?.config as Record<string, unknown> | null) ?? {};

  // Use config.owner_name (set during onboarding); fallback to email username.
  const currentOwnerName =
    (typeof tenantConfig.owner_name === "string" && tenantConfig.owner_name) ||
    userEmail.split("@")[0] ||
    "";

  const currentBusinessName =
    (typeof tenantConfig.business_name === "string" &&
      tenantConfig.business_name) ||
    (tenantRow?.name as string | undefined) ||
    "";

  // Default gender if not set yet — pick "male" as the safer default for
  // Hebrew gender lock (matches grammatical default in most agent prompts).
  // The user can change it here. Display name in sidebar.
  const currentGender =
    (tenantRow?.business_owner_gender as string | undefined) === "female"
      ? "female"
      : "male";

  // Default vertical — "general" is the safe fallback used by all 8 agents
  // when no specific vertical guidance applies.
  const currentVertical =
    (tenantRow?.vertical as string | undefined) || "general";

  // Sidebar/MobileHeader want the same display name + business name we use
  // everywhere else.
  const sidebarOwnerName = currentOwnerName;
  const sidebarBusinessName = currentBusinessName;

  // Pending count for the "דורש אישור" badge in sidebar/bottom nav.
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
            הגדרות
          </h1>
          <p
            className="mb-8 text-[14px] leading-[1.55]"
            style={{ color: "var(--color-ink-3)" }}
          >
            שינוי הפרטים האלה משפיע על כל הסוכנים. שם בעל העסק והמגדר משמשים את
            הסוכן בעת ניסוח הודעות. הענף משמש את הסוכן להתאמת הטון לתחום שלך.
          </p>

          <SettingsForm
            initialOwnerName={currentOwnerName}
            initialBusinessName={currentBusinessName}
            initialGender={currentGender as "male" | "female"}
            initialVertical={
              currentVertical as
                | "general"
                | "clinic"
                | "financial"
                | "restaurant"
                | "retail"
                | "services"
                | "beauty"
                | "education"
            }
          />
        </main>

        <WhatsAppFab />
      </div>

      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}
