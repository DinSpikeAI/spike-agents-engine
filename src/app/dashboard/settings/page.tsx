// src/app/dashboard/settings/page.tsx
//
// Sub-stage 1.7 — Settings page (extended for Sprint 3I).
//
// Renders within the full dashboard chrome (Sidebar + MobileHeader + BottomNav).
// Loads current tenant data and passes it to the client SettingsForm.
//
// Sprint 3I additions:
//   - Loads tenants.config.business_brief from DB and threads it through
//     to <SettingsForm initialBusinessBrief={...} />.
//   - Fixes a pre-existing bug where the gender cast was narrowed to
//     `"male" | "female"` — leaving "plural" tenants silently downgraded
//     to "male" on every visit. Now resolves all three valid values.

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
import type {
  BusinessOwnerGender,
  Vertical,
} from "@/app/dashboard/settings/types";
import { VALID_VERTICALS } from "@/app/dashboard/settings/types";

export const dynamic = "force-dynamic";
export const runtime = "edge";

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

  // Sprint 3I — load business_brief from config (may be absent for most
  // tenants pre-3I). Empty string and null both render as "no brief set"
  // in the form; treat both the same way for display purposes.
  const currentBusinessBrief: string | null =
    typeof tenantConfig.business_brief === "string" &&
    tenantConfig.business_brief.length > 0
      ? tenantConfig.business_brief
      : null;

  // Resolve gender from DB. Previously the resolution narrowed to
  // "male" | "female" only — silently downgrading "plural" tenants to
  // "male" on every page load (and again on every save, since the form
  // would round-trip the wrong value). Sprint 3I fixes this; all three
  // valid values now flow through correctly.
  const dbGender = tenantRow?.business_owner_gender as string | undefined;
  const currentGender: BusinessOwnerGender =
    dbGender === "female" || dbGender === "plural" ? dbGender : "male";

  // Default vertical — "general" is the safe fallback used by all 8 agents
  // when no specific vertical guidance applies. Use VALID_VERTICALS as
  // the source of truth for the membership check instead of a hardcoded
  // duplicate literal union.
  const dbVertical = tenantRow?.vertical as string | undefined;
  const currentVertical: Vertical =
    dbVertical && (VALID_VERTICALS as readonly string[]).includes(dbVertical)
      ? (dbVertical as Vertical)
      : "general";

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
            initialGender={currentGender}
            initialVertical={currentVertical}
            initialBusinessBrief={currentBusinessBrief}
          />
        </main>

        <WhatsAppFab />
      </div>

      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}
