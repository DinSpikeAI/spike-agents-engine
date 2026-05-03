/**
 * Sales Agent — Day 15 + Sub-stage 1.3 (LLM retry) + Sub-stage 1.3.5 (quick response)
 *
 * Two distinct entry points sharing this file:
 *
 * 1. `runSalesAgent(tenantId, triggerSource)` — STUCK LEADS workflow.
 *    Generates Hebrew follow-up drafts for hot_leads classified 3+ days ago
 *    that haven't been contacted. Cron-triggered (07:30 daily).
 *    Schema: SALES_AGENT_OUTPUT_SCHEMA (rich: subjectLine, messageTone, etc).
 *
 * 2. `runSalesQuickResponseOnEvent(tenantId, eventId)` — FRESH HOT LEADS workflow.
 *    Generates a short first-response message for a freshly classified hot/burning
 *    lead. Webhook-triggered via Hot Leads cascade.
 *    Schema: SALES_QUICK_RESPONSE_OUTPUT_SCHEMA (minimal: message_text only).
 *
 * Both functions share `loadTenantContext`, `buildWhatsappUrl`, and use
 * `runAgent` for unified observability (agent_runs row, cost_ledger).
 *
 * STUCK pipeline (existing, unchanged from Sub-stage 1.3):
 *   1. Load tenant context (name, vertical, sales config)
 *   2. Query stuck leads:
 *        bucket IN ('warm','hot','burning')
 *        AND status = 'classified'
 *        AND received_at < NOW() - INTERVAL '3 days'
 *   3. Skip leads with already-pending sales drafts (don't dup)
 *   4. Deduplicate by normalized source_handle and display_name
 *   5. Send to Sonnet 4.6 with adaptive thinking (wrapped in withRetry)
 *   6. Persist each follow-up as a draft row (type='sales_followup')
 *
 * QUICK RESPONSE pipeline (new in 1.3.5):
 *   1. Idempotency: check if a sales_quick_response draft already exists for this event
 *   2. Load event + tenant
 *   3. Build single-lead block from event.payload
 *   4. Send to Sonnet 4.6 (wrapped in withRetry) with quick-response schema
 *   5. Persist single draft (type='sales_quick_response', context.event_id=eventId)
 */

import { runAgent } from "../run-agent";
import { anthropic } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { withRetry } from "@/lib/with-retry";
import { SALES_AGENT_OUTPUT_SCHEMA } from "./schema";
import {
  SALES_AGENT_SYSTEM_PROMPT,
  buildSalesUserMessage,
  type SalesPromptContext,
} from "./prompt";
import {
  SALES_QUICK_RESPONSE_OUTPUT_SCHEMA,
  type SalesQuickResponseOutput,
} from "./schema-quick-response";
import {
  SALES_QUICK_RESPONSE_SYSTEM_PROMPT,
  buildSalesQuickResponseUserMessage,
  type SalesQuickResponsePromptContext,
} from "./prompt-quick-response";
import { withGenderLock, type BusinessOwnerGender } from "@/lib/safety/gender-lock";
import type { RunResult } from "../types";

const MODEL = "claude-sonnet-4-6" as const;

// ─────────────────────────────────────────────────────────────
// Output type — matches schema (stuck-lead workflow)
// ─────────────────────────────────────────────────────────────

export interface SalesFollowUp {
  leadId: string;
  leadDisplayName: string;
  stuckReasonInferred:
    | "no_response_after_quote"
    | "ghosted_after_meeting"
    | "price_objection_unresolved"
    | "timing_uncertain"
    | "decision_maker_unclear"
    | "no_response_after_initial"
    | "other";
  channel: "whatsapp" | "email" | "instagram_dm" | "manual";
  subjectLineHebrew: string | null;
  messageHebrew: string;
  messageTone:
    | "warm_check_in"
    | "value_reminder"
    | "gentle_nudge"
    | "direct_close"
    | "break_up";
  whatsappUrl: string | null;
  recommendedSendWindowLocal: string;
  expectedResponseProbability: "low" | "med" | "high";
  rationaleShort: string;
}

export interface SalesAgentOutput {
  followUps: SalesFollowUp[];
  summary: string;
  noOpReason: string | null;
}

export interface SalesRunResult extends RunResult<SalesAgentOutput> {
  draftIds: string[];
  stuckLeadsCount: number;
  duplicatesSkipped: number;
}

// ─────────────────────────────────────────────────────────────
// Tenant context loading (shared by both entry points)
// ─────────────────────────────────────────────────────────────

