"use server";

// src/app/dashboard/settings/actions.ts
//
// Sub-stage 1.7 — Settings page server action.
//
// Updates tenant fields editable from the Settings page:
//   - tenants.name                          (business name display)
//   - tenants.business_owner_gender         (Hebrew gender lock)
//   - tenants.vertical                      (agent prompt context)
//   - tenants.config.owner_name             (greeting + sidebar)
//
// Returns a structured result so the client form can show inline errors
// AND toast notifications (decision (ג) from spec discussion).
//
// Authorization: requireOnboarded() ensures the user is logged in AND
// the tenant resolves to a tenant they have membership in (via active
// tenant or first membership). We do NOT do an explicit membership check
// here because requireOnboarded already guarantees this.

import { revalidatePath } from "next/cache";
import { requireOnboarded } from "@/lib/auth/require-onboarded";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────

const VALID_VERTICALS = [
  "general",
  "clinic",
  "financial",
  "restaurant",
  "retail",
  "services",
  "beauty",
  "education",
] as const;

const VALID_GENDERS = ["male", "female"] as const;

export type Vertical = (typeof VALID_VERTICALS)[number];
export type BusinessOwnerGender = (typeof VALID_GENDERS)[number];

export interface TenantSettingsInput {
  ownerName: string;
  businessName: string;
  businessOwnerGender: BusinessOwnerGender;
  vertical: Vertical;
}

export interface UpdateTenantSettingsResult {
  ok: boolean;
  error?: string;
  /** Per-field validation errors for inline display in the form. */
  fieldErrors?: Partial<Record<keyof TenantSettingsInput, string>>;
}

function validate(
  input: TenantSettingsInput
): Partial<Record<keyof TenantSettingsInput, string>> | null {
  const errors: Partial<Record<keyof TenantSettingsInput, string>> = {};

  // owner_name: required, 1-80 chars
  const ownerName = (input.ownerName ?? "").trim();
  if (ownerName.length === 0) {
    errors.ownerName = "שם בעל העסק חובה";
  } else if (ownerName.length > 80) {
    errors.ownerName = "שם ארוך מדי (עד 80 תווים)";
  }

  // business_name: required, 1-120 chars
  const businessName = (input.businessName ?? "").trim();
  if (businessName.length === 0) {
    errors.businessName = "שם העסק חובה";
  } else if (businessName.length > 120) {
    errors.businessName = "שם ארוך מדי (עד 120 תווים)";
  }

  // gender: must be male or female
  if (!VALID_GENDERS.includes(input.businessOwnerGender)) {
    errors.businessOwnerGender = "בחר זכר או נקבה";
  }

  // vertical: must be one of the 8 known verticals
  if (!VALID_VERTICALS.includes(input.vertical)) {
    errors.vertical = "ענף לא תקין";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

// ─────────────────────────────────────────────────────────────
// Action
// ─────────────────────────────────────────────────────────────

export async function updateTenantSettings(
  input: TenantSettingsInput
): Promise<UpdateTenantSettingsResult> {
  // Auth + tenant resolution. Will redirect on auth failure.
  const { tenantId } = await requireOnboarded();

  // Validate input.
  const fieldErrors = validate(input);
  if (fieldErrors) {
    return {
      ok: false,
      error: "יש שגיאות בטופס. תקן ונסה שוב.",
      fieldErrors,
    };
  }

  const db = createAdminClient();

  // Read current config so we can preserve all the other keys.
  // We're only updating owner_name within config; everything else
  // (onboarding_completed_at, business_name, brand_voice_samples, etc.)
  // must stay intact.
  const { data: current, error: readErr } = await db
    .from("tenants")
    .select("config")
    .eq("id", tenantId)
    .maybeSingle();

  if (readErr) {
    console.error("[settings] read tenants failed:", readErr);
    return {
      ok: false,
      error: "שגיאה בטעינת ההגדרות הנוכחיות",
    };
  }

  const currentConfig = (current?.config as Record<string, unknown> | null) ?? {};
  const updatedConfig = {
    ...currentConfig,
    owner_name: input.ownerName.trim(),
    // Keep business_name in config too — some legacy code paths read from
    // there instead of tenants.name. Cheap to keep both in sync.
    business_name: input.businessName.trim(),
  };

  // Update tenant row.
  const { error: updateErr } = await db
    .from("tenants")
    .update({
      name: input.businessName.trim(),
      business_owner_gender: input.businessOwnerGender,
      vertical: input.vertical,
      config: updatedConfig,
    })
    .eq("id", tenantId);

  if (updateErr) {
    console.error("[settings] update tenants failed:", updateErr);
    return {
      ok: false,
      error: "שמירת ההגדרות נכשלה. נסה שוב בעוד רגע.",
    };
  }

  // Revalidate dashboard so greeting + sidebar reflect new name immediately.
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");

  return { ok: true };
}
