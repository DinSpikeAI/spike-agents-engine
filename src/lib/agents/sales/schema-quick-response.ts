// src/lib/agents/sales/schema-quick-response.ts
//
// JSON Schema for Sales Quick Response output.
//
// Generates a single short Hebrew message in response to a fresh hot lead.
// Owner reviews the draft and clicks "I sent" to mark complete.
// NEVER auto-sends.
//
// Distinct from sales/schema.ts (Sales follow-up agent) which has rich
// fields (subjectLine, messageTone, recommendedSendWindow, etc) for
// stuck-lead workflow.
//
// NOTE on Anthropic constraints (verified Apr 2026):
//   - additionalProperties: false on every object.
//   - All declared properties listed in `required[]`.

import "server-only";

export const SALES_QUICK_RESPONSE_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    message_text: {
      type: "string",
      description:
        "The Hebrew WhatsApp reply text. 1-4 sentences. Empty string if no draft can be made (e.g., source != whatsapp or message lacks needed context).",
    },
    expected_response_probability: {
      type: "string",
      enum: ["low", "med", "high"],
      description:
        "Self-assessment of likelihood of getting a response based on lead characteristics.",
    },
  },
  required: ["message_text", "expected_response_probability"],
} as const;

export interface SalesQuickResponseOutput {
  message_text: string;
  expected_response_probability: "low" | "med" | "high";
}
