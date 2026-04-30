// src/lib/agents/manager/schema.ts
//
// JSON Schema for the Manager Agent output.
//
// 5 sections — every report from Manager has all 5, even if some are empty:
//   1. summary             — Hebrew headline (1 sentence)
//   2. status_summary      — agent run health
//   3. quality_findings    — drafts sampled + flagged
//   4. system_health       — failures, cost anomalies
//   5. growth_metrics      — approval rate, time-to-approval, stale blazing
//   6. recommendation      — ONE actionable suggestion (always present, may be 'no_action_needed')
//
// Anthropic structured outputs constraints:
//   - 'integer' does NOT support `minimum`/`maximum` keywords.
//   - Nullable fields (`type: ["string", "null"]`) cannot also have `enum`.
//     For nullable agent references, we describe the allowed values in
//     `description` text and keep validation in the model layer.
//   - additionalProperties: false on every object.
//   - All declared properties listed in `required[]`.

import "server-only";

// Reusable enum for agent IDs (matches AgentId type in types.ts).
// Used ONLY where the field is required (non-nullable). For nullable
// references we use a description string.
const AGENT_ID_ENUM = [
  "morning",
  "reviews",
  "social",
  "manager",
  "watcher",
  "cleanup",
  "sales",
  "inventory",
  "hot_leads",
] as const;

const AGENT_ID_DESCRIPTION =
  "Agent identifier. Allowed values: morning, reviews, social, manager, watcher, cleanup, sales, inventory, hot_leads. Use null when not applicable.";

const SEVERITY_ENUM = ["minor", "moderate", "critical"] as const;

