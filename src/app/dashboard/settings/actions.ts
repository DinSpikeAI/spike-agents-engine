"use server";

// src/app/dashboard/settings/actions.ts
//
// Sub-stage 1.7 — Settings page server action.
//
// §15.29 mitigation (attempt 6 — RESOLVED 2026-05-13, commit c4b6942):
// this file contains ONLY the async server action `updateTenantSettings`
// plus a non-exported `validate` helper. ALL types and runtime constants
// live in ./types.ts (a neutral file with no "use server" or
// "server-only" directive).
//
// DO NOT re-introduce type definitions, interface declarations, or
// `export type` re-exports into this file. That pattern triggered the
// `ReferenceError: BusinessOwnerGender is not defined at module
// evaluation` crash across 5 previous fix attempts (commits 408b4ed →
// cadde7c → 331ebb7 → 59feb7b → 7539dcd). See §15.29.
//
// Updates tenant fields editable from the Settings page:
//   - tenants.name                          (business name display)
//   - tenants.business_owner_gender         (Hebrew gender lock)
//   - tenants.vertical                      (agent prompt context)
//   - tenants.config.owner_name             (greeting + sidebar)
//   - tenants.config.business_name          (legacy mirror)
//   - tenants.config.business_brief         (Sprint 3I — owner voice)
//
// Returns a structured result so the client form can show inline errors
// AND toast notifications (decision (ג) from spec discussion).
//
// Authorization: requireOnboarded() ensures the user is logged in AND
// the tenant resolves to a tenant they have membership in.

import { revalidatePath } from "next/cache";
import { requireOnboarded } from "@/lib/auth/require-onboarded";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  TenantSettingsInput,
  UpdateTenantSettingsResult,
} from "./types";
import {
  VALID_GENDERS,
  VALID_VERTICALS,
  BUSINESS_BRIEF_MAX_LENGTH,
} from "./types";

// Non-exported helper — allowed inside "use server" files per §15.26
// (the rule prohibits non-async EXPORTS, not internal definitions).
function validate(
  input: TenantSettingsInput,
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

  // gender: must be male, female, or plural.
  // §15.12 pattern — no `as readonly string[]` cast; VALID_GENDERS is
  // typed `as const satisfies readonly BusinessOwnerGender[]` in types.ts
  // so .includes() type-checks correctly against the constrained union.
  if (!VALID_GENDERS.includes(input.businessOwnerGender)) {
    errors.businessOwnerGender = "בחר זכר, נקבה או רבים";
  }

  // vertical: must be one of the 8 known verticals
  if (!VALID_VERTICALS.includes(input.vertical)) {
    errors.vertical = "ענף לא תקין";
  }

  // business_brief: optional. If provided, must not exceed cap.
  // Empty / whitespace-only is treated as "not set" (action persists null).
  if (input.businessBrief !== null && input.businessBrief !== undefined) {
    if (input.businessBrief.length > BUSINESS_BRIEF_MAX_LENGTH) {
      errors.businessBrief = `תיאור ארוך מדי (עד ${BUSINESS_BRIEF_MAX_LENGTH} תווים)`;
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

export async function updateTenantSettings(
  input: TenantSettingsInput,
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

  // Read current config so we can preserve all the other keys
  // (onboarding_completed_at, brand_voice_samples, owner_phone from 3M,
  // etc.). We only update owner_name + business_name + business_brief
  // inside config.
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

  // Normalize business_brief: empty/whitespace → null. Keeps the
  // JSONB compact and lets the agent injection logic check a simple
  // truthy/falsy.
  const briefTrimmed = (input.businessBrief ?? "").trim();
  const briefForStorage: string | null =
    briefTrimmed.length > 0 ? briefTrimmed : null;

  const currentConfig =
    (current?.config as Record<string, unknown> | null) ?? {};
  const updatedConfig = {
    ...currentConfig,
    owner_name: input.ownerName.trim(),
    // Keep business_name in config too — some legacy code paths read from
    // there instead of tenants.name. Cheap to keep both in sync.
    business_name: input.businessName.trim(),
    business_brief: briefForStorage,
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
