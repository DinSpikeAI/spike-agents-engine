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
import type {
  GrowthCandidateStatus,
  GrowthOutcomeType,
  GrowthRunTrigger,
} from "@/lib/agents/growth/types";

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
// Mutate — approve a candidate
// ─────────────────────────────────────────────────────────────

export interface ApproveGrowthResult {
  ok: boolean;
  message: string;
}

/**
 * Mark a pending candidate as approved. Optionally accepts an edited
 * version of the draft message (one-step "edit and approve").
 *
 * Sprint 2 Batch 2A scope:
 *   - Validate ownership (RLS + explicit tenant filter)
 *   - Optionally save edited message
 *   - Update status='approved', decided_at/by populated
 *
 * Sprint 2 Batch 2C scope (NOT in this batch):
 *   - Fire WhatsApp Cloud API send
 *   - On success: insert growth_outcomes(outcome_type='sent')
 *   - On failure: keep status='approved' so user can retry
 *   - Status stays 'approved' regardless — 'sent' is an outcome,
 *     not a candidate status (see types.ts)
 */
export async function approveGrowthCandidate(
  candidateId: string,
  editedMessage?: string
): Promise<ApproveGrowthResult> {
  const { user, tenantId } = await requireOnboarded();
  const db = await createClient();

  const { data: existing, error: fetchErr } = await db
    .from("growth_candidates")
    .select("id, status, expires_at")
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

  if (editedMessage && editedMessage.trim().length > 0) {
    const trimmed = editedMessage.trim();
    if (trimmed.length > 2000) {
      return { ok: false, message: "ההודעה ארוכה מדי (עד 2,000 תווים)." };
    }
    updates.draft_message = trimmed;
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

  revalidatePath("/dashboard/growth");
  return { ok: true, message: "אושר. (Sprint 2C יוסיף שליחה אוטומטית)" };
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
