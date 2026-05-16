"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

// Sprint 3I onboarding integration (2026-05-15):
// `business_brief` is stored at `tenants.config->>'business_brief'`
// (top-level JSONB key, max 2000 chars). 5 customer-facing agents
// (Reviews, Sales×2, Social, Growth) inject it into their system prompts
// via withGenderLock / direct cache_control — see §10.40 for the per-
// agent integration details. By collecting brief during onboarding
// instead of waiting for the owner to discover the /dashboard/settings
// page, NEW tenants get Day-1 brief injection — drafts already match
// the owner's voice on first generation, not after a settings detour.
// Field is OPTIONAL in onboarding so the 4-required-field flow stays
// fast; owners who skip it can fill it via /dashboard/settings later.

const MAX_BUSINESS_BRIEF_LENGTH = 2000;

export interface OnboardingFormData {
  ownerName: string;
  businessName: string;
  vertical:
    | "beauty"
    | "restaurant"
    | "retail"
    | "services"
    | "general"
    | "clinic"
    | "financial"
    | "education";
  gender: "male" | "female" | "plural";
  /** Optional Sprint 3I brief. If non-empty, persisted to tenants.config.business_brief. */
  businessBrief?: string;
}

export interface OnboardingActionResult {
  success: boolean;
  error?: string;
}

// Resolve which tenant the current user is acting on.
// Mirrors the pattern used in dashboard/actions.ts (getActiveTenant).
async function getCurrentTenantId(): Promise<
  { tenantId: string } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "לא מחובר" };

  // Prefer active_tenant_id from user_settings (already used by JWT hook).
  const { data: settings } = await supabase
    .from("user_settings")
    .select("active_tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settings?.active_tenant_id) {
    return { tenantId: settings.active_tenant_id as string };
  }

  // Fallback: first tenant the user is a member of.
  const { data: membership } = await supabase
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membership?.tenant_id) {
    return { tenantId: membership.tenant_id as string };
  }

  return { error: "לא נמצא tenant פעיל למשתמש" };
}

export async function saveOnboardingAction(
  data: OnboardingFormData
): Promise<OnboardingActionResult> {
  // ─── Server-side validation (don't trust client) ──────────────────
  const ownerName = data.ownerName?.trim() ?? "";
  const businessName = data.businessName?.trim() ?? "";
  const businessBrief = data.businessBrief?.trim() ?? "";

  if (ownerName.length === 0 || ownerName.length > 60) {
    return { success: false, error: "אנא הזן שם פרטי תקין (עד 60 תווים)" };
  }
  if (businessName.length === 0 || businessName.length > 120) {
    return { success: false, error: "אנא הזן שם עסק תקין (עד 120 תווים)" };
  }
  if (businessBrief.length > MAX_BUSINESS_BRIEF_LENGTH) {
    return {
      success: false,
      error: `תיאור העסק ארוך מדי (מקסימום ${MAX_BUSINESS_BRIEF_LENGTH} תווים)`,
    };
  }
  if (
    ![
      "beauty",
      "restaurant",
      "retail",
      "services",
      "general",
      "clinic",
      "financial",
      "education",
    ].includes(data.vertical)
  ) {
    return { success: false, error: "תחום לא תקין" };
  }
  if (!["male", "female", "plural"].includes(data.gender)) {
    return { success: false, error: "לשון פנייה לא תקינה" };
  }

  const tenant = await getCurrentTenantId();
  if ("error" in tenant) {
    return { success: false, error: tenant.error };
  }

  const db = createAdminClient();

  // Read existing config so we don't clobber other keys.
  const { data: current, error: readErr } = await db
    .from("tenants")
    .select("config")
    .eq("id", tenant.tenantId)
    .single();

  if (readErr || !current) {
    console.error("[saveOnboardingAction] read tenant error:", readErr);
    return { success: false, error: "שגיאה בטעינת פרטי העסק" };
  }

  const existingConfig =
    (current.config as Record<string, unknown> | null) ?? {};

  const newConfig: Record<string, unknown> = {
    ...existingConfig,
    owner_name: ownerName,
    business_name: businessName,
    onboarding_completed_at: new Date().toISOString(),
  };

  // Sprint 3I integration: only write business_brief if the user
  // actually filled it. Empty/whitespace input preserves any prior
  // value already in existingConfig (rare edge case where a user
  // navigated to /dashboard/settings before completing onboarding)
  // rather than clobbering it with empty string.
  if (businessBrief.length > 0) {
    newConfig.business_brief = businessBrief;
  }

  const { error: updateErr } = await db
    .from("tenants")
    .update({
      name: businessName,
      vertical: data.vertical,
      business_owner_gender: data.gender,
      config: newConfig,
    })
    .eq("id", tenant.tenantId);

  if (updateErr) {
    console.error("[saveOnboardingAction] update error:", updateErr);
    return { success: false, error: "שגיאה בשמירת הפרטים" };
  }

  return { success: true };
}

// Convenience: a server action that does redirect on success.
// The client component calls this after a successful save so the
// browser navigates server-side (no flicker, RSC-aware).
export async function completeOnboardingAndRedirect(
  data: OnboardingFormData
): Promise<OnboardingActionResult> {
  const res = await saveOnboardingAction(data);
  if (res.success) {
    redirect("/dashboard");
  }
  return res;
}
