// src/lib/agents/reviews/schema.ts
//
// JSON Schema for the reviews_agent output.
//
// One reply per review. Sentiment + intent are classifications; draftText
// is the deliverable. The defamation guard later runs against draftText
// using originalReview as the comparison baseline.
//
// NOTE on Anthropic constraints (verified Apr 2026):
//   - 'integer' type does NOT support `minimum` / `maximum` keywords.
//     Range is enforced via `description` text instead.
//   - additionalProperties: false on every object (required).
//   - All declared properties listed in `required[]`.

import "server-only";

export const REVIEWS_AGENT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    drafts: {
      type: "array",
      description:
        "One draft reply per review in the input array. Order matches input.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          reviewId: {
            type: "string",
            description: "ID of the review this draft is responding to.",
          },
          reviewerName: {
            type: "string",
            description: "Reviewer's name, copied from the input.",
          },
          rating: {
            type: "integer",
            description:
              "Rating from the source review. Must be between 1 and 5 inclusive.",
          },
          reviewTextDisplay: {
            type: "string",
            description:
              "The review text as the owner will see it (after PII scrub already done in code, just echo input).",
          },
          sentiment: {
            type: "string",
            enum: ["positive", "neutral", "negative", "very_negative"],
            description:
              "Agent's tonal classification of the review (independent of star rating).",
          },
          intent: {
            type: "string",
            enum: [
              "praise",
              "minor_complaint",
              "major_complaint",
              "abusive",
              "spam_or_fake",
            ],
            description:
              "Agent's classification of intent. Drives reply tone.",
          },
          draftText: {
            type: "string",
            description:
              "Hebrew draft reply (~3-6 sentences). Address the reviewer by first name. Stay factual about the business; never characterize the reviewer.",
          },
          rationale: {
            type: "string",
            description:
              "Brief Hebrew explanation (1-2 sentences) of why this reply approach was chosen. Shown to owner alongside the draft.",
          },
          suggestsOfflineContact: {
            type: "boolean",
            description:
              "TRUE if the reply asks the reviewer to contact the business privately (typical for major complaints).",
          },
        },
        required: [
          "reviewId",
          "reviewerName",
          "rating",
          "reviewTextDisplay",
          "sentiment",
          "intent",
          "draftText",
          "rationale",
          "suggestsOfflineContact",
        ],
      },
    },
    summary: {
      type: "string",
      description:
        "Hebrew summary for owner (max ~120 chars). Example: 'הוכנו 3 טיוטות תגובה. אחת לביקורת חיובית, שתיים לתלונות.'",
    },
    totalProcessed: {
      type: "integer",
      description:
        "Number of reviews processed this run. Non-negative integer.",
    },
  },
  required: ["drafts", "summary", "totalProcessed"],
} as const;
