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
// Sprint 3M — Helpers extracted to src/lib/whatsapp/helpers.ts
// ────────────────────────────────────────────────────────────────
// `lookupWhatsAppIntegration` / `wasContactedInLast24h` / `mapSendErrorToHebrew`
// were inline duplicates between this file and `actions/growth.ts` from
// Sprint 2C. Sprint 3M added a third caller (api/cron/morning/route.ts)
// and that flipped the cost-benefit: helpers now live in one place. Local
// extractor helpers (`extractRecipientPhone`, `extractMessageBody`)
// stay here — they're drafts-specific and parse `content` JSONB shapes
// that don't apply to growth_candidates or owner-facing summaries.
//
// ────────────────────────────────────────────────────────────────
// Sprint 3A — UI fix + double-execute hardening (commit 1ab5a08)
// ────────────────────────────────────────────────────────────────
// `approveDraft` UPDATE uses `.select("id")` + 0-rows-affected guard
// (§15.23 mitigation #1) to prevent double-WhatsApp-send when a single
// click double-fires the server action. The same `"הטיוטה כבר טופלה."`
// error string is returned in both the initial-fetch race (status was
// already non-pending when we read it) and the UPDATE race (status was
// pending when we read it but flipped before our UPDATE landed). The UI
// (approvals-list.tsx) suppresses that specific error and refreshes
// silently — see §10.38 + §15.23.
//
// ────────────────────────────────────────────────────────────────
// Sprint 2D — WhatsApp send wiring (1.15.4 / commit f3b04bd)
// ────────────────────────────────────────────────────────────────
// `approveDraft` extends from "status flip only" to:
//   1. Status flip to 'approved' (existing) — hardened in 3A.
//   2. If draft is WhatsApp-bound (external_target.platform === 'whatsapp')
//      AND has a recipient phone we can extract from content shapes,
//      attempt to send via Meta Cloud API (same path as Growth's 2C).
//   3. For non-WhatsApp drafts (social_post, review_reply, IG/FB DM,
//      sales_followup × email/IG) keep existing copy-paste UX — status
//      flips, no send attempt.
//
// Iron Rule preserved — the user clicking [אשר] IS the human approval;
// the send happens AS A RESULT of that click, never autonomously.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./_shared";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import {
  lookupWhatsAppIntegration,
  wasContactedInLast24h,
  mapSendErrorToHebrew,
} from "@/lib/whatsapp/helpers";

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
// Private helpers — drafts-specific content extractors
// ────────────────────────────────────────────────────────────────
//
// Different agents store recipient phone + message body in different
// `content` shapes. These extractors normalize across the documented
// shapes (per SPIKE-DRAFT-EXAMPLES.json). Validated against actual
// production shapes during Sprint 3M validation pass:
//   - sales_quick_response:   whatsappUrl + messageHebrew
//   - sales_followup × email: whatsappUrl + messageHebrew (early-exit on platform)
//   - sales_followup × IG:    whatsappUrl + messageHebrew (early-exit on platform)
//   - review_reply:           draftText + (no phone — early-exit on platform)
//   - social_post:            captionHebrew + (no phone — early-exit on platform)
//
// Only sales_quick_response actually traverses the WhatsApp send path;
// the others early-exit at the `external_target.platform !== 'whatsapp'`
// check and fall back to copy-paste UX. The extractors are still
// defensive across all four message-body candidates because future
// agents could route through here.

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
 * Race / double-execute hardening (§15.23 mitigation #1, Sprint 3A):
 * The UPDATE statement uses `.select("id")` so we can read back the
 * affected rows. If 0 rows were affected, that means another invocation
 * of this same action (typically a Next.js 16 / React 19 server-action
 * double-fire on a single click — see §15.23) already flipped the
 * status. We return the same "הטיוטה כבר טופלה." error the
 * initial-fetch path returns; the UI suppresses that specific error and
 * refreshes silently per mitigation #2 (see approvals-list.tsx
 * handleApprove). Without this check, supabase-js's UPDATE returns
 * `error: null` on 0-rows-affected, both invocations would proceed to
 * `sendWhatsAppMessage`, and the customer would receive two WhatsApp
 * messages for one click.
 *
 * Return shape (extended in 2D):
 *   - { success: true }                            — non-WhatsApp draft, status flipped only
 *   - { success: true, message: "ההודעה נשלחה." } — WhatsApp draft, sent successfully
 *   - { success: true, message: "אושר. ..." }      — WhatsApp draft, approved but couldn't auto-send
 *                                                    (no integration / outside 24h / missing data)
 *   - { success: false, error: "..." }            — DB error or send error (auth/invalid/etc.)
 *   - { success: false, error: "הטיוטה כבר טופלה." } — initial-fetch saw non-pending OR race-loss on UPDATE
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

    // Status flip — existing behavior, hardened with .select("id") to
    // detect the race-lost case where another concurrent invocation
    // already flipped the status between our fetch and our update.
    const { data: updatedRows, error: updateErr } = await db
      .from("drafts")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .eq("tenant_id", tenant.tenantId)
      .eq("status", "pending") // race guard
      .select("id");

    if (updateErr) {
      console.error("[approveDraft] update failed:", updateErr);
      return { success: false, error: updateErr.message };
    }

    // §15.23 mitigation #1: 0 rows affected = race lost. Another
    // invocation already flipped the status. Return the same error
    // the initial-fetch path returns so the UI's suppression branch
    // catches both shapes uniformly. Critically, do NOT proceed to
    // sendWhatsAppMessage — the winning invocation will handle that.
    if (!updatedRows || updatedRows.length === 0) {
      return { success: false, error: "הטיוטה כבר טופלה." };
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

    // Non-WhatsApp drafts (social_post, review_reply, IG/FB DM,
    // sales_followup × email/IG) keep the existing copy-paste UX —
    // status flips, owner copies the body and posts manually.
    // No send attempt.
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
      console.warn(
        `[approveDraft] send failed for draft ${draftId}: ${sendResult.errorCategory} / ${sendResult.metaCode ?? "no-code"} / ${sendResult.errorMessage}`
      );
      return {
        success: false,
        error: mapSendErrorToHebrew(sendResult),
      };
    }

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
