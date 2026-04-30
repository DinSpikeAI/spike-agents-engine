/**
 * Hot Leads Agent — Day 9
 *
 * Pipeline:
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
 *   6. Persist each classification to hot_leads table:
 *      - display_name + source_handle from input (owner UI display)
 *      - bucket from LLM
 *      - score_features from code (bias audit data)
 *      - reason + suggestedAction from LLM
 */

import { runAgent } from "../run-agent";
import { anthropic } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
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
// Main agent function
// ─────────────────────────────────────────────────────────────

export async function runHotLeadsAgent(
  tenantId: string,
  leads: MockLead[],
  triggerSource: "manual" | "scheduled" | "webhook" | "admin_manual" = "manual"
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
    const response = await anthropic.messages.create({
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
    });

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

    const leadRow = {
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

    const { data: insertedLead, error: insertError } = await db
      .from("hot_leads")
      .insert(leadRow)
      .select("id")
      .single();

    if (insertError) {
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