interface TenantSalesContext {
  gender: BusinessOwnerGender | null;
  vertical: string;
  ownerName: string;
  businessName: string;
  toneOfVoice: string;
  whatsappBusinessNumber: string | null;
  emailFromName: string | null;
  emailSignature: string | null;
  availabilityLink: string | null;
  servicesPricingDisclose: boolean;
  followUpAggressiveness: "gentle" | "standard" | "persistent";
}

async function loadTenantContext(tenantId: string): Promise<TenantSalesContext> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("tenants")
    .select("name, business_owner_gender, vertical, config")
    .eq("id", tenantId)
    .single();

  if (error || !data) {
    throw new Error(`Tenant ${tenantId} not found: ${error?.message}`);
  }

  const config = (data.config as Record<string, unknown> | null) ?? {};
  const salesConfig =
    (config["sales"] as Record<string, unknown> | undefined) ?? {};
  const socialConfig =
    (config["social"] as Record<string, unknown> | undefined) ?? {};

  return {
    gender: data.business_owner_gender as BusinessOwnerGender | null,
    vertical: data.vertical ?? "general",
    ownerName: (config["owner_name"] as string) ?? "בעל העסק",
    businessName: data.name ?? "העסק שלי",
    toneOfVoice:
      (salesConfig["toneOfVoice"] as string) ??
      (socialConfig["toneOfVoice"] as string) ??
      "friendly",
    whatsappBusinessNumber:
      (salesConfig["whatsappBusinessNumber"] as string) ?? null,
    emailFromName: (salesConfig["emailFromName"] as string) ?? null,
    emailSignature: (salesConfig["emailSignature"] as string) ?? null,
    availabilityLink: (salesConfig["availabilityLink"] as string) ?? null,
    servicesPricingDisclose:
      (salesConfig["servicesPricingDisclose"] as boolean) ?? false,
    followUpAggressiveness:
      (salesConfig["followUpAggressiveness"] as
        | "gentle"
        | "standard"
        | "persistent") ?? "standard",
  };
}

// ─────────────────────────────────────────────────────────────
// Stuck leads query (stuck-lead workflow only)
// ─────────────────────────────────────────────────────────────

interface StuckLead {
  id: string;
  source: string;
  source_handle: string | null;
  display_name: string | null;
  raw_message: string;
  bucket: string;
  reason: string | null;
  received_at: string;
  daysSinceReceived: number;
}

async function loadStuckLeads(tenantId: string): Promise<StuckLead[]> {
  const db = createAdminClient();
  const threeDaysAgo = new Date(
    Date.now() - 3 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await db
    .from("hot_leads")
    .select(
      "id, source, source_handle, display_name, raw_message, bucket, reason, received_at"
    )
    .eq("tenant_id", tenantId)
    .in("bucket", ["warm", "hot", "burning"])
    .eq("status", "classified")
    .lte("received_at", threeDaysAgo)
    .order("received_at", { ascending: true })
    .limit(20); // hard cap to keep token usage predictable

  if (error) {
    console.error("[sales_agent] Failed to query stuck leads:", error);
    return [];
  }

  return (data ?? []).map((l) => ({
    ...l,
    daysSinceReceived: Math.floor(
      (Date.now() - new Date(l.received_at).getTime()) / (24 * 60 * 60 * 1000)
    ),
  }));
}

// ─────────────────────────────────────────────────────────────
// Deduplicate leads — keep the most recent per duplicate group
// ─────────────────────────────────────────────────────────────

/**
 * Remove duplicate leads by:
 *   1. Normalized source_handle (phone/email/handle stripped of whitespace, lowercased)
 *   2. Same display_name + same source platform (catches same person via 2 channels)
 *
 * Within a duplicate group, keep the lead with the most recent received_at.
 * This is a runtime-only dedup — does not modify the DB.
 *
 * Returns { kept, skipped } so caller can report what was filtered.
 */
function deduplicateLeads(leads: StuckLead[]): {
  kept: StuckLead[];
  skipped: number;
} {
  if (leads.length <= 1) return { kept: leads, skipped: 0 };

  // Sort newest-first so the first lead per group is the one we keep
  const sorted = [...leads].sort(
    (a, b) =>
      new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
  );

  const seenHandles = new Set<string>();
  const seenNameSource = new Set<string>();
  const kept: StuckLead[] = [];

  for (const lead of sorted) {
    // Normalize source_handle (phones, emails, IG handles)
    const handleNorm = lead.source_handle
      ? lead.source_handle.replace(/[\s\-+()]/g, "").toLowerCase()
      : null;

    // Normalize display_name + source as compound key
    const nameSourceNorm =
      lead.display_name && lead.source
        ? `${lead.display_name.trim().toLowerCase()}|${lead.source}`
        : null;

    // Skip if either signature was already seen
    if (handleNorm && seenHandles.has(handleNorm)) continue;
    if (nameSourceNorm && seenNameSource.has(nameSourceNorm)) continue;

    // Otherwise keep and remember
    if (handleNorm) seenHandles.add(handleNorm);
    if (nameSourceNorm) seenNameSource.add(nameSourceNorm);
    kept.push(lead);
  }

  // Re-sort kept leads oldest-first (stuck longest = highest priority for prompt)
  kept.sort(
    (a, b) =>
      new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
  );

  return { kept, skipped: leads.length - kept.length };
}

// ─────────────────────────────────────────────────────────────
// Filter out leads with already-pending sales drafts
// ─────────────────────────────────────────────────────────────

async function filterAlreadyDraftedLeads(
  tenantId: string,
  leadIds: string[]
): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set();

  const db = createAdminClient();
  const { data, error } = await db
    .from("drafts")
    .select("context")
    .eq("tenant_id", tenantId)
    .eq("agent_id", "sales")
    .eq("status", "pending");

  if (error || !data) return new Set();

  const draftedLeadIds = new Set<string>();
  for (const draft of data) {
    const ctx = draft.context as Record<string, unknown> | null;
    const lid = ctx?.["lead_id"] as string | undefined;
    if (lid) draftedLeadIds.add(lid);
  }

  return draftedLeadIds;
}

