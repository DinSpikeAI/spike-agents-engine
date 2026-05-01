// src/lib/agents/run-agent-safe.ts
//
// Wrapper around runAgent that orchestrates the 4 safety layers required
// for any agent that produces external-facing drafts (reviews_agent, social_posts,
// sales_agent, hot_leads when it generates outreach).
//
// The 4 layers (Israeli Compliance Protocol):
//   1. PII scrub on input  → scrubPii() before LLM call
//   2. Untrusted wrap      → wrapUntrustedInput() around end-customer content
//   3. Gender lock         → withGenderLock() injected into system prompt
//   4. Defamation guard    → checkDefamationRisk() on output (if outbound)
//
// Plus the lifecycle wiring:
//   - Writes the result to drafts table (not just agent_runs telemetry)
//   - Sets action_type per agent (never_auto / requires_approval / autosend_safe)
//   - Sets defamation_risk + flagged_phrases for owner UI
//   - Returns draft_id for the UI to track approval state
//
// runAgent (existing) handles agent_runs telemetry + cost tracking.
// This wrapper sits ON TOP of runAgent and adds the safety + drafts layer.

import { runAgent, type AgentExecutor } from "./run-agent";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrubPii, hashRecipient, type ScrubResult } from "@/lib/safety/pii-scrubber";
import {
  wrapUntrustedInput,
  detectInjectionAttempt,
} from "@/lib/safety/prompt-injection-guard";
import {
  withGenderLock,
  type BusinessOwnerGender,
} from "@/lib/safety/gender-lock";
import {
  checkDefamationRisk,
  type DefamationCheck,
} from "@/lib/safety/defamation-guard";
import type { RunInput, RunResult } from "./types";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Default expiry for outbound drafts that aren't date-bound.
// Reviews replies, sales follow-ups, and other "evergreen" drafts
// can sit in the inbox for 3 days before auto-expiring.
// Date-bound drafts (e.g., social_post for today's morning slot)
// MUST override expires_at in their own runner — see social/run.ts
// where it's set to end-of-today.
// ─────────────────────────────────────────────────────────────
const DEFAULT_DRAFT_EXPIRY_HOURS = 72;
export type ActionType = "never_auto" | "requires_approval" | "autosend_safe";

export type DraftType =
  | "review_reply"
  | "instagram_dm"
  | "whatsapp_message"
  | "email"
  | "social_post"
  | "internal_note"; // morning brief, watcher alert — autosend_safe

export interface SafetyContext {
  /** Type of action this draft represents. Drives action_type. */
  draftType: DraftType;

  /** What action class — 'never_auto' is the default for outbound. */
  actionType: ActionType;

  /** Run defamation classifier on output? Required for review_reply, social_post. */
  requiresDefamationCheck: boolean;

  /** Untrusted text fields from end-customer to wrap with sentinel tags. */
  untrustedInputs?: Record<string, string>;

  /** Recipient info for outbound drafts (channel + identifier). */
  recipient?: {
    channel: "whatsapp" | "sms" | "email" | "instagram_dm" | "phone_call" | "google_review_reply";
    /** Hashable identifier (phone/email/handle). Hashed before storage. */
    identifier: string;
    /** Display label for owner UI (e.g., "יוסי לוי"). May be visible. */
    label: string;
  };

  /** External target metadata (review id, post id, etc.) — stored in drafts.external_target. */
  externalTarget?: Record<string, unknown>;
}

/**
 * Result of runAgentWithSafety. Includes both the runAgent result
 * (for cost/telemetry) and the draft_id that the UI tracks.
 */
export interface SafeRunResult<T> extends RunResult<T> {
  draftId: string | null;
  defamation: DefamationCheck | null;
  piiDetected: ScrubResult["detected"];
  blockedReason: string | null;
}

// ─────────────────────────────────────────────────────────────
// Tenant context loader (gender + DPA status check)
// ─────────────────────────────────────────────────────────────

interface TenantSafetyContext {
  gender: BusinessOwnerGender | null;
  consentStatus: "pending" | "partial" | "full";
  dpaAccepted: boolean;
  vertical: string;
}

async function loadTenantSafetyContext(
  tenantId: string
): Promise<TenantSafetyContext> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("tenants")
    .select(
      "business_owner_gender, consent_status, dpa_accepted_at, vertical"
    )
    .eq("id", tenantId)
    .single();

  if (error || !data) {
    throw new Error(`Tenant ${tenantId} not found or inaccessible`);
  }

  return {
    gender: data.business_owner_gender as BusinessOwnerGender | null,
    consentStatus: (data.consent_status ?? "pending") as
      | "pending"
      | "partial"
      | "full",
    dpaAccepted: !!data.dpa_accepted_at,
    vertical: data.vertical ?? "general",
  };
}

// ─────────────────────────────────────────────────────────────
// Core wrapper
// ─────────────────────────────────────────────────────────────

/**
 * Build the prepared system blocks (with gender lock + injection guard
 * boilerplate) that an agent's executor should pass to anthropic.messages.create.
 */
export function prepareSafetySystemBlocks(
  staticPrompt: string,
  tenantGender: BusinessOwnerGender | null
): { type: "text"; text: string; cache_control?: { type: "ephemeral"; ttl: "1h" } }[] {
  return withGenderLock(staticPrompt, tenantGender);
}

/**
 * Sanitize an end-customer input field: scrub PII, wrap with sentinel tags,
 * detect injection attempts.
 */
