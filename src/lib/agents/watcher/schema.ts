// src/lib/agents/watcher/schema.ts
//
// JSON Schema for Watcher Agent structured output.
//
// IMPORTANT: severity is NOT in this schema. The LLM only classifies
// `category` — code derives severity in run.ts via CATEGORY_SEVERITY
// (see ./hierarchy.ts). This is intentional: we want policy in code,
// not in LLM output, so changes don't require re-prompting.
//
// Anthropic structured outputs constraints (April 2026):
//   - additionalProperties: false on every object
//   - All properties listed in required[]

import "server-only";
import { WATCHER_CATEGORIES } from "./hierarchy";

export const WATCHER_AGENT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    alerts: {
      type: "array",
      description:
        "List of alerts found this scan, in any order. Code will sort by severity (derived from category) then by occurredAt desc.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: {
            type: "string",
            enum: WATCHER_CATEGORIES,
            description:
              "Category of this alert. Must be one of the allowed values. Code derives severity from this.",
          },
          title: {
            type: "string",
            description:
              "Short Hebrew headline (max ~80 chars) — what happened.",
          },
          context: {
            type: "string",
            description:
              "Brief Hebrew context (max ~200 chars) — why it matters and the suggested action.",
          },
          source: {
            type: "string",
            description:
              "Hebrew label for the data source (e.g. 'Google Reviews', 'Instagram', 'CRM', 'Calendar').",
          },
          occurredAt: {
            type: "string",
            description:
              "When the event occurred. Either ISO 8601 timestamp or human-readable Hebrew like 'לפני 12 דקות'.",
          },
        },
        required: ["category", "title", "context", "source", "occurredAt"],
      },
    },
    scanSummary: {
      type: "string",
      description:
        "Brief Hebrew summary of this scan (max ~120 chars). Example: 'נסרקו Google, Instagram, יומן — נמצאו 3 התראות חדשות'.",
    },
    scannedSources: {
      type: "array",
      items: { type: "string" },
      description:
        "List of data sources that were checked, e.g. ['Google', 'Instagram', 'יומן'].",
    },
  },
  required: ["alerts", "scanSummary", "scannedSources"],
} as const;

export type WatcherAgentSchemaType = typeof WATCHER_AGENT_OUTPUT_SCHEMA;
