"use server";

// src/app/dashboard/actions/drafts.ts
//
// Server actions for the Approvals inbox at /dashboard/approvals.
//
// Drafts are the core of "AI מסמן, בעלים מחליט" — every customer-facing
// agent that produces user-visible content writes a `drafts` row, and
// the owner approves or rejects via the inbox.
//
// Status values:
//   - pending   → waiting for owner action (visible in inbox)
//   - approved  → owner clicked Approve (ready to send / already sent)
//   - rejected  → owner clicked Reject (with optional reason)
//   - expired   → cleanup cron set this when expires_at passed
//
// The inbox shows pending AND rejected (rejected stay visible so owner
// can see what was bounced and why; cleanup cron eventually removes
// them when expires_at fires).
//
// ────────────────────────────────────────────────────────────────
// Sprint 2D — WhatsApp send wiring (1.15.4)
// ────────────────────────────────────────────────────────────────
// `approveDraft` now does:
//   1. Status flip to 'approved' (existing)
//   2. If draft is WhatsApp-bound (external_target.platform === 'whatsapp')
//      AND has a recipient phone we can extract from content.whatsappUrl,
//      attempt to send via Meta Cloud API (same path as Growth's 2C).
//   3. For non-WhatsApp drafts (social_post, review_reply, IG/FB DM)
//      keep existing copy-paste UX — status flips, no send attempt.
//
// Iron Rule preserved — the user clicking [אשר] IS the human approval;
// the send happens AS A RESULT of that click, never autonomously.
//
// Helpers (lookup integration, 24h window check, error→Hebrew mapping)
// are duplicated from growth.ts in this iteration to keep 2D's blast
// radius minimal — a follow-up refactor can extract them to
// `src/lib/whatsapp/helpers.ts` once both call sites are stable.
//
// Exported:
//   - PendingDraft (interface)
//   - listPendingDrafts()
//   - approveDraft(draftId)        ← extended in 2D
//   - rejectDraft(draftId, reason?)

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./_shared";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import type { SendWhatsAppMessageResult } from "@/lib/whatsapp/types";

export interface PendingDraft {
  id: string;
  agent_id: string;
  type: string;
  content: Record<string, unknown>;
  status: string;
  action_type: string | null;
  defamation_risk: "low" | "medium" | "high" | null;
  defamation_flagged_phrases: string[] | null;
  contains_pii: boolean;
  recipient_label: string | null;
  context: Record<string, unknown> | null;
  external_target: Record<string, unknown> | null;
  rejection_reason: string | null;
  created_at: string;
  expires_at: string;
}

// ────────────────────────────────────────────────────────────────
// Private helpers — 2D send wiring
// ────────────────────────────────────────────────────────────────
//
// These mirror the helpers added to growth.ts in 2C. Duplicated
// rather than extracted to keep the 2D batch surgical; consolidation
// is tracked as follow-up refactor (no scheduled sub-stage).
//
// Note: drafts.ts uses the admin client (createAdminClient) end-to-end
// because the existing approve/reject flows are admin-scoped. That
// also means RLS isn't a factor here — the integration lookup and the
// events 24h-window check will succeed even on tenants whose RLS
// setup is pristine OR broken. (The migrations 025/026 from 1.15.3
// already fix RLS on the user-scoped path, so growth.ts works too.)

type DraftAdminClient = ReturnType<typeof createAdminClient>;

/**
 * Look up the tenant's connected WhatsApp integration credentials.
 * Mirrors lookupTenantWhatsAppIntegration in growth.ts.
 */
async function lookupWhatsAppIntegration(
  db: DraftAdminClient,
  tenantId: string
): Promise<
  | { ok: true; phoneNumberId: string; accessToken: string }
  | { ok: false; reason: "not_connected" | "missing_credentials" | "db_error" }
