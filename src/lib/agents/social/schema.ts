// src/lib/agents/social/schema.ts
//
// JSON Schema for the social_agent output.
//
// Generates 3 daily Hebrew social media post drafts for owner copy-paste.
// Owner reviews + edits + posts manually to Instagram/Facebook.
// NEVER auto-posts. NEVER connects to Meta APIs. Standalone (Day 14 scope).
//
// NOTE on Anthropic constraints (verified Apr 2026):
//   - 'integer' type does NOT support `minimum` / `maximum` keywords.
//     Range is enforced via `description` text instead.
//   - additionalProperties: false on every object (required).
//   - All declared properties listed in `required[]`.

import "server-only";

export const SOCIAL_AGENT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    posts: {
      type: "array",
      description:
        "3 post drafts for today (morning/noon/evening slots). May be 0-3 if it's a quiet day (e.g., Yom Kippur).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          slot: {
            type: "string",
            enum: ["morning", "noon", "evening"],
            description:
              "Time slot. morning=07:00-11:00, noon=12:00-14:00, evening=19:00-21:30 (Asia/Jerusalem).",
          },
          platformRecommendation: {
            type: "string",
            enum: ["instagram", "facebook", "both"],
            description:
              "Recommended platform. 'both' means the post works on both with no edits.",
          },
          postType: {
            type: "string",
            enum: [
              "educational",
              "promotional",
              "testimonial",
              "behind_scenes",
              "seasonal",
              "milestone",
              "engagement",
            ],
            description: "Post category. Drives tone and structure.",
          },
          captionHebrew: {
            type: "string",
            description:
              "The full Hebrew post text. 50-180 words. Natural Hebrew, not translated. Max 3 emojis. Owner copies this and pastes to Instagram/Facebook.",
          },
          hashtags: {
            type: "array",
            description:
              "5-10 Hebrew hashtags (preferred concatenated form like #מרפאתשיניים). Optionally 1-2 English hashtags if vertically relevant.",
            items: { type: "string" },
          },
          suggestedImagePrompt: {
            type: "string",
            description:
              "Hebrew description of an image that would fit this post. Owner uses this as inspiration, not as auto-generation. Example: 'תמונה של חיוך טבעי אחר טיפול הלבנה, רקע נקי לבן'.",
          },
          cta: {
            type: "string",
            description:
              "Call-to-action line. Default: 'לפרטים בוואטסאפ' or similar Hebrew CTA tied to tenant config when available.",
          },
          bestTimeToPostLocal: {
            type: "string",
            description:
              "Best time to post in HH:MM 24h Israel local time. Format must match 'HH:MM'.",
          },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
            description:
              "Self-assessed confidence in post quality. Low when tenant.config is empty; high when full personalization is possible.",
          },
          rationaleShort: {
            type: "string",
            description:
              "1-2 sentence Hebrew explanation of WHY this post was chosen. Shown to owner as tooltip / context.",
          },
        },
        required: [
          "slot",
          "platformRecommendation",
          "postType",
          "captionHebrew",
          "hashtags",
          "suggestedImagePrompt",
          "cta",
          "bestTimeToPostLocal",
          "confidence",
          "rationaleShort",
        ],
      },
    },
    summary: {
      type: "string",
      description:
        "Hebrew summary for owner. Max ~120 chars. Example: 'הוכנו 3 פוסטים: בוקר חינוכי, צהריים מבצע, ערב עדות לקוח.'",
    },
    noOpReason: {
      type: ["string", "null"],
      description:
        "If posts is empty, explain why in Hebrew. Examples: 'יום אבל לאומי', 'נתונים חסרים — חכה למילוי הגדרות'. Null when posts has content.",
    },
  },
  required: ["posts", "summary", "noOpReason"],
} as const;
