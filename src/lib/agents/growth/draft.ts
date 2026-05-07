// src/lib/agents/growth/draft.ts
//
// Stage 2 of the Growth Agent pipeline — Sonnet 4.6 personalized drafting.
//
// Called once per top-N scored candidate. The same system prompt and
// tenant-context block are sent on every call, so prompt caching with
// 1h ephemeral TTL gives ~50% cost reduction across the run after the
// first call writes the cache.
//
// Per-call cost (with caching, post-warmup): ~₪0.04 per draft. For 15
// drafts that's ~₪0.60 (Sonnet stage), plus ~₪0.90 (Haiku scan) =
// ~₪1.50 per run. Times 4-5 runs/month = ~₪6 base, dropping to ~₪3-4
// after caching kicks in.

import "server-only";
import { anthropic } from "@/lib/anthropic";
import { withRetry } from "@/lib/with-retry";
import { stripAiTellsDeep } from "@/lib/safety/anti-ai-strip";
import { GROWTH_DRAFT_OUTPUT_SCHEMA } from "./schemas";
import {
  SONNET_DRAFT_SYSTEM_PROMPT,
  buildSonnetDraftUserMessage,
  buildTenantContextBlock,
  type TenantContextForGrowth,
  type DraftUserMessageInput,
} from "./prompts";
import { calcSonnetCostIls } from "./_shared";

const MODEL = "claude-sonnet-4-6" as const;

// ─────────────────────────────────────────────────────────────
// Result shape
// ─────────────────────────────────────────────────────────────

export interface GrowthDraftResult {
  draftMessage: string;
  candidateSubtitle: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costIls: number;
}

// ─────────────────────────────────────────────────────────────
// runGrowthDraft
// ─────────────────────────────────────────────────────────────

export async function runGrowthDraft(
  draftInput: DraftUserMessageInput,
  tenantContext: TenantContextForGrowth
): Promise<GrowthDraftResult> {
  const tenantContextBlock = buildTenantContextBlock(tenantContext);

  const response = await withRetry(
    () =>
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 800,
        system: [
          {
            type: "text",
            text: SONNET_DRAFT_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral", ttl: "1h" },
          },
          {
            type: "text",
            text: tenantContextBlock,
            cache_control: { type: "ephemeral", ttl: "1h" },
          },
        ],
        messages: [
          {
            role: "user",
            content: buildSonnetDraftUserMessage(draftInput),
          },
        ],
        output_config: {
          format: {
            type: "json_schema",
            schema: GROWTH_DRAFT_OUTPUT_SCHEMA,
          },
        },
      }),
    { maxAttempts: 3, baseDelayMs: 1000 }
  );

  // Extract the text payload — same map-ternary pattern as scan.ts and hot_leads.
  const rawText = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  let parsed: { draft_message: string; candidate_subtitle: string };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(
      `[growth/draft] Sonnet returned invalid JSON: ${rawText.slice(0, 200)}`
    );
  }

  // Strip AI-tells from both the message and the subtitle.
  // The subtitle is shown verbatim on the dashboard card; the message
  // ships to a customer if the owner approves it. This is the strictest
  // path in the codebase and warrants the defense-in-depth strip.
  const draftMessage = stripAiTellsDeep(parsed.draft_message);
  const candidateSubtitle = stripAiTellsDeep(parsed.candidate_subtitle);

  // Pull token usage including cache-read (the metric that proves
  // prompt caching is working).
  const usage = response.usage as {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };

  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

  return {
    draftMessage,
    candidateSubtitle,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    costIls: calcSonnetCostIls(inputTokens, outputTokens, cacheReadTokens),
  };
}
