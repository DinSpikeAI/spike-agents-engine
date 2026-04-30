// src/lib/agents/sales/schema.ts
//
// JSON Schema for the sales_agent output.
//
// Generates Hebrew follow-up messages for stuck leads.
// Channel adapts to lead source: WhatsApp / Email / Instagram DM (text-only).
// Owner reviews each draft and clicks "I sent" to mark complete.
// NEVER auto-sends. NEVER calls Meta APIs.
//
// NOTE on Anthropic constraints (verified Apr 2026):
//   - 'integer' type does NOT support `minimum` / `maximum` keywords.
//   - additionalProperties: false on every object.
//   - All declared properties listed in `required[]`.

import "server-only";

export const SALES_AGENT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    followUps: {
      type: "array",
      description:
        "One follow-up draft per stuck lead. May be 0 if no leads qualify (e.g., all recently contacted).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          leadId: {
            type: "string",
            description: "ID of the hot_lead this follow-up addresses.",
          },
          leadDisplayName: {
            type: "string",
            description: "Lead's name as it appears in hot_leads. Echo input.",
          },
          stuckReasonInferred: {
            type: "string",
            enum: [
              "no_response_after_quote",
              "ghosted_after_meeting",
              "price_objection_unresolved",
              "timing_uncertain",
              "decision_maker_unclear",
              "no_response_after_initial",
              "other",
            ],
            description:
              "Agent's classification of why the lead went cold. Drives message tone.",
          },
          channel: {
            type: "string",
            enum: ["whatsapp", "email", "instagram_dm", "manual"],
            description:
              "Channel for the follow-up. 'manual' = no auto-link possible (e.g., phone-only).",
          },
          subjectLineHebrew: {
            type: ["string", "null"],
            description:
              "Email subject line (Hebrew, 4-7 words). Null for non-email channels.",
          },
          messageHebrew: {
            type: "string",
            description:
              "The full Hebrew follow-up text. WhatsApp: 80-150 words. Email: 100-250 words. Always one clear question, one CTA.",
          },
          messageTone: {
            type: "string",
            enum: [
              "warm_check_in",
              "value_reminder",
              "gentle_nudge",
              "direct_close",
              "break_up",
            ],
            description:
              "The chosen tone. 'break_up' is last-resort: 'if not now, reach out when ready'.",
          },
          whatsappUrl: {
            type: ["string", "null"],
            description:
              "Pre-built wa.me URL ready for owner to click. Null if channel is not whatsapp or no phone available.",
          },
          recommendedSendWindowLocal: {
            type: "string",
            description:
              "Hebrew description of when owner should send. Example: 'בוקר 09:30-11:00 ב-א-ה'.",
          },
          expectedResponseProbability: {
            type: "string",
            enum: ["low", "med", "high"],
            description:
              "Agent's self-assessment of likelihood of getting a response.",
          },
          rationaleShort: {
            type: "string",
            description:
              "1-2 sentence Hebrew explanation of WHY this approach was chosen.",
          },
        },
        required: [
          "leadId",
          "leadDisplayName",
          "stuckReasonInferred",
          "channel",
          "messageHebrew",
          "messageTone",
          "recommendedSendWindowLocal",
          "expectedResponseProbability",
          "rationaleShort",
          "subjectLineHebrew",
          "whatsappUrl",
        ],
      },
    },
    summary: {
      type: "string",
      description:
        "Hebrew summary for owner. Max ~150 chars. Example: 'הוכנו 3 הודעות follow-up: 2 ב-WhatsApp ואחת באימייל.'",
    },
    noOpReason: {
      type: ["string", "null"],
      description:
        "If followUps is empty, explain why in Hebrew. Examples: 'אין lead תקועים ב-3 הימים האחרונים', 'כל הלידים סומנו כנשלחו'. Null when followUps has content.",
    },
  },
  required: ["followUps", "summary", "noOpReason"],
} as const;