export function sanitizeUntrustedInput(
  raw: string
): {
  forPrompt: string;
  scrub: ScrubResult;
  injection: ReturnType<typeof detectInjectionAttempt>;
} {
  const scrub = scrubPii(raw);
  const wrapped = wrapUntrustedInput(scrub.scrubbed);
  const injection = detectInjectionAttempt(scrub.scrubbed);

  return { forPrompt: wrapped, scrub, injection };
}

/**
 * The main wrapper. Calls runAgent under the hood, then runs post-flight
 * safety checks and writes to the drafts table.
 *
 * @param input        — RunInput (tenant, agent, model, trigger)
 * @param safety       — Safety context for THIS particular draft
 * @param executor     — The agent's actual Anthropic call (wrapped by safety machinery)
 * @param outputForReview  — Function that extracts the reviewable text from the
 *                           agent's structured output (e.g., the reply text from
 *                           a reviews_agent JSON output). Used by the defamation
 *                           classifier.
 * @param originalReviewText — When defamation check is required, provide the
 *                             original review/message text so the classifier
 *                             can compare draft → original.
 */
export async function runAgentWithSafety<TOutput>(
  input: RunInput,
  safety: SafetyContext,
  executor: AgentExecutor<TOutput>,
  options?: {
    outputForReview?: (output: TOutput) => string;
    originalReviewText?: string;
  }
): Promise<SafeRunResult<TOutput>> {
  // ─── Pre-flight: tenant safety context ────────────────────
  const tenantCtx = await loadTenantSafetyContext(input.tenantId);

  // Gate: if action is outbound and DPA not accepted, force draft-only mode
  // (still creates the draft, but logged with consent_status='pending' so
  // owner is reminded to complete onboarding).
  const forceLockToDraft =
    safety.actionType === "autosend_safe" &&
    (!tenantCtx.dpaAccepted || tenantCtx.consentStatus === "pending");
  const effectiveActionType: ActionType = forceLockToDraft
    ? "requires_approval"
    : safety.actionType;

  // ─── Run the agent (cost/telemetry handled by runAgent) ───
  const runResult = await runAgent<TOutput>(input, undefined, executor);

  // If the run failed or produced no output, bail without creating a draft.
  if (runResult.status === "failed" || !runResult.output) {
    return {
      ...runResult,
      draftId: null,
      defamation: null,
      piiDetected: [],
      blockedReason: null,
    };
  }

  // ─── Post-flight: defamation check ────────────────────────
  let defamation: DefamationCheck | null = null;
  let blockedReason: string | null = null;

  if (
    safety.requiresDefamationCheck &&
    options?.outputForReview &&
    options.originalReviewText
  ) {
    const reviewText = options.outputForReview(runResult.output);
    if (reviewText && reviewText.trim().length > 0) {
      try {
        defamation = await checkDefamationRisk(
          reviewText,
          options.originalReviewText
        );
      } catch (err) {
        // Defamation classifier failure is NOT a hard block — log and proceed
        // with the draft marked as "unverified". Owner sees a warning.
        console.error("[runAgentWithSafety] Defamation check failed:", err);
        defamation = {
          risk: "medium",
          flagged_phrases: [],
          reason: "בדיקת לשון הרע נכשלה טכנית. ערוך בזהירות.",
        };
      }

      if (defamation.risk === "high") {
        blockedReason = `Defamation risk: ${defamation.reason}`;
      }
    }
  }

  // ─── Aggregate PII signals from the safety context (provided by caller) ───
  // The caller's executor already scrubbed PII via sanitizeUntrustedInput;
  // we accept the totals through telemetry.
  // For now, just track whether any was detected.
  const piiDetected: ScrubResult["detected"] = []; // populated by caller via runResult side-channel in next iteration

  // ─── Persist to drafts table (the legal exhibit) ──────────
  const db = createAdminClient();

  const draftRow = {
    tenant_id: input.tenantId,
    agent_run_id: runResult.runId,
    agent_id: input.agentId,
    type: safety.draftType,
    content: runResult.output as object,
    status: blockedReason ? "rejected" : "pending",
    action_type: effectiveActionType,
    context: {
      trigger: input.triggerSource,
      injection_attempts_detected: !!safety.untrustedInputs && false, // future: aggregate from sanitize calls
      forced_to_draft: forceLockToDraft,
      consent_status_at_run: tenantCtx.consentStatus,
      dpa_accepted_at_run: tenantCtx.dpaAccepted,
    },
    external_target: safety.externalTarget ?? null,
expires_at: new Date(
      Date.now() + DEFAULT_DRAFT_EXPIRY_HOURS * 60 * 60 * 1000
    ).toISOString(),    defamation_risk: defamation?.risk ?? null,
    defamation_flagged_phrases: defamation?.flagged_phrases ?? null,
    contains_pii: piiDetected.length > 0,
    pii_scrubbed: piiDetected.length > 0,
    rejected_at: blockedReason ? new Date().toISOString() : null,
    rejection_reason: blockedReason,
    recipient_hash: safety.recipient
      ? await hashRecipient(safety.recipient.channel, safety.recipient.identifier)
      : null,
    recipient_label: safety.recipient?.label ?? null,
  };

  const { data: insertedDraft, error: insertError } = await db
    .from("drafts")
    .insert(draftRow)
    .select("id")
    .single();

  if (insertError) {
    console.error(
      "[runAgentWithSafety] Failed to persist draft:",
      insertError
    );
    return {
      ...runResult,
      draftId: null,
      defamation,
      piiDetected,
      blockedReason: blockedReason ?? `DB insert failed: ${insertError.message}`,
    };
  }

  return {
    ...runResult,
    draftId: insertedDraft.id,
    defamation,
    piiDetected,
    blockedReason,
  };
}
