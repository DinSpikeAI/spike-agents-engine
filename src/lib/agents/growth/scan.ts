// src/lib/agents/growth/scan.ts
//
// Stage 1 of the Growth Agent pipeline — Haiku 4.5 scoring.
//
// Takes a candidate pool (internal + Meta) and returns the subset that
// passed the score threshold, with reasons and goal classifications.
//
// Cost-shaped: Haiku is ~3x cheaper than Sonnet. Scanning 200 candidates
// in a single batch is ~$0.24 ≈ ₪0.90 per run, or ₪3-4/month per tenant
// across the weekly schedule. The Sonnet draft stage is the bigger
// per-candidate cost — Haiku's job is to keep that pool small.

import "server-only";
import { anthropic } from "@/lib/anthropic";
import { withRetry } from "@/lib/with-retry";
import { stripAiTellsDeep } from "@/lib/safety/anti-ai-strip";
import { wrapUntrustedInput } from "@/lib/safety/prompt-injection-guard";
import { GROWTH_SCAN_OUTPUT_SCHEMA } from "./schemas";
import {
  HAIKU_SCAN_SYSTEM_PROMPT,
  buildHaikuScanUserMessage,
  buildTenantContextBlock,
  type TenantContextForGrowth,
} from "./prompts";
import { calcHaikuCostIls, SCORE_THRESHOLD } from "./_shared";
import type { CandidateInput, GrowthGoal } from "./types";

const MODEL = "claude-haiku-4-5" as const;

// ─────────────────────────────────────────────────────────────
// Result shape
// ─────────────────────────────────────────────────────────────

export interface ScannedCandidate {
  id: string;
  score: number;
  reason: string;
  goal: GrowthGoal;
}

export interface GrowthScanResult {
  scanned: ScannedCandidate[];
  inputTokens: number;
  outputTokens: number;
  costIls: number;
}

// ─────────────────────────────────────────────────────────────
// runGrowthScan
// ─────────────────────────────────────────────────────────────

export async function runGrowthScan(
  candidates: CandidateInput[],
  tenantContext: TenantContextForGrowth
): Promise<GrowthScanResult> {
  if (candidates.length === 0) {
    return { scanned: [], inputTokens: 0, outputTokens: 0, costIls: 0 };
  }

  // Build a compact JSON payload — only the fields Haiku needs to score.
  // We strip identifying info beyond what's necessary so the model isn't
  // making decisions based on, e.g., specific phone-number patterns.
  const candidatesPayload = candidates.map((c) => ({
    id: c.id,
    source: c.source,
    metadata: c.metadata,
  }));

  const candidatesJson = JSON.stringify(candidatesPayload);
  const wrappedInput = wrapUntrustedInput(candidatesJson);

  const tenantContextBlock = buildTenantContextBlock(tenantContext);

  const response = await withRetry(
    () =>
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: [
          {
            type: "text",
            text: HAIKU_SCAN_SYSTEM_PROMPT,
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
            content: buildHaikuScanUserMessage(wrappedInput),
          },
        ],
        output_config: {
          format: {
            type: "json_schema",
            schema: GROWTH_SCAN_OUTPUT_SCHEMA,
          },
        },
      }),
    { maxAttempts: 3, baseDelayMs: 1000 }
  );

  // Extract the text payload — structured outputs return JSON in a text block.
  // Same map-ternary pattern as hot_leads/run.ts to keep TS narrowing clean.
  const rawText = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  let parsed: { scored: ScannedCandidate[] };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(
      `[growth/scan] Haiku returned invalid JSON: ${rawText.slice(0, 200)}`
    );
  }

  // Defensive validation:
  //   - filter out anything below threshold (model should already do this)
  //   - clamp score to 1-100 (model returns integer per schema)
  //   - strip AI-tells from reason text (defense in depth)
  const scanned: ScannedCandidate[] = (parsed.scored ?? [])
    .filter(
      (s) =>
        typeof s.score === "number" &&
        s.score >= SCORE_THRESHOLD &&
        s.score <= 100 &&
        s.id &&
        s.reason &&
        (s.goal === "reactivation" || s.goal === "lead_discovery")
    )
    .map((s) => ({
      id: s.id,
      score: Math.min(100, Math.max(1, Math.round(s.score))),
      reason: stripAiTellsDeep(s.reason),
      goal: s.goal,
    }))
    // Sort defensively in case the model didn't
    .sort((a, b) => b.score - a.score);

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  return {
    scanned,
    inputTokens,
    outputTokens,
    costIls: calcHaikuCostIls(inputTokens, outputTokens),
  };
}
