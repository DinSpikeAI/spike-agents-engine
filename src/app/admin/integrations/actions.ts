"use server";

// src/app/admin/integrations/actions.ts
//
// Sub-stage 2.0 (revision 2026-05-07) — Admin integrations server actions.
//
// Admin variants of connectWhatsappIntegration / disconnectIntegration that
// take tenant_id as an explicit parameter (instead of resolving via
// requireOnboarded). Authorization gate is requireAdmin() — only emails in
// ADMIN_EMAILS env var can call these.
//
// The DB constraints are the same:
//   1. UNIQUE(tenant_id, provider) — at most one row per tenant per provider.
//   2. UNIQUE partial(provider, metadata->>'phone_number_id') WHERE
//      provider='whatsapp' AND status='connected' — phone_number_id globally
//      unique among connected rows.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────
// Input shape & validation
// ─────────────────────────────────────────────────────────────

export interface AdminConnectWhatsappInput {
  tenantId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  whatsappBusinessAccountId: string;
}

export interface AdminActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<
    Record<keyof AdminConnectWhatsappInput, string>
  >;
}

function validateInput(
  input: AdminConnectWhatsappInput
): Partial<Record<keyof AdminConnectWhatsappInput, string>> | null {
  const errors: Partial<Record<keyof AdminConnectWhatsappInput, string>> = {};

  const tenantId = (input.tenantId ?? "").trim();
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    errors.tenantId = "tenant_id חסר או בפורמט שגוי";
  }

  const phoneNumberId = (input.phoneNumberId ?? "").trim();
  if (phoneNumberId.length === 0) {
    errors.phoneNumberId = "phone_number_id חובה";
  } else if (!/^\d{6,30}$/.test(phoneNumberId)) {
    errors.phoneNumberId =
      "phone_number_id צריך להיות מספר בלבד (לפחות 6 ספרות)";
  }

  const displayPhoneNumber = (input.displayPhoneNumber ?? "").trim();
  if (displayPhoneNumber.length === 0) {
    errors.displayPhoneNumber = "מספר תצוגה חובה";
  } else if (!/^\+?[\d\s()-]{7,30}$/.test(displayPhoneNumber)) {
    errors.displayPhoneNumber = "מספר טלפון לא תקין (E.164: +972...)";
  }

  const wabaId = (input.whatsappBusinessAccountId ?? "").trim();
  if (wabaId.length === 0) {
    errors.whatsappBusinessAccountId = "WABA ID חובה";
  } else if (wabaId.length > 100) {
    errors.whatsappBusinessAccountId = "WABA ID ארוך מדי";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

// ─────────────────────────────────────────────────────────────
// connectWhatsappAsAdmin — INSERT or UPSERT for any tenant
// ─────────────────────────────────────────────────────────────

export async function connectWhatsappAsAdmin(
  input: AdminConnectWhatsappInput
): Promise<AdminActionResult> {
  await requireAdmin();

  const fieldErrors = validateInput(input);
  if (fieldErrors) {
    return { ok: false, error: "אנא תקן את השדות המסומנים", fieldErrors };
  }

  const adminDb = createAdminClient();
  const tenantId = input.tenantId.trim();
  const phoneNumberId = input.phoneNumberId.trim();

  // Tenant exists?
  const { data: tenantRow } = await adminDb
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenantRow) {
    return { ok: false, error: "ה-tenant הזה לא קיים במערכת" };
  }

  // Existing whatsapp row for THIS tenant?
  const { data: existingForTenant, error: tenantSelectError } = await adminDb
    .from("integrations")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("provider", "whatsapp")
    .maybeSingle();
  if (tenantSelectError) {
    console.error("[admin] tenant lookup failed:", tenantSelectError);
    return { ok: false, error: "שגיאה בטעינת המצב הנוכחי" };
  }

  if (existingForTenant && existingForTenant.status === "connected") {
    return {
      ok: false,
      error:
        "ה-tenant הזה כבר עם WhatsApp מחובר. נתק קודם אם רוצים להחליף מספר.",
    };
  }

  // phone_number_id taken by ANOTHER tenant?
  const { data: phoneClaimedBy } = await adminDb
    .from("integrations")
    .select("tenant_id")
    .eq("provider", "whatsapp")
    .eq("status", "connected")
    .filter("metadata->>phone_number_id", "eq", phoneNumberId)
    .maybeSingle();
  if (phoneClaimedBy && phoneClaimedBy.tenant_id !== tenantId) {
    return {
      ok: false,
      error: `phone_number_id ${phoneNumberId} כבר תפוס ע"י tenant אחר.`,
    };
  }

  const newMetadata = {
    phone_number_id: phoneNumberId,
    display_phone_number: input.displayPhoneNumber.trim(),
    whatsapp_business_account_id: input.whatsappBusinessAccountId.trim(),
    connected_via: "admin_form",
    connected_at: new Date().toISOString(),
  };

  if (existingForTenant) {
    // Reconnect — UPDATE existing row
    const { error: updateError } = await adminDb
      .from("integrations")
      .update({
        status: "connected",
        metadata: newMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingForTenant.id);

    if (updateError) {
      console.error("[admin] reconnect UPDATE failed:", updateError);
      if (updateError.code === "23505") {
        return { ok: false, error: "race condition. נסה שוב." };
      }
      return { ok: false, error: "חיבור מחדש נכשל." };
    }
  } else {
    // Fresh INSERT
    const { error: insertError } = await adminDb.from("integrations").insert({
      tenant_id: tenantId,
      provider: "whatsapp",
      status: "connected",
      metadata: newMetadata,
    });

    if (insertError) {
      console.error("[admin] connect INSERT failed:", insertError);
      if (insertError.code === "23505") {
        return { ok: false, error: "race condition (constraint). נסה שוב." };
      }
      return { ok: false, error: "שמירה נכשלה." };
    }
  }

  revalidatePath("/admin/integrations");
  revalidatePath("/dashboard/integrations");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// disconnectIntegrationAsAdmin — soft disconnect by integration id
// ─────────────────────────────────────────────────────────────

export async function disconnectIntegrationAsAdmin(
  integrationId: string
): Promise<AdminActionResult> {
  await requireAdmin();

  if (!integrationId || typeof integrationId !== "string") {
    return { ok: false, error: "מזהה אינטגרציה לא תקין" };
  }

  const adminDb = createAdminClient();

  const { data: existing, error: selectError } = await adminDb
    .from("integrations")
    .select("id, status")
    .eq("id", integrationId)
    .maybeSingle();

  if (selectError) {
    console.error("[admin] disconnect SELECT failed:", selectError);
    return { ok: false, error: "שגיאה בטעינת האינטגרציה" };
  }
  if (!existing) {
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
    .eq("id", integrationId);

  if (updateError) {
    console.error("[admin] disconnect UPDATE failed:", updateError);
    return { ok: false, error: "ניתוק נכשל" };
  }

  revalidatePath("/admin/integrations");
  revalidatePath("/dashboard/integrations");
  return { ok: true };
}
