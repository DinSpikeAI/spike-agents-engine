// src/lib/anthropic-pricing.ts
//
// Cost calculation for Anthropic API responses.
// Pricing verified April 2026 from https://www.anthropic.com/pricing
//
// USD pricing per million tokens. We always specify ttl: "1h" explicitly
// per project policy (gotcha #6), so cache_create defaults to the 1h rate.

import "server-only";
import type { AgentModel } from "./agents/types";

interface ModelPricing {
  input: number;
  output: number;
  cache_read: number;
  cache_create_5m: number;
  cache_create_1h: number;
}

// USD per 1,000,000 tokens
const PRICING_PER_MILLION_USD: Record<AgentModel, ModelPricing> = {
  "claude-haiku-4-5": {
    input: 1.0,
    output: 5.0,
    cache_read: 0.10,
    cache_create_5m: 1.25,
    cache_create_1h: 2.0,
  },
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cache_read: 0.30,
    cache_create_5m: 3.75,
    cache_create_1h: 6.0,
  },
  "claude-opus-4-7": {
    input: 5.0,
    output: 25.0,
    cache_read: 0.50,
    cache_create_5m: 6.25,
    cache_create_1h: 10.0,
  },
};

// Approximate USD->ILS rate. Update quarterly. Slightly conservative
// (overestimates ILS cost) so dashboard never under-reports spend.
const USD_TO_ILS = 3.7;

export interface AnthropicUsageForCost {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/**
 * Calculate cost in ILS for a single Anthropic call.
 *
 * Always assumes 1h cache TTL. If you switch to 5m caches, override the
 * cache_create_1h reference below.
 */
export function calculateCostIls(
  model: AgentModel,
  usage: AnthropicUsageForCost,
): number {
  const p = PRICING_PER_MILLION_USD[model];
  if (!p) {
    console.warn(`[pricing] Unknown model "${model}", falling back to Haiku 4.5 rates`);
    return calculateCostIls("claude-haiku-4-5", usage);
  }

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheCreateTokens = usage.cache_creation_input_tokens ?? 0;

  const usd =
    (inputTokens / 1_000_000) * p.input +
    (outputTokens / 1_000_000) * p.output +
    (cacheReadTokens / 1_000_000) * p.cache_read +
    (cacheCreateTokens / 1_000_000) * p.cache_create_1h;

  return usd * USD_TO_ILS;
}

/**
 * Estimate cost in ILS BEFORE making the call (for reserve_spend later).
 *
 * Heuristic: assumes ~1500 tokens system prompt (cached read after first call),
 * ~500 tokens user input, ~800 tokens output. Rough but defensive.
 */
export function estimateCostIls(model: AgentModel): number {
  return calculateCostIls(model, {
    input_tokens: 500,
    output_tokens: 800,
    cache_read_input_tokens: 1500,
    cache_creation_input_tokens: 0,
  });
}
