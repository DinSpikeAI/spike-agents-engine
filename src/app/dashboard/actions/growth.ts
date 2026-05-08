"use server";

// src/app/dashboard/actions/growth.ts
//
// Sprint 2 Batch 2A — server actions for the Growth Agent dashboard.
//
// These are the mutations the owner triggers from /dashboard/growth:
//   - listPendingGrowthCandidates: feed the main list
//   - getGrowthRoi: feed the stat strip (last 30 days)
//   - approveGrowthCandidate: owner approves; status='approved'
//       Batch 2C will extend this to fire WhatsApp send and append a
//       growth_outcomes row of type 'sent'. Note: there is NO 'sent'
//       candidate status — that's tracked as an outcome only. Status
//       stays 'approved' once the owner decides; outcomes track
//       activity (sent, replied, closed, rejected_by_owner, expired).
//   - rejectGrowthCandidate: owner says "not relevant"
//   - markGrowthCandidateClosed: owner says "I closed the deal";
//       optional revenue capture for ROI tracking
//   - editGrowthDraft: owner edited the message before approving
//   - triggerGrowthOnDemand: Pro/Chain tier on-demand re-run
//       (preserved from Sprint 1 — the cron-equivalent button)
//
// Iron Rule preserved everywhere: nothing here SENDS. The send
// integration lives in Batch 2C and is invoked from approve.
//
// Auth model: every action calls requireOnboarded() which returns
// user + tenantId + tenantConfig + tenantName already-cached. We
// then double-filter every DB query by tenant_id explicitly to
// defend against any race or RLS edge case. Belt + suspenders.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOnboarded } from "@/lib/auth/require-onboarded";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import type { SendWhatsAppMessageResult } from "@/lib/whatsapp/types";
import type {
  GrowthCandidateStatus,
  GrowthOutcomeType,
  GrowthRunTrigger,
} from "@/lib/agents/growth/types";

// User-scoped server Supabase client type — for our private helpers below.
// Resolved from createClient()'s return type so we don't add a new import
// path; if Spike's server client shape changes, this picks it up.
type ServerDb = Awaited<ReturnType<typeof createClient>>;

// ─────────────────────────────────────────────────────────────
// Types — for client-side consumption
// ─────────────────────────────────────────────────────────────

export interface PendingGrowthCandidate {
  id: string;
  customerPhone: string | null;
  source: string;
  goal: string;
  priorityScore: number;
  whyExplanation: string;
  candidateLabel: string;
  candidateSubtitle: string | null;
  draftMessage: string;
  draftChannel: string;
  expiresAt: string; // ISO
  createdAt: string; // ISO
}

export interface GrowthRoiSnapshot {
  draftsCreated: number; // last 30d, all sources
  draftsApproved: number; // approved + closed (closed went through approved)
  draftsClosed: number; // status = 'closed'
  draftsRejected: number; // status = 'rejected'
  revenueIls: number; // sum of closed_value_ils
  conversionRate: number; // draftsClosed / draftsCreated, 0..1
  /** ISO date 30 days back, for transparency in the UI */
  windowStartIso: string;
}

export interface OnDemandTriggerResult {
  ok: boolean;
  message: string;
}

// ─────────────────────────────────────────────────────────────
// Read — pending candidates for the main list
// ─────────────────────────────────────────────────────────────

/**
 * Returns all PENDING growth candidates for the active tenant whose
 * expires_at is in the future. Sorted by priority_score DESC so the
 * highest-scoring opportunities appear first.
 */
export async function listPendingGrowthCandidates(): Promise<
  PendingGrowthCandidate[]