// ─────────────────────────────────────────────────────────────
// Build whatsapp URL helper (shared)
// ─────────────────────────────────────────────────────────────

function buildWhatsappUrl(
  phoneRaw: string | null,
  message: string
): string | null {
  if (!phoneRaw) return null;
  const digits = phoneRaw.replace(/\D/g, "");
  if (digits.length < 9) return null;
  let normalized = digits;
  if (normalized.startsWith("0")) {
    normalized = "972" + normalized.substring(1);
  } else if (!normalized.startsWith("972")) {
    normalized = "972" + normalized;
  }
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

// ═════════════════════════════════════════════════════════════
// Main run function — STUCK LEADS workflow (existing, unchanged)
// ═════════════════════════════════════════════════════════════

export async function runSalesAgent(
  tenantId: string,
  triggerSource:
    | "manual"
    | "scheduled"
    | "webhook"
    | "admin_manual" = "manual"
): Promise<SalesRunResult> {
  // ─── Load tenant + leads ────────────────────────────────────
  const [tenant, stuckLeadsRaw] = await Promise.all([
    loadTenantContext(tenantId),
    loadStuckLeads(tenantId),
  ]);

  // ─── Deduplicate ─────────────────────────────────────────────
  const { kept: stuckLeads, skipped: duplicatesSkipped } =
    deduplicateLeads(stuckLeadsRaw);

  if (duplicatesSkipped > 0) {
    console.log(
      `[sales_agent] Skipped ${duplicatesSkipped} duplicate leads. ` +
        `Processing ${stuckLeads.length} unique leads.`
    );
  }

  // ─── Filter out already-drafted leads ───────────────────────
  const alreadyDrafted = await filterAlreadyDraftedLeads(
    tenantId,
    stuckLeads.map((l) => l.id)
  );
  const leadsToProcess = stuckLeads.filter((l) => !alreadyDrafted.has(l.id));

  // ─── No-op short circuit ────────────────────────────────────
  if (leadsToProcess.length === 0) {
    let reason: string;
    if (stuckLeadsRaw.length === 0) {
      reason = "אין לידים תקועים מעל 3 ימים.";
    } else if (stuckLeads.length === 0) {
      reason = `נמצאו ${duplicatesSkipped} לידים כפולים — מומלץ לאחד אותם.`;
    } else {
      reason = "כל הלידים התקועים כבר יש להם follow-up בהמתנה.";
    }

    const runResult = await runAgent<SalesAgentOutput>(
      { tenantId, agentId: "sales", triggerSource, model: MODEL },
      undefined,
      async () => ({
        output: {
          followUps: [],
          summary: reason,
          noOpReason: reason,
        },
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        status: "no_op" as const,
      })
    );

    return {
      ...runResult,
      draftIds: [],
      stuckLeadsCount: stuckLeadsRaw.length,
      duplicatesSkipped,
    };
  }

  // ─── Build prompt context ───────────────────────────────────
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const promptContext: SalesPromptContext = {
    businessName: tenant.businessName,
    ownerName: tenant.ownerName,
    vertical: tenant.vertical,
    toneOfVoice: tenant.toneOfVoice,
    whatsappBusinessNumber: tenant.whatsappBusinessNumber,
    emailFromName: tenant.emailFromName,
    emailSignature: tenant.emailSignature,
    availabilityLink: tenant.availabilityLink,
    servicesPricingDisclose: tenant.servicesPricingDisclose,
    followUpAggressiveness: tenant.followUpAggressiveness,
    todayDateIso: today,
  };

  // ─── Build leads block for the prompt ───────────────────────
  const leadsBlock = leadsToProcess
    .map(
      (l) =>
        `<LEAD id="${l.id}" source="${l.source}" bucket="${l.bucket}" days_since_received="${l.daysSinceReceived}">
שם: ${l.display_name ?? "—"}
ערוץ פנייה: ${l.source}
זיהוי: ${l.source_handle ?? "—"}
ההודעה המקורית: ${l.raw_message}
סיווג קודם: ${l.reason ?? "—"}
</LEAD>`
    )
    .join("\n\n");

  // ─── Build system blocks (cached + gender-locked) ───────────
  const systemBlocks = withGenderLock(
    SALES_AGENT_SYSTEM_PROMPT,
    tenant.gender
  );

  // ─── Define the executor ────────────────────────────────────
  const executor = async () => {
    // Wrap the Anthropic call in withRetry: 3 attempts, 1s/2s/4s exponential
    // backoff with jitter. Retries on transient errors (5xx, 429, network);
    // throws immediately on terminal errors (400, 401, 422). Total max wall
    // time when all 3 attempts fail: ~7s. Successful first-try is zero
    // overhead. See src/lib/with-retry.ts for details.
    const response = await withRetry(
      () =>
        anthropic.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system: systemBlocks,
          messages: [
            {
              role: "user",
              content: buildSalesUserMessage(promptContext, leadsBlock),
            },
          ],
          thinking: { type: "enabled", budget_tokens: 2048 },
          output_config: {
            format: {
              type: "json_schema",
              schema: SALES_AGENT_OUTPUT_SCHEMA,
            },
          },
        }),
      {
        onRetry: ({ attempt, nextDelayMs, error }) => {
          console.warn(
            `[sales_agent] LLM attempt ${attempt} failed; retrying in ${Math.round(nextDelayMs)}ms`,
            { error: error instanceof Error ? error.message : String(error) }
          );
        },
      }
    );

    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const parsed = JSON.parse(text) as SalesAgentOutput;

    return {
      output: parsed,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_input_tokens:
          (response.usage as { cache_read_input_tokens?: number })
            .cache_read_input_tokens ?? 0,
        cache_creation_input_tokens:
          (response.usage as { cache_creation_input_tokens?: number })
            .cache_creation_input_tokens ?? 0,
      },
      status:
        parsed.followUps.length === 0
          ? ("no_op" as const)
          : ("succeeded" as const),
    };
  };

  // ─── Run the agent ──────────────────────────────────────────
  const runResult = await runAgent<SalesAgentOutput>(
    { tenantId, agentId: "sales", triggerSource, model: MODEL },
    undefined,
    executor
  );

  if (runResult.status === "failed" || !runResult.output) {
    return {
      ...runResult,
      draftIds: [],
      stuckLeadsCount: stuckLeadsRaw.length,
      duplicatesSkipped,
    };
  }

  // ─── Persist each follow-up as a draft ──────────────────────
  const db = createAdminClient();
  const draftIds: string[] = [];
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  for (const fu of runResult.output.followUps) {
    const sourceLead = leadsToProcess.find((l) => l.id === fu.leadId);
    let whatsappUrl: string | null = null;
    if (fu.channel === "whatsapp" && sourceLead) {
      whatsappUrl = buildWhatsappUrl(
        sourceLead.source_handle,
        fu.messageHebrew
      );
    }

    const draftRow = {
      tenant_id: tenantId,
      agent_run_id: runResult.runId,
      agent_id: "sales",
      type: "sales_followup",
      content: {
        leadId: fu.leadId,
        leadDisplayName: fu.leadDisplayName,
        stuckReasonInferred: fu.stuckReasonInferred,
        channel: fu.channel,
        subjectLineHebrew: fu.subjectLineHebrew,
        messageHebrew: fu.messageHebrew,
        messageTone: fu.messageTone,
        whatsappUrl,
        recommendedSendWindowLocal: fu.recommendedSendWindowLocal,
        expectedResponseProbability: fu.expectedResponseProbability,
        rationaleShort: fu.rationaleShort,
      },
      status: "pending",
      action_type: "requires_approval",
      context: {
        trigger: triggerSource,
        lead_id: fu.leadId,
        days_since_received: sourceLead?.daysSinceReceived ?? null,
        original_bucket: sourceLead?.bucket ?? null,
      },
      external_target: {
        platform: fu.channel,
        lead_id: fu.leadId,
      },
      expires_at: expiresAt,
      defamation_risk: "low" as const,
      defamation_flagged_phrases: [] as string[],
      contains_pii: !!sourceLead?.source_handle,
      pii_scrubbed: false,
      recipient_label: fu.leadDisplayName,
    };

    const { data: insertedDraft, error: insertError } = await db
      .from("drafts")
      .insert(draftRow)
      .select("id")
      .single();

    if (insertError) {
      console.error(
        `[sales_agent] Failed to persist draft for lead ${fu.leadId}:`,
        insertError
      );
      continue;
    }

    draftIds.push(insertedDraft.id);
  }

  return {
    ...runResult,
    draftIds,
    stuckLeadsCount: stuckLeadsRaw.length,
    duplicatesSkipped,
  };
}

