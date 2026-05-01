"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export interface OnboardingFormData {
  ownerName: string;
  businessName: string;
  vertical: "beauty" | "restaurant" | "retail" | "services" | "general";
  gender: "male" | "female" | "neutral";
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

  if (ownerName.length === 0 || ownerName.length > 60) {
    return { success: false, error: "אנא הזן שם פרטי תקין (עד 60 תווים)" };
  }
  if (businessName.length === 0 || businessName.length > 120) {
    return { success: false, error: "אנא הזן שם עסק תקין (עד 120 תווים)" };
  }
  if (!["beauty", "restaurant", "retail", "services", "general"].includes(data.vertical)) {
    return { success: false, error: "תחום לא תקין" };
  }
  if (!["male", "female", "neutral"].includes(data.gender)) {
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

  const newConfig = {
    ...existingConfig,
    owner_name: ownerName,
    business_name: businessName,
    onboarding_completed_at: new Date().toISOString(),
  };

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
