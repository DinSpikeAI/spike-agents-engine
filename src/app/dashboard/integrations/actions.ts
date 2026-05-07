"use server";

// src/app/dashboard/integrations/actions.ts
//
// Sub-stage 2.0 — Integrations management.
//
// MVP: manual WhatsApp integration row creation. The real Embedded Signup
// flow (Meta SDK, OAuth code exchange) is a later sub-task; this file keeps
// the shape stable so the UI doesn't need to change when that lands.
//
// Authorization: requireOnboarded() ensures the user is authenticated and
// resolves the active tenant. We do NOT do an explicit membership check
// because requireOnboarded already guarantees this.

import { revalidatePath } from "next/cache";
import { requireOnboarded } from "@/lib/auth/require-onboarded";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────
// Input shape & validation
// ─────────────────────────────────────────────────────────────

export interface ConnectWhatsappInput {
  phoneNumberId: string;
  displayPhoneNumber: string;
  whatsappBusinessAccountId: string;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof ConnectWhatsappInput, string>>;
}

function validateWhatsappInput(
  input: ConnectWhatsappInput
): Partial<Record<keyof ConnectWhatsappInput, string>> | null {
  const errors: Partial<Record<keyof ConnectWhatsappInput, string>> = {};

  // phone_number_id: required, Meta IDs are 15+ digit numeric strings.
  const phoneNumberId = (input.phoneNumberId ?? "").trim();
  if (phoneNumberId.length === 0) {
    errors.phoneNumberId = "phone_number_id חובה";
  } else if (!/^\d{6,30}$/.test(phoneNumberId)) {
    errors.phoneNumberId = "phone_number_id צריך להיות מספר בלבד (לפחות 6 ספרות)";
  }

  // display_phone_number: required, E.164 format (+ then digits).
  const displayPhoneNumber = (input.displayPhoneNumber ?? "").trim();
  if (displayPhoneNumber.length === 0) {
    errors.displayPhoneNumber = "מספר תצוגה חובה";
  } else if (!/^\+?[\d\s()-]{7,30}$/.test(displayPhoneNumber)) {
    errors.displayPhoneNumber = "מספר טלפון לא תקין (פורמט E.164: +972...)";
  }

  // whatsapp_business_account_id: required string.
  const wabaId = (input.whatsappBusinessAccountId ?? "").trim();
  if (wabaId.length === 0) {
    errors.whatsappBusinessAccountId = "WABA ID חובה";
  } else if (wabaId.length > 100) {
    errors.whatsappBusinessAccountId = "WABA ID ארוך מדי";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

// ─────────────────────────────────────────────────────────────
// connectWhatsappIntegration — manual INSERT (pre-Embedded-Signup)
// ─────────────────────────────────────────────────────────────

export async function connectWhatsappIntegration(
  input: ConnectWhatsappInput
): Promise<ActionResult> {
  const fieldErrors = validateWhatsappInput(input);
  if (fieldErrors) {
    return { ok: false, error: "אנא תקן את השדות המסומנים", fieldErrors };
  }

  const { tenantId } = await requireOnboarded();
  const adminDb = createAdminClient();

  // Defensive: check if this phone_number_id is already connected to ANY
  // tenant (including the current one). The DB has a partial UNIQUE index
  // that will reject the INSERT, but checking here gives a friendlier error.
  const phoneNumberId = input.phoneNumberId.trim();
  const { data: existing } = await adminDb
    .from("integrations")
    .select("tenant_id")
    .eq("provider", "whatsapp")
    .eq("status", "connected")
    .filter("metadata->>phone_number_id", "eq", phoneNumberId)
    .maybeSingle();

  if (existing) {
    if (existing.tenant_id === tenantId) {
      return {
        ok: false,
        error: "מספר זה כבר מחובר לחשבון שלך. נתק תחילה אם אתה רוצה לחבר מחדש.",
      };
    }
    return {
      ok: false,
      error:
        "מספר זה כבר מחובר לחשבון אחר. אם המספר שלך, פנה לתמיכה — Meta phone_number_id חייב להיות ייחודי במערכת.",
    };
  }

  const { error: insertError } = await adminDb.from("integrations").insert({
    tenant_id: tenantId,
    provider: "whatsapp",
    status: "connected",
    metadata: {
      phone_number_id: phoneNumberId,
      display_phone_number: input.displayPhoneNumber.trim(),
      whatsapp_business_account_id: input.whatsappBusinessAccountId.trim(),
      connected_via: "manual_form",
      connected_at: new Date().toISOString(),
    },
  });

  if (insertError) {
    console.error("[integrations] connectWhatsapp INSERT failed:", insertError);
    // 23505 = unique_violation (the partial index above)
    if (insertError.code === "23505") {
      return {
        ok: false,
        error: "מספר זה כבר רשום במערכת (race condition). נסה שוב.",
      };
    }
    return { ok: false, error: "שמירה נכשלה. נסה שוב." };
  }

  revalidatePath("/dashboard/integrations");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// disconnectIntegration — soft disconnect (status -> 'disconnected')
// ─────────────────────────────────────────────────────────────
//
// We do NOT DELETE the row. Reasons:
//   1. Audit trail — we may want to know who used to be connected and when.
//   2. Re-connection — same phone_number_id can be re-connected by setting
//      status back to 'connected' (the partial UNIQUE index frees up the
//      slot when status != 'connected').
//   3. Vault cleanup — the vault_token_id reference may need cleanup
//      asynchronously (cron) before full deletion.

export async function disconnectIntegration(
  integrationId: string
): Promise<ActionResult> {
  if (!integrationId || typeof integrationId !== "string") {
    return { ok: false, error: "מזהה אינטגרציה לא תקין" };
  }

  const { tenantId } = await requireOnboarded();
  const adminDb = createAdminClient();

  // Defensive: ensure the integration belongs to this tenant.
  const { data: existing, error: selectError } = await adminDb
    .from("integrations")
    .select("id, tenant_id, status")
    .eq("id", integrationId)
    .maybeSingle();

  if (selectError) {
    console.error("[integrations] disconnect SELECT failed:", selectError);
    return { ok: false, error: "שגיאה בטעינת האינטגרציה" };
  }

  if (!existing) {
    return { ok: false, error: "האינטגרציה לא נמצאה" };
  }

  if (existing.tenant_id !== tenantId) {
    // Don't leak that the integration exists. Return generic error.
    return { ok: false, error: "האינטגרציה לא נמצאה" };
  }

  if (existing.status !== "connected") {
    return { ok: false, error: "האינטגרציה כבר מנותקת" };
  }

  const { error: updateError } = await adminDb
    .from("integrations")
    .update({
      status: "disconnected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", integrationId)
    .eq("tenant_id", tenantId); // belt-and-suspenders

  if (updateError) {
    console.error("[integrations] disconnect UPDATE failed:", updateError);
    return { ok: false, error: "ניתוק נכשל. נסה שוב." };
  }

  revalidatePath("/dashboard/integrations");
  return { ok: true };
}
