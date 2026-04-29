// src/lib/agents/morning/schema.ts
//
// JSON Schema for Morning Agent structured output.
// MUST stay synchronized with MorningAgentOutput in src/lib/agents/types.ts.
//
// Anthropic structured outputs constraints (April 2026):
//   - additionalProperties: false on every object
//   - All properties listed in required[]
//   - Optional values use type: ["X", "null"] tuple

import "server-only";

export const MORNING_AGENT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    greeting: {
      type: "string",
      description:
        "Warm greeting in Hebrew, always morning style ('בוקר טוב, [שם]') — this is the morning briefing agent regardless of when it runs",
    },
    headline: {
      type: "string",
      description: "One sentence summarizing the key opportunity or status for today",
    },
    yesterdayMetrics: {
      type: "object",
      additionalProperties: false,
      properties: {
        revenue: {
          type: ["number", "null"],
          description: "Yesterday's revenue in ILS, or null if no data",
        },
        revenueChangePercent: {
          type: ["number", "null"],
          description: "Percent change vs same weekday last week, or null",
        },
        sameWeekdayCompare: {
          type: ["string", "null"],
          description:
            "Short Hebrew comparison string like '▲ 12% מיום שלישי שעבר', or null",
        },
      },
      required: ["revenue", "revenueChangePercent", "sameWeekdayCompare"],
    },
    thingsCompleted: {
      type: "array",
      items: { type: "string" },
      description: "2-3 items the agents completed yesterday, Hebrew strings",
    },
    thingsNeedingApproval: {
      type: "number",
      description: "Count of items currently waiting for owner approval",
    },
    insights: {
      type: "array",
      items: { type: "string" },
      description: "1-3 actionable Hebrew insights derived from the data",
    },
    todaysSchedule: {
      type: "array",
      items: { type: "string" },
      description: "Today's schedule items, each prefixed with time (e.g. '10:00 — פגישה')",
    },
    callToAction: {
      type: "string",
      description: "One specific actionable Hebrew sentence the owner should focus on today",
    },
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