> {
  const { data: integration, error } = await db
    .from("integrations")
    .select("metadata, status")
    .eq("tenant_id", tenantId)
    .eq("provider", "whatsapp")
    .eq("status", "connected")
    .maybeSingle();

  if (error) {
    console.error("[drafts/actions] integration lookup failed:", error);
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

/**
 * Has this customer messaged the tenant in the last 24 hours?
 * Mirrors wasContactedInLast24h in growth.ts.
 *
 * Conservative on DB error: returns false so the user lands on the
 * "copy manually" message rather than attempting a send Meta will
 * silently drop.
 */
async function wasContactedInLast24h(
  db: DraftAdminClient,
  tenantId: string,
  customerPhone: string
): Promise<boolean> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("events")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("provider", "whatsapp")
    .eq("event_type", "whatsapp_message_received")
    .filter("payload->>contact_phone", "eq", customerPhone)
    .gte("received_at", cutoff)
    .limit(1);

  if (error) {
    console.error("[drafts/actions] 24h window check failed:", error);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * Translate a failed send result to a user-facing Hebrew message.
 * Mirrors mapSendErrorToHebrew in growth.ts (intentionally identical
 * wording for consistency across approve flows).
 */
function mapSendErrorToHebrew(
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

/**
 * Try to extract a recipient phone (E.164 with leading +) from a draft's
 * content. Different agents store the phone in different shapes:
 *   - sales_quick_response stores a wa.me URL in `content.whatsappUrl`
 *   - some agents may put a normalized phone in `content.toPhone`
 *   - external_target may carry the phone directly
 * Returns null if no plausible phone is found.
 */
function extractRecipientPhone(
  content: Record<string, unknown> | null,
  externalTarget: Record<string, unknown> | null
): string | null {
  // 1. wa.me URL — sales_quick_response and similar agents
  const whatsappUrl =
    typeof content?.whatsappUrl === "string" ? content.whatsappUrl : null;
  if (whatsappUrl) {
    const match = whatsappUrl.match(/wa\.me\/(\d+)/);
    if (match) return "+" + match[1];
  }

  // 2. Direct field on content
  const directContentPhone =
    typeof content?.toPhone === "string"
      ? content.toPhone
      : typeof content?.phone === "string"
        ? content.phone
        : null;
  if (directContentPhone) return directContentPhone;

  // 3. external_target phone field
  const externalPhone =
    typeof externalTarget?.toPhone === "string"
      ? externalTarget.toPhone
      : typeof externalTarget?.phone === "string"
        ? externalTarget.phone
        : null;
  if (externalPhone) return externalPhone;

  return null;
}

/**
 * Try to extract the message body text from a draft's content.
 * Different agents use different field names:
 *   - sales_quick_response → content.messageHebrew
 *   - some agents → content.message or content.body or content.text
 * Returns null if no plausible message text is found.
 */
function extractMessageBody(
  content: Record<string, unknown> | null
): string | null {
  if (!content) return null;
  const candidates = [
    content.messageHebrew,
    content.message,
    content.body,
    content.text,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────────
// Public actions
// ────────────────────────────────────────────────────────────────

/**
 * List drafts for the active tenant's inbox.
 * Returns up to 50 most-recent pending OR rejected drafts.
 * Ordered desc by created_at so the freshest items are at the top.
 */
export async function listPendingDrafts(): Promise<{
  success: boolean;
  drafts?: PendingDraft[];
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { data, error } = await db
      .from("drafts")
      .select(
        "id, agent_id, type, content, status, action_type, defamation_risk, defamation_flagged_phrases, contains_pii, recipient_label, context, external_target, rejection_reason, created_at, expires_at"
      )
      .eq("tenant_id", tenant.tenantId)
      .in("status", ["pending", "rejected"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[listPendingDrafts] DB error:", error);
      return { success: false, error: error.message };
    }
    return { success: true, drafts: (data as PendingDraft[]) ?? [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

/**
 * Owner approves a draft. Records who approved and when, then attempts
 * an automatic WhatsApp send if the draft is WhatsApp-bound.
 *
 * Tenant scope is enforced via the WHERE clause — no cross-tenant escape.
 *
 * Return shape (extended in 2D):
 *   - { success: true }                            — non-WhatsApp draft, status flipped only
 *   - { success: true, message: "ההודעה נשלחה." } — WhatsApp draft, sent successfully
 *   - { success: true, message: "אושר. ..." }      — WhatsApp draft, approved but couldn't auto-send
 *                                                    (no integration / outside 24h / missing data)
 *   - { success: false, error: "..." }            — DB error or send error (auth/invalid/etc.)
 */
export async function approveDraft(
  draftId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "לא מחובר" };

    const db = createAdminClient();

    // Fetch the draft (need content + external_target for send wiring,
    // and status so we can refuse to re-approve a non-pending draft).
    const { data: draft, error: fetchErr } = await db
      .from("drafts")
      .select("id, type, status, content, external_target")
      .eq("id", draftId)
      .eq("tenant_id", tenant.tenantId)
      .maybeSingle();

    if (fetchErr) {
      console.error("[approveDraft] fetch failed:", fetchErr);
      return { success: false, error: "שגיאה בטעינת הטיוטה." };
    }
    if (!draft) {
      return { success: false, error: "הטיוטה לא נמצאה." };
    }
    if (draft.status !== "pending") {
      return { success: false, error: "הטיוטה כבר טופלה." };
    }

    // Status flip — existing behavior.
    const { error: updateErr } = await db
      .from("drafts")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .eq("tenant_id", tenant.tenantId)
      .eq("status", "pending"); // race guard

    if (updateErr) {
      console.error("[approveDraft] update failed:", updateErr);
      return { success: false, error: updateErr.message };
    }

    // ── Send wiring (Sprint 2D) ───────────────────────────────────
    // Status is now 'approved'. Anything below is best-effort delivery
    // through Meta Cloud API; status stays 'approved' regardless of
    // send outcome (each early return matches the same UX pattern as
    // approveGrowthCandidate in 2C).

    const externalTarget = draft.external_target as
      | { platform?: string }
      | null;
    const isWhatsApp = externalTarget?.platform === "whatsapp";

    // Non-WhatsApp drafts (social_post, review_reply, IG/FB DM) keep the
    // existing copy-paste UX — status flips, owner copies the body
    // and posts manually. No send attempt.
    if (!isWhatsApp) {
      return { success: true };
    }

    const content = draft.content as Record<string, unknown> | null;
    const customerPhone = extractRecipientPhone(content, externalTarget);
    const messageBody = extractMessageBody(content);

    if (!customerPhone) {
      return {
        success: true,
        message:
          "אושר. לא הצלחתי לחלץ מספר טלפון מהטיוטה — העתק ושלח ידנית.",
      };
    }
    if (!messageBody) {
      return {
        success: true,
        message: "אושר. הטיוטה ריקה — אין מה לשלוח.",
      };
    }

    const integration = await lookupWhatsAppIntegration(db, tenant.tenantId);
    if (!integration.ok) {
      let msg = "אושר. WhatsApp לא מחובר — פנה לתמיכה.";
      if (integration.reason === "missing_credentials") {
        msg = "אושר. הגדרות WhatsApp לא מלאות — פנה לתמיכה.";
      } else if (integration.reason === "db_error") {
        msg = "אושר. שגיאה זמנית בבדיקת WhatsApp.";
      }
      return { success: true, message: msg };
    }

    const within24h = await wasContactedInLast24h(
      db,
      tenant.tenantId,
      customerPhone
    );
    if (!within24h) {
      return {
        success: true,
        message:
          "אושר. הלקוח לא פנה ב-24 השעות האחרונות — WhatsApp לא מאפשר שליחה ישירה. העתק את הטקסט ושלח ידנית.",
      };
    }

    const sendResult = await sendWhatsAppMessage({
      toPhone: customerPhone,
      messageBody,
      phoneNumberId: integration.phoneNumberId,
      accessToken: integration.accessToken,
    });

    if (!sendResult.ok) {
      // Genuine transmission failure (auth, invalid number, Meta 5xx after
      // retries, etc.). Status stays 'approved' — the owner's decision
      // stands; only transmission failed. Surface success=false so the
      // UI toast renders in error styling.
      console.warn(
        `[approveDraft] send failed for draft ${draftId}: ${sendResult.errorCategory} / ${sendResult.metaCode ?? "no-code"} / ${sendResult.errorMessage}`
      );
      return {
        success: false,
        error: mapSendErrorToHebrew(sendResult),
      };
    }

    // Send succeeded.
    return { success: true, message: "ההודעה נשלחה." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

/**
 * Owner rejects a draft, optionally with a reason.
 * Rejected drafts stay in the inbox until cleanup cron expires them.
 */
export async function rejectDraft(
  draftId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { error } = await db
      .from("drafts")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
        rejection_reason: reason ?? "owner rejected",
      })
      .eq("id", draftId)
      .eq("tenant_id", tenant.tenantId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}