// ═════════════════════════════════════════════════════════════
// Quick Response — FRESH HOT LEADS workflow (Sub-stage 1.3.5, NEW)
// ═════════════════════════════════════════════════════════════

export interface SalesQuickResponseResult {
  runId: string;
  draftId: string | null;
  status: "succeeded" | "no_op" | "failed" | "skipped_duplicate" | "skipped_no_message";
}

/**
 * Generate a single short Hebrew first-response WhatsApp draft for a freshly
 * classified hot/burning lead. Triggered by Hot Leads cascade after webhook.
 *
 * Idempotency: a sales_quick_response draft already keyed to this event_id
 * causes early-return (skipped_duplicate) without an LLM call.
 *
 * The function is webhook-trigger-shaped: takes (tenantId, eventId), loads
 * everything else from DB itself. Owner approves via /dashboard/approvals.
 */
export async function runSalesQuickResponseOnEvent(
  tenantId: string,
  eventId: string
): Promise<SalesQuickResponseResult> {
  const db = createAdminClient();

  // ─── Idempotency check ──────────────────────────────────────
  // If a draft for this event already exists, return early — don't pay for
  // a duplicate LLM call.
  const { data: existingDrafts } = await db
    .from("drafts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("agent_id", "sales")
    .eq("type", "sales_quick_response")
    .filter("context->>event_id", "eq", eventId)
    .limit(1);

  if (existingDrafts && existingDrafts.length > 0) {
    console.log(
      `[sales_quick_response] Draft already exists for event ${eventId}, skipping`
    );
    return {
      runId: "",
      draftId: existingDrafts[0].id,
      status: "skipped_duplicate",
    };
  }

  // ─── Load event ─────────────────────────────────────────────
  const { data: event, error: eventErr } = await db
    .from("events")
    .select("id, tenant_id, payload, received_at")
    .eq("id", eventId)
    .single();

  if (eventErr || !event) {
    throw new Error(`Event ${eventId} not found: ${eventErr?.message}`);
  }

  if (event.tenant_id !== tenantId) {
    throw new Error(
      `Event ${eventId} belongs to tenant ${event.tenant_id}, not ${tenantId}`
    );
  }

  // ─── Extract message details from payload ───────────────────
  const payload = event.payload as Record<string, unknown> | null;
  const displayName = (payload?.["contact_name"] as string) ?? "";
  const rawMessage = (payload?.["raw_message"] as string) ?? "";
  const sourceHandle = (payload?.["contact_phone"] as string) ?? "";

  if (!rawMessage) {
    console.warn(
      `[sales_quick_response] Event ${eventId} has no raw_message, skipping`
    );
    return { runId: "", draftId: null, status: "skipped_no_message" };
  }

  // ─── Load tenant ────────────────────────────────────────────
  const tenant = await loadTenantContext(tenantId);

  // ─── Build prompt context ───────────────────────────────────
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const promptContext: SalesQuickResponsePromptContext = {
    businessName: tenant.businessName,
    ownerName: tenant.ownerName,
    vertical: tenant.vertical,
    toneOfVoice: tenant.toneOfVoice,
    whatsappBusinessNumber: tenant.whatsappBusinessNumber,
    availabilityLink: tenant.availabilityLink,
    servicesPricingDisclose: tenant.servicesPricingDisclose,
    followUpAggressiveness: tenant.followUpAggressiveness,
    todayDateIso: today,
  };

  // ─── Build single-lead block ────────────────────────────────
  const leadBlock = `<LEAD source="whatsapp" event_id="${eventId}">
שם: ${displayName || "לא ידוע"}
ערוץ: WhatsApp
ההודעה: ${rawMessage}
</LEAD>`;

  // ─── Build system blocks (gender-locked) ────────────────────
  const systemBlocks = withGenderLock(
    SALES_QUICK_RESPONSE_SYSTEM_PROMPT,
    tenant.gender
  );

  // ─── Define executor ────────────────────────────────────────
  const executor = async () => {
    const response = await withRetry(
      () =>
        anthropic.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: systemBlocks,
          messages: [
            {
              role: "user",
              content: buildSalesQuickResponseUserMessage(
                promptContext,
                leadBlock
              ),
            },
          ],
          output_config: {
            format: {
              type: "json_schema",
              schema: SALES_QUICK_RESPONSE_OUTPUT_SCHEMA,
            },
          },
        }),
      {
        onRetry: ({ attempt, nextDelayMs, error }) => {
          console.warn(
            `[sales_quick_response] LLM attempt ${attempt} failed; retrying in ${Math.round(nextDelayMs)}ms`,
            { error: error instanceof Error ? error.message : String(error) }
          );
        },
      }
    );

    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const parsed = JSON.parse(text) as SalesQuickResponseOutput;

    return {
      output: parsed,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_input_tokens:
          (response.usage as { cache_read_input_tokens?: number })
            .cache_read_input_tokens ?? 0,
        cache_creation_input_tokens:
          (response.usage as { cache_creation_input_tokens?: number })
            .cache_creation_input_tokens ?? 0,
      },
      status:
        parsed.message_text.length > 0
          ? ("succeeded" as const)
          : ("no_op" as const),
    };
  };

  // ─── Run the agent ──────────────────────────────────────────
  const runResult = await runAgent<SalesQuickResponseOutput>(
    {
      tenantId,
      agentId: "sales",
      triggerSource: "webhook",
      model: MODEL,
    },
    undefined,
    executor
  );

  if (runResult.status === "failed" || !runResult.output) {
    return { runId: runResult.runId, draftId: null, status: "failed" };
  }

  if (!runResult.output.message_text) {
    return { runId: runResult.runId, draftId: null, status: "no_op" };
  }

  // ─── Build whatsapp URL ─────────────────────────────────────
  const whatsappUrl = buildWhatsappUrl(
    sourceHandle,
    runResult.output.message_text
  );

  // ─── Persist as draft ───────────────────────────────────────
  // Distinct type='sales_quick_response' so approvals UI / cleanup can
  // distinguish from the stuck-lead Sales drafts (type='sales_followup').
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const draftRow = {
    tenant_id: tenantId,
    agent_run_id: runResult.runId,
    agent_id: "sales",
    type: "sales_quick_response",
    content: {
      messageHebrew: runResult.output.message_text,
      whatsappUrl,
      expectedResponseProbability:
        runResult.output.expected_response_probability,
      leadDisplayName: displayName,
      eventId,
    },
    status: "pending",
    action_type: "requires_approval",
    context: {
      trigger: "webhook",
      event_id: eventId,
      lead_display_name: displayName,
    },
    external_target: {
      platform: "whatsapp",
      event_id: eventId,
    },
    expires_at: expiresAt,
    defamation_risk: "low" as const,
    defamation_flagged_phrases: [] as string[],
    contains_pii: !!sourceHandle,
    pii_scrubbed: false,
    recipient_label: displayName || "לקוח",
  };

  const { data: insertedDraft, error: insertError } = await db
    .from("drafts")
    .insert(draftRow)
    .select("id")
    .single();

  if (insertError) {
    console.error(
      `[sales_quick_response] Failed to persist draft for event ${eventId}:`,
      insertError
    );
    return { runId: runResult.runId, draftId: null, status: "failed" };
  }

  return {
    runId: runResult.runId,
    draftId: insertedDraft.id,
    status: "succeeded",
  };
}
