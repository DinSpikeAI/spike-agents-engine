// src/lib/agents/morning/schema.ts
//
// JSON Schema for Morning Agent structured output.
// Must match MorningAgentOutput in src/lib/agents/types.ts exactly.
//
// Anthropic structured outputs constraints (April 2026):
//   - No minimum/maximum/minLength on primitives
//   - No recursive schemas
//   - All fields in required array

import "server-only";

export const MORNING_AGENT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    greeting: { type: "string", description: "Warm personalized morning greeting addressing the business owner by name" },
    headline: { type: "string", description: "One sentence summarizing the key opportunity or status for today" },
    yesterdayMetrics: { type: "string", description: "Brief summary of yesterdays business metrics, or empty string if no data" },
    thingsCompleted: { type: "string", description: "2-3 recently completed items, or empty string if none" },
    thingsNeedingApproval: { type: "string", description: "1-2 urgent items requiring the owners attention today" },
    insights: { type: "string", description: "One actionable insight or recommendation based on the data" },
    todaysSchedule: { type: "string", description: "Summary of todays schedule highlighting the most important items" },
    callToAction: { type: "string", description: "One specific actionable task to accomplish today" },
  },
  required: [
    "greeting",
    "headline",
    "yesterdayMetrics",
    "thingsCompleted",
    "thingsNeedingApproval",
    "insights",
    "todaysSchedule",
    "callToAction",
  ],
} as const;

export type MorningAgentSchemaType = typeof MORNING_AGENT_OUTPUT_SCHEMA;
