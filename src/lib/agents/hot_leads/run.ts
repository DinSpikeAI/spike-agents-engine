/**
 * Hot Leads Agent — Day 9 + Sub-stage 1.3 (event-triggered + LLM retry)
 *
 * Pipeline (batch / manual):
 *   1. Receive list of mock leads (with raw_message + display_name + source_handle)
 *   2. Extract behavior features in CODE (not LLM):
 *      - response_time_minutes, message_length_tokens
 *      - intent_keywords_count (matched against Hebrew lexicon)
 *      - urgency_signals_count (matched against Hebrew lexicon)
 *      - has_specific_product (heuristic)
 *      - mentioned_budget (heuristic)
 *      - questionCount (counts ?)
 *   3. PII-scrub the raw message (defensive — names should be in the
 *      display_name field, not the message text, but customers sometimes
 *      include their own number/email)
 *   4. Wrap message + features in <LEAD> tags. NO name. NO handle.
 *   5. Send to Haiku 4.5 with bucketed enum schema
 *      — wrapped in withRetry: 3 attempts, 1s/2s/4s exponential backoff
 *   6. Persist each classification to hot_leads table:
 *      - display_name + source_handle from input (owner UI display)
 *      - bucket from LLM
 *      - score_features from code (bias audit data)
 *      - reason + suggestedAction from LLM
 *      - event_id (if provided via eventIdByLeadId map) for idempotency
 *
 * Sub-stage 1.3 — runHotLeadsOnEvent(tenantId, eventId):
 *   Single-event entry point used by the WhatsApp webhook. Loads the event,
 *   builds a MockLead from its payload, and calls runHotLeadsAgent with that
 *   single lead and an event_id mapping for idempotency. Pre-flight check
 *   skips the LLM call entirely if the event was already classified.
 */

import { runAgent } from "../run-agent";
import { anthropic } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { withRetry } from "@/lib/with-retry";
import { HOT_LEADS_OUTPUT_SCHEMA } from "./schema";
import { HOT_LEADS_SYSTEM_PROMPT, buildHotLeadsUserMessage } from "./prompt";
import { scrubPii } from "@/lib/safety/pii-scrubber";
import { wrapUntrustedInput } from "@/lib/safety/prompt-injection-guard";
import type {
  HotLeadsAgentOutput,
  MockLead,
  LeadFeatures,
  RunResult,
} from "../types";

const MODEL = "claude-haiku-4-5" as const;

export interface HotLeadsRunResult extends RunResult<HotLeadsAgentOutput> {
  leadIds: string[];
}

/** Result type for runHotLeadsOnEvent — distinguishes idempotent skip from a real run. */
export interface HotLeadsOnEventResult {
  /** True if the event was already classified and we returned without running. */
  skipped: boolean;
  /** Reason for skipping (idempotency, missing data, etc.) — null when ran normally. */
  skipReason: string | null;
  /** The hot_leads row id when ran/found; null on hard failure. */
  leadId: string | null;
  /** The runAgent result (null if we skipped before running). */
  runResult: RunResult<HotLeadsAgentOutput> | null;
}

// ─────────────────────────────────────────────────────────────
// Feature extraction (CODE — not LLM)
// ─────────────────────────────────────────────────────────────

const HEBREW_INTENT_KEYWORDS = [
  "מעוניין", "מעוניינת", "רוצה", "צריך", "צריכה", "קונה", "קונה את",
  "אקנה", "אזמין", "להזמין", "לקנות", "להשיג", "כמה עולה", "מחיר",
  "זמין", "במלאי", "בעלות",
];

const HEBREW_URGENCY_SIGNALS = [
  "דחוף", "היום", "עכשיו", "מהר", "עד מחר", "השבוע", "בהקדם",
  "מיידי", "immediately", "asap", "now", "today",
];

