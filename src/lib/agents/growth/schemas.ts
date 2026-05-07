// src/lib/agents/growth/schemas.ts
//
// JSON schemas for Anthropic structured outputs (output_config.format).
//
// CRITICAL Anthropic constraints (verified Apr 2026, see sales/schema.ts):
//   - 'integer' type does NOT support `minimum` / `maximum` keywords.
//     Range bounds must be enforced in the prompt + code post-validation.
//   - additionalProperties: false on every object.
//   - All declared properties must be listed in `required[]`.

import "server-only";

// ─────────────────────────────────────────────────────────────
// Stage 1 schema — Haiku scan output
// ─────────────────────────────────────────────────────────────
//
// Returns an array of scored candidates that passed the threshold.
// Range constraints (1-100, threshold >= 50) are enforced in the prompt
// AND validated in scan.ts before persisting.

export const GROWTH_SCAN_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    scored: {
      type: "array",
      description:
        "Candidates that scored 50 or above. Sorted by score descending. Empty array is valid (no opportunities this run).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: {
            type: "string",
            description:
              "Candidate ID — echo verbatim from input. For internal sources this is a phone; for Meta sources it is a meta_inbox_messages.id (UUID).",
          },
          score: {
            type: "integer",
            description:
              "Priority score 1-100. Only return candidates >= 50. Higher = more urgent action.",
          },
          reason: {
            type: "string",
            description:
              "Short Hebrew sentence explaining why this candidate was selected. Max 15 words.",
          },
          goal: {
            type: "string",
            enum: ["reactivation", "lead_discovery"],
            description:
              "reactivation = lapsed customer; lead_discovery = unanswered prospect inquiry.",
          },
        },
        required: ["id", "score", "reason", "goal"],
      },
    },
  },
  required: ["scored"],
} as const;

// ─────────────────────────────────────────────────────────────
// Stage 2 schema — Sonnet draft output
// ─────────────────────────────────────────────────────────────
//
// One drafted message per call. Subtitle is the dashboard card label.

export const GROWTH_DRAFT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    draft_message: {
      type: "string",
      description:
        "The Hebrew WhatsApp/Instagram message ready for the owner to approve and send. 2-4 sentences. No em-dash, no hashtags, no AI-tells.",
    },
    candidate_subtitle: {
      type: "string",
      description:
        "Short 2-5 word Hebrew label for the dashboard card subtitle. Examples: 'VIP נעלם 90 יום', 'שאל מחיר באינסטגרם'.",
    },
  },
  required: ["draft_message", "candidate_subtitle"],
} as const;
