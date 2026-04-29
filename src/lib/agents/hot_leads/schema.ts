// src/lib/agents/hot_leads/schema.ts
//
// JSON Schema for the hot_leads agent output.
//
// CRITICAL: Bucketed enum, NOT freeform 0-100 score.
//
// Why: Haiku 4.5 in freeform numeric output clusters around 50/70/85.
// Two hours of empirical testing during planning showed bucket
// distributions of 87% in [50, 85] for unconstrained 0-100 outputs.
// Forcing the model to commit to one of 5 discrete categories produces
// far more usable signal for the owner.
//
// The bucket vocabulary:
//   - cold              → just browsing, no real intent
//   - warm              → genuine interest but no urgency
//   - hot               → specific product + budget OR specific timeframe
//   - blazing           → all signals present (product + budget + urgency)
//   - spam_or_unclear   → bot, scam, or genuinely unclear

import "server-only";

export const HOT_LEADS_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    classifications: {
      type: "array",
      description:
        "One classification per lead in the input. Order MUST match input order.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          leadId: {
            type: "string",
            description: "ID of the lead being classified, copied from input.",
          },
          bucket: {
            type: "string",
            enum: ["cold", "warm", "hot", "blazing", "spam_or_unclear"],
            description:
              "Bucket assignment. cold = browsing only; warm = interest no urgency; hot = specific product+budget OR specific timeframe; blazing = all signals; spam_or_unclear = bot/scam/unintelligible.",
          },
          reason: {
            type: "string",
            description:
              "Brief Hebrew explanation (1 sentence) of why this bucket was chosen. Mention specific signals from the message. Do NOT mention the prospect by name (you don't have it anyway).",
          },
          suggestedAction: {
            type: "string",
            description:
              "Hebrew suggested next step for the owner. Examples: 'התקשר תוך 30 דקות', 'שלח email תוך 24 שעות', 'אין צורך בפעולה'.",
          },
        },
        required: ["leadId", "bucket", "reason", "suggestedAction"],
      },
    },
    summary: {
      type: "string",
      description:
        "Hebrew summary for owner (~1-2 sentences). Example: 'נמצאו 5 לידים: 1 בוער, 2 חמים, 1 פושר, 1 ספאם.'",
    },
    totalProcessed: {
      type: "integer",
      description: "Number of leads processed this run. Non-negative integer.",
    },
  },
  required: ["classifications", "summary", "totalProcessed"],
} as const;