// Common Hebrew product-pattern indicators (heuristic, not exhaustive)
const PRODUCT_PATTERNS = [
  /דגם\s+\S+/,           // "דגם XYZ"
  /מק"ט\s*\S+/,          // "מק'ט 1234"
  /#[A-Z0-9-]{2,}/,      // "#PT-204"
  /\d+\s*ק[״"']ג/,       // "5 ק'ג"
  /\d+\s*מ"ל|מ״ל|מ'ל/,   // "500 מ'ל"
];

// Budget mentions — currency symbols, "תקציב", common price phrasings
const BUDGET_PATTERNS = [
  /₪\s*\d+|\d+\s*₪/,
  /\d{2,}\s*שקל/,
  /\d{2,}\s*ש"ח|ש״ח|ש'ח/,
  /תקציב/,
  /\$\s*\d+/,
];

function countMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const kw of keywords) {
    const re = new RegExp(`(?:^|\\s|[,.!?])${kw}(?:$|\\s|[,.!?])`, "gi");
    const matches = lower.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

function hasAnyPattern(text: string, patterns: RegExp[]): boolean {
  for (const re of patterns) {
    if (re.test(text)) return true;
  }
  return false;
}

function extractFeatures(lead: MockLead, scrubbedMessage: string): LeadFeatures {
  // Token-ish length: count words separated by whitespace + punctuation.
  // Approximation good enough for bucket signal.
  const messageLengthTokens = scrubbedMessage
    .split(/[\s,;.!?]+/)
    .filter((t) => t.length > 0).length;

  // Response time: for mocks, derive from receivedAt (assume "first contact"
  // is the receivedAt itself for inbound — so this is 0 for new contact).
  // Real implementation in Day 11 will use customer history.
  const ageMinutes = Math.floor(
    (Date.now() - new Date(lead.receivedAt).getTime()) / (60 * 1000)
  );
  const responseTimeMinutes = ageMinutes;

  return {
    source: lead.source,
    responseTimeMinutes,
    messageLengthTokens,
    intentKeywordsCount: countMatches(scrubbedMessage, HEBREW_INTENT_KEYWORDS),
    urgencySignalsCount: countMatches(scrubbedMessage, HEBREW_URGENCY_SIGNALS),
    hasSpecificProduct: hasAnyPattern(scrubbedMessage, PRODUCT_PATTERNS),
    mentionedBudget: hasAnyPattern(scrubbedMessage, BUDGET_PATTERNS),
    questionCount: (scrubbedMessage.match(/[?؟]/g) ?? []).length,
  };
}

// ─────────────────────────────────────────────────────────────
// Main agent function (batch / manual / seeds)
// ─────────────────────────────────────────────────────────────

/**
 * Run Hot Leads classification on a batch of leads.
 *
 * @param tenantId
 * @param leads             — leads to classify
 * @param triggerSource     — used for telemetry in agent_runs
 * @param eventIdByLeadId   — OPTIONAL map from MockLead.id → event_id. When
 *                            present, the event_id is written into hot_leads
 *                            for idempotency. Manual / seed callers omit this.
 */
export async function runHotLeadsAgent(
  tenantId: string,
  leads: MockLead[],
  triggerSource: "manual" | "scheduled" | "webhook" | "admin_manual" = "manual",
  eventIdByLeadId?: Record<string, string>,
): Promise<HotLeadsRunResult> {
  // ─── Pre-flight: extract features per lead ───────────────
  // The features object is what the LLM sees. The display_name and
  // source_handle are kept aside for the leads table only.
  const enrichedLeads = leads.map((lead) => {
    const scrub = scrubPii(lead.rawMessage);
    const features = extractFeatures(lead, scrub.scrubbed);
    return {
      lead,
      scrub,
      features,
    };
  });

  // ─── Build the wrapped block for the prompt ──────────────
  // For each lead: <LEAD id="..." source="..."> + features + message
  // NO display_name. NO source_handle.
  const wrappedBlock = enrichedLeads
    .map(({ lead, scrub, features }) => {
      const featuresPretty = JSON.stringify(features, null, 2);
      const wrappedMessage = wrapUntrustedInput(scrub.scrubbed);
      return `<LEAD id="${lead.id}" source="${lead.source}">
מאפייני התנהגות:
${featuresPretty}

הודעה גולמית:
${wrappedMessage}
</LEAD>`;
    })
    .join("\n\n");

  // ─── Define the executor ─────────────────────────────────
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
          max_tokens: 1024,
          system: [
            {
              type: "text",
              text: HOT_LEADS_SYSTEM_PROMPT,
              cache_control: { type: "ephemeral", ttl: "1h" },
            },
          ],
          messages: [
            {
              role: "user",
              content: buildHotLeadsUserMessage(wrappedBlock),
            },
          ],
          output_config: {
            format: {
              type: "json_schema",
              schema: HOT_LEADS_OUTPUT_SCHEMA,
            },
          },
        }),
      {
        onRetry: ({ attempt, nextDelayMs, error }) => {
          console.warn(
            `[hot_leads] LLM attempt ${attempt} failed; retrying in ${Math.round(nextDelayMs)}ms`,
            { error: error instanceof Error ? error.message : String(error) }
          );
        },
      }
    );

    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const parsed = JSON.parse(text) as HotLeadsAgentOutput;

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
    };
  };

  // ─── Run the agent ───────────────────────────────────────
  const runResult = await runAgent<HotLeadsAgentOutput>(
    { tenantId, agentId: "hot_leads", triggerSource, model: MODEL },
    undefined,
    executor
  );

  if (runResult.status === "failed" || !runResult.output) {
    return {
      ...runResult,
      leadIds: [],
    };
  }

  // ─── Persist each classification to the leads table ──────
  const db = createAdminClient();
  const leadIds: string[] = [];

  for (const classification of runResult.output.classifications) {
    const enriched = enrichedLeads.find(
      (e) => e.lead.id === classification.leadId
    );
    if (!enriched) continue;

    const { lead, features } = enriched;

    // event_id is included only when caller provided a mapping for this lead.
    // Existing callers (manual, seed, demo) don't pass eventIdByLeadId →
    // event_id stays absent → DB column gets NULL → partial UNIQUE index
    // doesn't constrain → backward-compatible.
    const mappedEventId = eventIdByLeadId?.[lead.id];

    const leadRow: Record<string, unknown> = {
      tenant_id: tenantId,
      agent_run_id: runResult.runId,
      source: lead.source,
      source_handle: lead.sourceHandle,
      display_name: lead.displayName,
      raw_message: lead.rawMessage,
      received_at: lead.receivedAt,
      score_features: features as unknown as Record<string, unknown>,
      bucket: classification.bucket,
      reason: classification.reason,
      suggested_action: classification.suggestedAction,
      status: "classified",
    };
    if (mappedEventId) {
      leadRow.event_id = mappedEventId;
    }

    const { data: insertedLead, error: insertError } = await db
      .from("hot_leads")
      .insert(leadRow)
      .select("id")
      .single();

    if (insertError) {
      // 23505 = duplicate event_id (idempotency win — another concurrent
      // call beat us, or this is a retry). Not a real error; log and move on.
      if (insertError.code === "23505") {
        console.log(
          `[hot_leads] Skipped duplicate insert for lead ${classification.leadId} (event_id=${mappedEventId ?? "unknown"})`
        );
        continue;
      }
      console.error(
        `[hot_leads] Failed to persist lead ${classification.leadId}:`,
        insertError
      );
      continue;
    }

    leadIds.push(insertedLead.id);
  }

  return {
    ...runResult,
    leadIds,
  };
}