> {
  const { tenantId } = await requireOnboarded();
  const db = await createClient();

  const nowIso = new Date().toISOString();

  const { data, error } = await db
    .from("growth_candidates")
    .select(
      "id, customer_phone, source, goal, priority_score, why_explanation, candidate_label, candidate_subtitle, draft_message, draft_channel, expires_at, created_at"
    )
    .eq("tenant_id", tenantId)
    .eq("status", "pending" satisfies GrowthCandidateStatus)
    .gt("expires_at", nowIso)
    .order("priority_score", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[growth/actions] listPendingGrowthCandidates failed:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    customerPhone: row.customer_phone,
    source: row.source,
    goal: row.goal,
    priorityScore: row.priority_score,
    whyExplanation: row.why_explanation,
    candidateLabel: row.candidate_label,
    candidateSubtitle: row.candidate_subtitle,
    draftMessage: row.draft_message,
    draftChannel: row.draft_channel,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

// ─────────────────────────────────────────────────────────────
// Read — ROI snapshot for the stat strip
// ─────────────────────────────────────────────────────────────

/**
 * Aggregates the last 30 days of growth_candidates for the active
 * tenant. Conversion rate is closed / total — a candidate that was
 * rejected or expired or never decided is in the denominator.
 */
export async function getGrowthRoi(): Promise<GrowthRoiSnapshot> {
  const { tenantId } = await requireOnboarded();
  const db = await createClient();

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 30);
  const windowStartIso = windowStart.toISOString();

  const { data, error } = await db
    .from("growth_candidates")
    .select("status, closed_value_ils")
    .eq("tenant_id", tenantId)
    .gte("created_at", windowStartIso);

  if (error) {
    console.error("[growth/actions] getGrowthRoi failed:", error);
    return {
      draftsCreated: 0,
      draftsApproved: 0,
      draftsClosed: 0,
      draftsRejected: 0,
      revenueIls: 0,
      conversionRate: 0,
      windowStartIso,
    };
  }

  const rows = data ?? [];
  let approved = 0;
  let closed = 0;
  let rejected = 0;
  let revenue = 0;

  for (const row of rows) {
    const status = row.status as GrowthCandidateStatus;
    // approved + closed (closed implicitly went through approved first)
    if (status === "approved" || status === "closed") {
      approved += 1;
    }
    if (status === "closed") {
      closed += 1;
      // numeric arrives as string from postgres in some clients
      const raw = row.closed_value_ils;
      const parsed =
        typeof raw === "number"
          ? raw
          : typeof raw === "string"
            ? parseFloat(raw)
            : NaN;
      if (!isNaN(parsed)) revenue += parsed;
    }
    if (status === "rejected") rejected += 1;
  }

  const total = rows.length;
  const conversionRate = total > 0 ? closed / total : 0;

  return {
    draftsCreated: total,
    draftsApproved: approved,
    draftsClosed: closed,
    draftsRejected: rejected,
    revenueIls: Math.round(revenue * 100) / 100,
    conversionRate: Math.round(conversionRate * 10000) / 10000, // 4 decimal places
    windowStartIso,
  };
}

// ─────────────────────────────────────────────────────────────
// Private helpers for Sprint 2 Batch 2C send wiring
// ─────────────────────────────────────────────────────────────

/**
 * Look up the tenant's connected WhatsApp integration and pull the
 * credentials needed for an outbound send. Returns a discriminated
 * result so the caller can produce a precise Hebrew message per
 * failure mode (not connected vs. configured-but-broken).
 *
 * Note: `metadata` is jsonb on the integrations table — we cast it to
 * the partial shape we need. If the row exists but a field is missing,
 * we treat it as `missing_credentials` rather than `not_connected`,
 * because the tenant's intent IS to use WhatsApp; the setup is just
 * incomplete.
 */
async function lookupTenantWhatsAppIntegration(
  db: ServerDb,
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
    console.error("[growth/actions] integration lookup failed:", error);
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
 * Has this customer messaged this tenant in the last 24 hours?
 *
 * WhatsApp Cloud API hard rule: outbound free-text is only allowed when
 * the recipient initiated a conversation within the trailing 24h window.
 * For Reactivation candidates (45+ days dormant by definition) this will
 * almost always be false — and we surface a "copy and send manually"
 * message instead of attempting the send. For Lead Discovery candidates
 * (when Sprint 3 wires the Meta inbox) this is typically true.
 *
 * Conservative on DB error: returns false (assume outside window).
 * Better to tell the user "copy manually" than to attempt a send that
 * Meta will reject anyway.
 */
async function wasContactedInLast24h(
  db: ServerDb,
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
    console.error("[growth/actions] 24h window check failed:", error);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * Translate a failed send result to a user-facing Hebrew message.
 * One central place to keep the wording consistent and the categories
 * exhaustive — TypeScript flags missing branches via the `satisfies` on
 * the discriminant.
 */
function mapSendErrorToHebrew(
  result: Extract<SendWhatsAppMessageResult, { ok: false }>
): string {
  switch (result.errorCategory) {
    case "auth":
      return "בעיית גישה ל-WhatsApp. פנה לתמיכה.";
    case "template_required":
      // 24h check should have caught this earlier; landing here means
      // either clock skew or a Meta-side state we don't model.
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

// ─────────────────────────────────────────────────────────────
// Mutate — approve a candidate
// ─────────────────────────────────────────────────────────────

export interface ApproveGrowthResult {
  ok: boolean;
  message: string;
}

/**
 * Mark a pending candidate as approved AND fire the WhatsApp send
 * (Sprint 2 Batch 2C). Optionally accepts an edited version of the
 * draft message (one-step "edit and approve").
 *
 * Iron Rule preservation: this function only sends when called. The
 * caller is the user clicking [אשר] in the OpportunityCard — that
 * click IS the human approval. The send happens AS A RESULT, never
 * autonomously.
 *
 * Flow:
 *   1. Validate ownership (RLS + explicit tenant filter)
 *   2. Validate state (still pending, not expired)
 *   3. Optionally save edited message
 *   4. Update status='approved' (with race guard on status='pending')
 *   5. Determine if we can send via WhatsApp:
 *      a. Source must be "interactions" — Meta inbox (instagram/facebook)
 *         needs Sprint 3 wiring
 *      b. customer_phone must be present
 *      c. Tenant must have a connected WhatsApp integration with
 *         phone_number_id + access_token
 *      d. Customer must have messaged us in the trailing 24h window
 *         (WhatsApp's hard rule for freeform text)
 *   6. If all 5a-d pass, call sendWhatsAppMessage
 *   7. On send success: insert growth_outcomes(outcome_type='sent')
 *   8. On send failure: status STAYS 'approved' so the owner's decision
 *      is preserved; UI just gets a precise error message
 *
 * Status semantics: 'approved' means the owner decided. There is no
 * 'sent' status — that's an outcome, not a state. A candidate can be
 * approved-but-not-sent (e.g. outside 24h window) and the owner can
 * always copy the text and send manually from their phone.
 */
export async function approveGrowthCandidate(
  candidateId: string,
  editedMessage?: string
): Promise<ApproveGrowthResult> {
  const { user, tenantId } = await requireOnboarded();
  const db = await createClient();

  // Fetch the candidate. We need source/customer_phone/draft_message in
  // addition to the validation fields, because steps 5-8 below act on
  // them after the status flip.
  const { data: existing, error: fetchErr } = await db
    .from("growth_candidates")
    .select("id, status, expires_at, source, customer_phone, draft_message")
    .eq("id", candidateId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { ok: false, message: "ההזדמנות לא נמצאה." };
  }
  if (existing.status !== "pending") {
    return { ok: false, message: "ההזדמנות כבר טופלה." };
  }
  if (new Date(existing.expires_at) <= new Date()) {
    return { ok: false, message: "ההזדמנות פגה. רענן את הדף." };
  }

  const updates: Record<string, unknown> = {
    status: "approved" satisfies GrowthCandidateStatus,
    decided_at: new Date().toISOString(),
    decided_by: user.id,
  };

  // Resolve the message body that will actually be sent. If the owner
  // edited it in the draft editor and clicked "אשר" from there, prefer
  // the edited version; otherwise fall back to the stored draft.
  let messageToSend = existing.draft_message as string;
  if (editedMessage && editedMessage.trim().length > 0) {
    const trimmed = editedMessage.trim();
    if (trimmed.length > 2000) {
      return { ok: false, message: "ההודעה ארוכה מדי (עד 2,000 תווים)." };
    }
    updates.draft_message = trimmed;
    messageToSend = trimmed;
  }

  const { error: updateErr } = await db
    .from("growth_candidates")
    .update(updates)
    .eq("id", candidateId)
    .eq("tenant_id", tenantId)
    .eq("status", "pending"); // race guard

  if (updateErr) {
    console.error("[growth/actions] approve update failed:", updateErr);
    return { ok: false, message: "שגיאה בעדכון. נסה שוב." };
  }

  // ─── Send wiring (Sprint 2 Batch 2C) ──────────────────────────
  // Status is now 'approved'. The card disappears from /dashboard/growth's
  // pending list regardless of what happens below — that's the owner's
  // decision crystallized. Each early return below first calls
  // revalidatePath so the UI catches up; we use ok=true with informative
  // messages for "approved but couldn't auto-send" cases (no integration,
  // outside 24h window, Meta-only source) since the approval itself
  // succeeded — the user just needs the context. We use ok=false only
  // for genuine transmission failures (Meta API errors).

  const source = existing.source as string;
  if (source !== "interactions") {
    revalidatePath("/dashboard/growth");
    return {
      ok: true,
      message: "אושר. שליחה במקור הזה עדיין לא נתמכת (Sprint 3).",
    };
  }

  const customerPhone = existing.customer_phone as string | null;
  if (!customerPhone) {
    revalidatePath("/dashboard/growth");
    return {
      ok: true,
      message: "אושר. אך לא נמצא טלפון ליצירת קשר.",
    };
  }

  const integration = await lookupTenantWhatsAppIntegration(db, tenantId);
  if (!integration.ok) {
    revalidatePath("/dashboard/growth");
    let msg = "אושר. WhatsApp לא מחובר — פנה לתמיכה.";
    if (integration.reason === "missing_credentials") {
      msg = "אושר. הגדרות WhatsApp לא מלאות — פנה לתמיכה.";
    } else if (integration.reason === "db_error") {
      msg = "אושר. שגיאה זמנית בבדיקת WhatsApp.";
    }
    return { ok: true, message: msg };
  }

  const within24h = await wasContactedInLast24h(db, tenantId, customerPhone);
  if (!within24h) {
    revalidatePath("/dashboard/growth");
    return {
      ok: true,
      message:
        "אושר. הלקוח לא פנה ב-24 השעות האחרונות — WhatsApp לא מאפשר שליחה ישירה. העתק את הטקסט ושלח ידנית.",
    };
  }

  const sendResult = await sendWhatsAppMessage({
    toPhone: customerPhone,
    messageBody: messageToSend,
    phoneNumberId: integration.phoneNumberId,
    accessToken: integration.accessToken,
  });

  if (!sendResult.ok) {
    // Genuine transmission failure (auth, invalid number, Meta 5xx after
    // retries, etc.). Status stays 'approved' — the owner's decision
    // stands; only transmission failed. Surface ok=false so the UI
    // toast shows in error styling.
    console.warn(
      `[growth/actions] send failed for candidate ${candidateId}: ${sendResult.errorCategory} / ${sendResult.metaCode ?? "no-code"} / ${sendResult.errorMessage}`
    );
    revalidatePath("/dashboard/growth");
    return { ok: false, message: mapSendErrorToHebrew(sendResult) };
  }

  // Send succeeded — record outcome for ROI tracking. Non-fatal if the
  // insert fails; the message is already out and cannot be unsent.
  const { error: outcomeErr } = await db.from("growth_outcomes").insert({
    tenant_id: tenantId,
    candidate_id: candidateId,
    outcome_type: "sent" satisfies GrowthOutcomeType,
    reported_value_ils: null,
  });
  if (outcomeErr) {
    console.warn("[growth/actions] sent outcome insert failed:", outcomeErr);
  }

  revalidatePath("/dashboard/growth");
  return { ok: true, message: "ההודעה נשלחה." };
}

// ─────────────────────────────────────────────────────────────
// Mutate — reject a candidate
// ─────────────────────────────────────────────────────────────

export interface RejectGrowthResult {
  ok: boolean;
  message: string;
}

export async function rejectGrowthCandidate(
  candidateId: string,
  reason?: string
): Promise<RejectGrowthResult> {
  const { user, tenantId } = await requireOnboarded();
  const db = await createClient();

  const { data: existing, error: fetchErr } = await db
    .from("growth_candidates")
    .select("id, status")
    .eq("id", candidateId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { ok: false, message: "ההזדמנות לא נמצאה." };
  }
  if (existing.status !== "pending") {
    return { ok: false, message: "ההזדמנות כבר טופלה." };
  }

  const { error: updateErr } = await db
    .from("growth_candidates")
    .update({
      status: "rejected" satisfies GrowthCandidateStatus,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
    })
    .eq("id", candidateId)
    .eq("tenant_id", tenantId)
    .eq("status", "pending");

  if (updateErr) {
    console.error("[growth/actions] reject update failed:", updateErr);
    return { ok: false, message: "שגיאה בעדכון. נסה שוב." };
  }

  // Append-only audit. (reason is captured in console for now;
  // a future migration can add a payload jsonb column to growth_outcomes
  // if we want to store the rejection text.)
  if (reason) {
    console.log(
      `[growth/actions] candidate ${candidateId} rejected with reason: ${reason}`
    );
  }

  const { error: outcomeErr } = await db.from("growth_outcomes").insert({
    tenant_id: tenantId,
    candidate_id: candidateId,
    outcome_type: "rejected_by_owner" satisfies GrowthOutcomeType,
    reported_value_ils: null,
  });

  if (outcomeErr) {
    // Non-fatal — the status update already succeeded. Just log.
    console.warn("[growth/actions] rejected outcome insert failed:", outcomeErr);
  }

  revalidatePath("/dashboard/growth");
  return { ok: true, message: "ההזדמנות נדחתה." };
}

// ─────────────────────────────────────────────────────────────
// Mutate — owner closed the deal (offline or via reply)
// ─────────────────────────────────────────────────────────────

export interface MarkClosedResult {
  ok: boolean;
  message: string;
}

/**
 * Owner self-reports "I closed this deal". Optional revenue value
 * feeds into the ROI strip. Allowed from any non-terminal status —
 * pending (closed it offline before contacting), approved (closed
 * after sending), even rejected (changed their mind).
 */
export async function markGrowthCandidateClosed(
  candidateId: string,
  valueIls?: number
): Promise<MarkClosedResult> {
  const { user, tenantId } = await requireOnboarded();
  const db = await createClient();

  if (valueIls !== undefined) {
    if (typeof valueIls !== "number" || isNaN(valueIls)) {
      return { ok: false, message: "סכום לא תקין." };
    }
    if (valueIls < 0) {
      return { ok: false, message: "סכום לא יכול להיות שלילי." };
    }
    if (valueIls > 1_000_000) {
      return { ok: false, message: "סכום גדול מדי. ודא שהזנת נכון." };
    }
  }

  const { data: existing, error: fetchErr } = await db
    .from("growth_candidates")
    .select("id, status")
    .eq("id", candidateId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { ok: false, message: "ההזדמנות לא נמצאה." };
  }
  if (existing.status === "closed") {
    return { ok: false, message: "ההזדמנות כבר סומנה כסגורה." };
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await db
    .from("growth_candidates")
    .update({
      status: "closed" satisfies GrowthCandidateStatus,
      decided_at: nowIso,
      decided_by: user.id,
      closed_at: nowIso,
      closed_value_ils: valueIls ?? null,
    })
    .eq("id", candidateId)
    .eq("tenant_id", tenantId);

  if (updateErr) {
    console.error("[growth/actions] markClosed update failed:", updateErr);
    return { ok: false, message: "שגיאה בעדכון. נסה שוב." };
  }

  const { error: outcomeErr } = await db.from("growth_outcomes").insert({
    tenant_id: tenantId,
    candidate_id: candidateId,
    outcome_type: "closed" satisfies GrowthOutcomeType,
    reported_value_ils: valueIls ?? null,
  });

  if (outcomeErr) {
    console.warn("[growth/actions] closed outcome insert failed:", outcomeErr);
  }

  revalidatePath("/dashboard/growth");
  return { ok: true, message: "מצוין! הסגירה תועדה." };
}

// ─────────────────────────────────────────────────────────────
// Mutate — edit the draft message (stays pending)
// ─────────────────────────────────────────────────────────────

export interface EditDraftResult {
  ok: boolean;
  message: string;
}

export async function editGrowthDraft(
  candidateId: string,
  newMessage: string
): Promise<EditDraftResult> {
  const { tenantId } = await requireOnboarded();
  const db = await createClient();

  const trimmed = newMessage.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "ההודעה ריקה." };
  }
  if (trimmed.length > 2000) {
    return { ok: false, message: "ההודעה ארוכה מדי (עד 2,000 תווים)." };
  }

  const { data: existing, error: fetchErr } = await db
    .from("growth_candidates")
    .select("id, status")
    .eq("id", candidateId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { ok: false, message: "ההזדמנות לא נמצאה." };
  }
  if (existing.status !== "pending") {
    return { ok: false, message: "אי אפשר לערוך הזדמנות שכבר טופלה." };
  }

  const { error: updateErr } = await db
    .from("growth_candidates")
    .update({ draft_message: trimmed })
    .eq("id", candidateId)
    .eq("tenant_id", tenantId)
    .eq("status", "pending");

  if (updateErr) {
    console.error("[growth/actions] edit update failed:", updateErr);
    return { ok: false, message: "שגיאה בעדכון. נסה שוב." };
  }

  revalidatePath("/dashboard/growth");
  return { ok: true, message: "ההודעה נשמרה." };
}

// ─────────────────────────────────────────────────────────────
// Mutate — on-demand trigger (PRESERVED from Sprint 1)
// ─────────────────────────────────────────────────────────────

const ON_DEMAND_COOLDOWN_MINUTES = 60;

/**
 * Pro/Chain-tier owners can manually re-run the Growth Agent without
 * waiting for the Sunday cron. 60-minute cooldown prevents abuse +
 * runaway spend.
 *
 * Solo tier sees the button but it returns a tier-gate message; the
 * UI also disables the button server-side (added in Batch 2B).
 */
export async function triggerGrowthOnDemand(): Promise<OnDemandTriggerResult> {
  const { user, tenantId, tenantConfig } = await requireOnboarded();
  const db = await createClient();

  // ─── Tier gate ──────────────────────────────────────────────
  const tier = (tenantConfig as { tier?: string } | null)?.tier ?? "solo";
  if (tier !== "pro" && tier !== "chain") {
    return {
      ok: false,
      message: "הפעלה ידנית זמינה במסלול Pro ומעלה.",
    };
  }

  // ─── Cooldown check ────────────────────────────────────────
  const cooldownStart = new Date(
    Date.now() - ON_DEMAND_COOLDOWN_MINUTES * 60 * 1000
  ).toISOString();

  const { data: recent, error: recentErr } = await db
    .from("growth_runs")
    .select("id, started_at")
    .eq("tenant_id", tenantId)
    .eq("trigger", "on_demand" satisfies GrowthRunTrigger)
    .gte("started_at", cooldownStart)
    .limit(1);

  if (recentErr) {
    console.error("[growth/actions] cooldown check failed:", recentErr);
    return { ok: false, message: "שגיאה זמנית. נסה שוב." };
  }

  if (recent && recent.length > 0) {
    return {
      ok: false,
      message: `ניתן להפעיל את הסוכן ידנית פעם ב-${ON_DEMAND_COOLDOWN_MINUTES} דקות. נסה שוב מאוחר יותר.`,
    };
  }

  // ─── Fire the event ────────────────────────────────────────
  try {
    await inngest.send({
      name: INNGEST_EVENTS.GROWTH_RUN_TENANT,
      data: {
        tenantId,
        trigger: "on_demand" satisfies GrowthRunTrigger,
        triggeredBy: user.id,
      },
    });
  } catch (err) {
    console.error("[growth/actions] inngest.send failed:", err);
    return { ok: false, message: "שגיאה זמנית. נסה שוב." };
  }

  revalidatePath("/dashboard/growth");
  return {
    ok: true,
    message: "הסוכן הופעל. תוצאות יופיעו תוך כמה דקות.",
  };
}
