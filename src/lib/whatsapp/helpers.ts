// src/lib/whatsapp/helpers.ts
//
// Sprint 3M (and 3B incidentally — see §19.7 in CLAUDE.md). Shared
// helpers used by every server-side WhatsApp send path:
//   - actions/drafts.ts          → approveDraft (Sprint 2D + 3A)
//   - actions/growth.ts          → approveGrowthCandidate (Sprint 2C)
//   - api/cron/morning/route.ts  → daily auto-send to owner (Sprint 3M)
//
// Pre-3M these helpers were duplicated in drafts.ts and growth.ts
// ("Architecture decision: helpers duplicated, not extracted" from §10.37).
// Sprint 3M needed a third caller and that flipped the cost-benefit:
// extracting now is cheaper than carrying a third copy.
//
// Forward-compat note for Vault encryption (deferred per §11.2 + §19.8):
// when the access_token migrates from `integrations.metadata` plaintext
// to vault.secrets, only the body of `lookupWhatsAppIntegration` changes
// — its signature stays the same. All three callers benefit transparently.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SendWhatsAppMessageResult } from "./types";

// Minimal structural type — both `createAdminClient()` and
// `await createClient()` satisfy it. We don't pin to the project's
// Database type because that would force an import of generated types
// into a leaf module; the queries here are simple enough that the
// `<any, any, any>` looseness costs nothing at runtime.
type AnySupabaseClient = SupabaseClient<any, any, any>;

// ─────────────────────────────────────────────────────────────
// lookupWhatsAppIntegration
// ─────────────────────────────────────────────────────────────

export type IntegrationLookupResult =
  | { ok: true; phoneNumberId: string; accessToken: string }
  | {
      ok: false;
      reason: "not_connected" | "missing_credentials" | "db_error";
    };

/**
 * Resolve the connected WhatsApp integration for a tenant.
 * Returns the `phone_number_id` (Spike's business number) + `access_token`
 * (current Meta API token), or a structured failure reason.
 *
 * RLS: works under both admin and user-scoped clients post-migration 025
 * (`integrations_admin_only` policy now uses `user_admin_tenant_ids()`
 * SECURITY DEFINER helper, no recursion).
 */
export async function lookupWhatsAppIntegration(
  db: AnySupabaseClient,
  tenantId: string
): Promise<IntegrationLookupResult> {
  const { data: integration, error } = await db
    .from("integrations")
    .select("metadata, status")
    .eq("tenant_id", tenantId)
    .eq("provider", "whatsapp")
    .eq("status", "connected")
    .maybeSingle();

  if (error) {
    console.error("[whatsapp/helpers] integration lookup failed:", error);
    return { ok: false, reason: "db_error" };
  }
  if (!integration) {
    return { ok: false, reason: "not_connected" };
  }

  const metadata = integration.metadata as
    | { phone_number_id?: string; access_token?: string }
    | null;
  const phoneNumberId = metadata?.phone_number_id;
  const accessToken = metadata?.access_token;
  if (!phoneNumberId || !accessToken) {
    return { ok: false, reason: "missing_credentials" };
  }

  return { ok: true, phoneNumberId, accessToken };
}

// ─────────────────────────────────────────────────────────────
// wasContactedInLast24h
// ─────────────────────────────────────────────────────────────

/**
 * Has the contact (customer or owner) sent us a WhatsApp message in the
 * last 24 hours?
 *
 * Required by Meta's session-message rule: outside the 24h window,
 * outbound session messages are silently dropped — only pre-approved
 * `template` messages can fire. Until Spike has Meta-approved templates
 * (post-Meta-Business-verification, paperwork in progress), every send
 * path checks this and falls back to "copy manually" UX when the window
 * is closed.
 *
 * Conservative on DB error: returns `false` so the caller lands on the
 * "outside window" branch rather than attempting a send Meta will drop.
 */
export async function wasContactedInLast24h(
  db: AnySupabaseClient,
  tenantId: string,
  contactPhone: string
): Promise<boolean> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("events")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("provider", "whatsapp")
    .eq("event_type", "whatsapp_message_received")
    .filter("payload->>contact_phone", "eq", contactPhone)
    .gte("received_at", cutoff)
    .limit(1);

  if (error) {
    console.error("[whatsapp/helpers] 24h window check failed:", error);
    return false;
  }
  return (data ?? []).length > 0;
}

// ─────────────────────────────────────────────────────────────
// mapSendErrorToHebrew
// ─────────────────────────────────────────────────────────────

/**
 * Translate a failed `sendWhatsAppMessage` result to a user-facing
 * Hebrew message. Used by every approve-and-send flow to surface the
 * right error text in UI alerts/toasts.
 *
 * Identical wording across drafts.ts / growth.ts / cron routes — the
 * owner sees consistent error language regardless of which agent
 * produced the message.
 */
export function mapSendErrorToHebrew(
  result: Extract<SendWhatsAppMessageResult, { ok: false }>
): string {
  switch (result.errorCategory) {
    case "auth":
      return "בעיית גישה ל-WhatsApp. פנה לתמיכה.";
    case "template_required":
      return "מחוץ לחלון 24 שעות. העתק את הטקסט ושלח ידנית.";
    case "invalid_number":
      return "המספר לא רשום ב-WhatsApp.";
    case "rate_limit":
      return "WhatsApp מבקש להאט. נסה שוב בעוד דקה.";
    case "transient":
      return "שגיאה זמנית בשליחה. נסה שוב בעוד דקה.";
    case "unknown":
      return `WhatsApp דחה את ההודעה: ${result.errorMessage}`;
  }
}