// ─────────────────────────────────────────────────────────────
// Sub-stage 1.3 — Single-event entry point (used by webhook)
// ─────────────────────────────────────────────────────────────

/**
 * Run Hot Leads classification on a single event by id.
 *
 * Loads the event from public.events, converts its payload into a MockLead,
 * checks idempotency (skip if a hot_leads row with this event_id already
 * exists for this tenant), and delegates to runHotLeadsAgent.
 *
 * Used by:
 *   - WhatsApp webhook handler (fire-and-forget via waitUntil)
 *   - Demo UI (Sub-stage 1.4 — the same code path)
 *   - Manual re-classification trigger from owner dashboard (future)
 *
 * Returns a structured result that distinguishes skip-due-to-idempotency
 * from skip-due-to-missing-data from a real successful run. The caller
 * (webhook) typically logs and moves on; nothing here throws unless the
 * event id was given but truly cannot be loaded (DB read error).
 */
export async function runHotLeadsOnEvent(
  tenantId: string,
  eventId: string,
): Promise<HotLeadsOnEventResult> {
  const db = createAdminClient();

  // ─── Pre-flight idempotency check ────────────────────────
  // If a hot_leads row already exists for this (tenant_id, event_id), we
  // return immediately. This protects against:
  //   - the cron safety net (Sub-stage 1.5+) re-triggering events the
  //     webhook already processed
  //   - manual re-fires from dashboards
  //   - waitUntil restarts on Vercel
  //
  // There's a TOCTOU race: a parallel call might pass this check at the
  // same time and both proceed. The UNIQUE partial index in migration 020
  // catches the race at INSERT time (23505 error → caught in
  // runHotLeadsAgent). Worst-case cost of the race is one wasted LLM call.
  const { data: existing, error: existingErr } = await db
    .from("hot_leads")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingErr) {
    console.error(
      `[hot_leads-trigger] Idempotency lookup failed for event ${eventId}:`,
      existingErr
    );
    // Fall through and let runHotLeadsAgent handle it — better to risk
    // a duplicate (caught by UNIQUE) than to skip a real classification.
  } else if (existing?.id) {
    return {
      skipped: true,
      skipReason: "already_classified",
      leadId: existing.id,
      runResult: null,
    };
  }

  // ─── Load the event ──────────────────────────────────────
  const { data: event, error: eventErr } = await db
    .from("events")
    .select("id, tenant_id, provider, event_type, payload, received_at")
    .eq("id", eventId)
    .eq("tenant_id", tenantId)
    .single();

  if (eventErr || !event) {
    throw new Error(
      `Event ${eventId} not found for tenant ${tenantId}: ${eventErr?.message ?? "no rows"}`
    );
  }

  // ─── Build MockLead from event payload ───────────────────
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const rawMessage =
    (typeof payload.raw_message === "string" ? payload.raw_message : "") ||
    (typeof payload.summary === "string" ? payload.summary : "");

  if (!rawMessage) {
    return {
      skipped: true,
      skipReason: "no_raw_message",
      leadId: null,
      runResult: null,
    };
  }

  // Source: prefer payload.source, fall back to provider, default "whatsapp".
  // The source field on MockLead is typed as LeadSource, which we narrow via
  // MockLead["source"] cast (avoids a separate import for the union type).
  const sourceRaw =
    (typeof payload.source === "string" ? payload.source : null) ??
    (typeof event.provider === "string" ? event.provider : null) ??
    "whatsapp";
  const source = sourceRaw as MockLead["source"];

  const displayName =
    (typeof payload.contact_name === "string" && payload.contact_name) ||
    "לקוח חדש";
  const sourceHandle =
    (typeof payload.contact_phone === "string" && payload.contact_phone) || "";

  const mockLead: MockLead = {
    id: event.id,
    source,
    displayName,
    sourceHandle,
    rawMessage,
    receivedAt: event.received_at,
  };

  // ─── Delegate to runHotLeadsAgent with event_id mapping ──
  // The map tells runHotLeadsAgent to populate hot_leads.event_id, which
  // (via the partial UNIQUE index) prevents duplicate rows on retries.
  const runResult = await runHotLeadsAgent(
    tenantId,
    [mockLead],
    "webhook",
    { [event.id]: event.id }
  );

  return {
    skipped: false,
    skipReason: null,
    leadId: runResult.leadIds[0] ?? null,
    runResult,
  };
}