export const MANAGER_AGENT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
      description:
        "Hebrew one-line summary of the entire report. Max ~120 chars. Owner sees this first. Example: 'שבוע יציב — 8/8 ריצות הצליחו, שיעור אישור 85%.'",
    },

    status_summary: {
      type: "object",
      additionalProperties: false,
      properties: {
        agents: {
          type: "array",
          description: "One entry per agent that ran (or should have run) in the window.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              agentId: {
                type: "string",
                enum: [...AGENT_ID_ENUM],
              },
              status: {
                type: "string",
                enum: ["succeeded", "failed", "skipped", "never_ran"],
              },
              runCount: {
                type: "integer",
                description: "Total runs of this agent in the window. Non-negative integer.",
              },
              failureCount: {
                type: "integer",
                description: "Number of failed runs in the window. Non-negative integer.",
              },
              lastError: {
                type: ["string", "null"],
                description: "Most recent error message if status is failed, otherwise null.",
              },
            },
            required: ["agentId", "status", "runCount", "failureCount", "lastError"],
          },
        },
        totalSucceeded: {
          type: "integer",
          description: "Sum of successful runs across all agents.",
        },
        totalFailed: {
          type: "integer",
          description: "Sum of failed runs across all agents.",
        },
      },
      required: ["agents", "totalSucceeded", "totalFailed"],
    },

    quality_findings: {
      type: "object",
      additionalProperties: false,
      properties: {
        draftsSampled: {
          type: "integer",
          description: "How many drafts were sampled for quality audit (max 10 per run).",
        },
        findings: {
          type: "array",
          description: "Drafts that the Manager flagged. Empty if all sampled drafts passed.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              draftId: {
                type: "string",
                description: "drafts.id of the flagged draft.",
              },
              issueType: {
                type: "string",
                description:
                  "Issue category: 'brand_tone' (tone mismatch), 'defamation_followup' (defamation guard missed something), 'pii_leak_suspicion', 'over_promise' (the draft promises something the business may not deliver).",
              },
              reasonHe: {
                type: "string",
                description: "Hebrew explanation for owner — why this draft was flagged.",
              },
              severity: {
                type: "string",
                enum: [...SEVERITY_ENUM],
              },
            },
            required: ["draftId", "issueType", "reasonHe", "severity"],
          },
        },
        overallQualityHe: {
          type: "string",
          description:
            "Hebrew prose summary of quality state. 1-2 sentences. Example: 'איכות הטיוטות יציבה, אין סימני בעיה.'",
        },
      },
      required: ["draftsSampled", "findings", "overallQualityHe"],
    },

    system_health: {
      type: "object",
      additionalProperties: false,
      properties: {
        signals: {
          type: "array",
          description: "Anomalies detected in agent runs or costs. Empty if all healthy.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              anomalyType: {
                type: "string",
                description:
                  "Anomaly category: 'cost_spike' (cost_today > 1.5x avg), 'consecutive_failures' (3+ failures in a row), 'token_anomaly' (single run used >2x median tokens), 'silent_agent' (agent did not run as scheduled).",
              },
              agentId: {
                // Nullable field: allow either an agent id string or null.
                // Cannot use enum here (Anthropic schema constraint).
                type: ["string", "null"],
                description: AGENT_ID_DESCRIPTION,
              },
              descriptionHe: {
                type: "string",
                description: "Hebrew explanation for owner.",
              },
              severity: {
                type: "string",
                enum: [...SEVERITY_ENUM],
              },
            },
            required: ["anomalyType", "agentId", "descriptionHe", "severity"],
          },
        },
        costWindowIls: {
          type: "number",
          description: "Total ILS cost across all agent runs in the window.",
        },
        costAnomalyDetected: {
          type: "boolean",
          description:
            "TRUE if cost in this window exceeded historical average by >50% or hit any anomaly threshold.",
        },
        overallHealthHe: {
          type: "string",
          description:
            "Hebrew prose summary of system health. Example: 'המערכת בריאה. עלויות בטווח הצפוי, אין כשלים חוזרים.'",
        },
      },
      required: ["signals", "costWindowIls", "costAnomalyDetected", "overallHealthHe"],
    },

    growth_metrics: {
      type: "object",
      additionalProperties: false,
      properties: {
        approvalRate: {
          type: ["number", "null"],
          description:
            "Fraction 0..1 of drafts the owner approved. Null if no drafts decided in window.",
        },
        medianTimeToApprovalMinutes: {
          type: ["integer", "null"],
          description:
            "Median minutes from draft creation to approval. Null if no approvals in window. Lower = better engagement.",
        },
        stalePendingDraftsCount: {
          type: "integer",
          description: "Drafts in 'pending' status older than 24 hours. Owner should review them.",
        },
        staleBlazingLeadsCount: {
          type: "integer",
          description:
            "Blazing-bucket leads not contacted within 24h. Critical — these are highest-value leads.",
        },
        interpretationHe: {
          type: "string",
          description:
            "Hebrew prose interpretation of the metrics in plain language for the owner.",
        },
      },
      required: [
        "approvalRate",
        "medianTimeToApprovalMinutes",
        "stalePendingDraftsCount",
        "staleBlazingLeadsCount",
        "interpretationHe",
      ],
    },

    recommendation: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: {
          type: "string",
          enum: [
            "prompt_tweak",
            "scheduling",
            "configuration",
            "no_action_needed",
          ],
        },
        targetAgent: {
          // Nullable: the recommendation may not apply to a specific agent.
          // Cannot use enum here (Anthropic schema constraint).
          type: ["string", "null"],
          description: AGENT_ID_DESCRIPTION,
        },
        titleHe: {
          type: "string",
          description: "Hebrew one-line title for the recommendation.",
        },
        detailHe: {
          type: "string",
          description: "Hebrew detailed explanation, 2-4 sentences.",
        },
        suggestedActionHe: {
          type: "string",
          description: "Concrete Hebrew action the owner should consider taking.",
        },
      },
      required: ["type", "targetAgent", "titleHe", "detailHe", "suggestedActionHe"],
    },

    hasCriticalIssues: {
      type: "boolean",
      description:
        "TRUE if ANY signal across quality_findings, system_health is severity='critical'. Drives UI alert banner.",
    },
  },
  required: [
    "summary",
    "status_summary",
    "quality_findings",
    "system_health",
    "growth_metrics",
    "recommendation",
    "hasCriticalIssues",
  ],
} as const;
