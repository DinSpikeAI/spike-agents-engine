/**
 * Reviews Agent — Day 8 + Sub-stage 1.5.1 (LLM retry on main reviews call)
 *
 * Pipeline:
 *   1. Receive list of mock reviews from action layer
 *   2. PII-scrub each review's text (preserve names, redact phone/email/etc.)
 *   3. Wrap each scrubbed review in <REVIEW_CONTENT> sentinel tags
 *   4. Send all wrapped reviews to Sonnet 4.6 in one call
 *      — wrapped in withRetry: 3 attempts, 1s/2s/4s exponential backoff
 *   5. Sonnet returns N drafts (one per review)
 *   6. For each draft, run defamation check (Haiku 4.5)
 *      — NOT wrapped in withRetry as of 1.5.1; failures degrade to
 *        risk='medium' which is acceptable. Future improvement.
 *   7. Persist each as a draft row in the drafts table:
 *      - high risk → status='rejected', shown to owner with block message
 *      - medium → status='pending' with warning
 *      - low → status='pending' standard
 *   8. Return SafeRunResult with the array of draft IDs for the UI
 *
 * NOTE: This is the FIRST agent that uses runAgentWithSafety. We don't
 * use the wrapper directly here because the wrapper expects ONE draft
 * per run; reviews_agent produces N drafts per run. So we adapt: we use
 * runAgent for the LLM call + safety primitives manually for each draft.
 */

import { runAgent } from "../run-agent";
import { anthropic } from "@/lib/anthropic";
import { withRetry } from "@/lib/with-retry";
import { createAdminClient } from "@/lib/supabase/admin";
import { REVIEWS_AGENT_OUTPUT_SCHEMA } from "./schema";
import {
  REVIEWS_AGENT_SYSTEM_PROMPT,
  buildReviewsUserMessage,
  type ReviewsPromptContext,
} from "./prompt";
import { scrubPii, hashRecipient } from "@/lib/safety/pii-scrubber";
import { wrapUntrustedInput } from "@/lib/safety/prompt-injection-guard";
import { withGenderLock, type BusinessOwnerGender } from "@/lib/safety/gender-lock";
import { checkDefamationRisk } from "@/lib/safety/defamation-guard";
import type {
  ReviewsAgentOutput,
  ReviewDraft,
  MockReview,
  RunResult,
} from "../types";

const MODEL = "claude-sonnet-4-6" as const;

// Result shape extends RunResult with the per-review draft IDs the UI tracks.
export interface ReviewsRunResult extends RunResult<ReviewsAgentOutput> {
  draftIds: string[];
  defamationFlags: Array<{
    reviewId: string;
    risk: "low" | "medium" | "high";
    flaggedPhrases: string[];
  }>;
}

interface TenantSafetyContext {
  gender: BusinessOwnerGender | null;
  consentStatus: string;
  dpaAccepted: boolean;
  vertical: string;
  ownerName: string;
  businessName: string;
}

async function loadTenantContext(tenantId: string): Promise<TenantSafetyContext> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("tenants")
    .select(
      "name, business_owner_gender, consent_status, dpa_accepted_at, vertical, config"
    )
    .eq("id", tenantId)
    .single();

  if (error || !data) {
    throw new Error(`Tenant ${tenantId} not found: ${error?.message}`);
  }

  return {
    gender: data.business_owner_gender as BusinessOwnerGender | null,
    consentStatus: data.consent_status ?? "pending",
    dpaAccepted: !!data.dpa_accepted_at,
    vertical: data.vertical ?? "general",
    ownerName:
      (data.config as Record<string, unknown> | null)?.["owner_name"]?.toString() ??
      "בעל העסק",
    businessName: data.name ?? "העסק שלי",
  };
}

export async function runReviewsAgent(
  tenantId: string,
  reviews: MockReview[],
  triggerSource: "manual" | "scheduled" | "webhook" | "admin_manual" = "manual"
): Promise<ReviewsRunResult> {
  // ─── Load tenant safety context ──────────────────────────────
  const tenant = await loadTenantContext(tenantId);

  // ─── PII scrub + sentinel-wrap each review ───────────────────
  // We track the scrub results per review so we can mark drafts with
  // contains_pii / pii_scrubbed flags.
  const reviewsWithScrub = reviews.map((r) => {
    const scrub = scrubPii(r.text);
    const wrapped = wrapUntrustedInput(scrub.scrubbed);
    return { review: r, scrub, wrapped };
  });

  // Build the wrapped block for the prompt: tag each review with its ID
  // so Sonnet can match drafts to source reviews unambiguously.
  const wrappedBlock = reviewsWithScrub
    .map(
      ({ review, wrapped }) =>
        `<REVIEW id="${review.id}" rating="${review.rating}" reviewer="${review.reviewerName}">\n${wrapped}\n</REVIEW>`
    )
    .join("\n\n");

  // ─── Build system blocks (cached static + dynamic gender) ────
  const systemBlocks = withGenderLock(REVIEWS_AGENT_SYSTEM_PROMPT, tenant.gender);

  const promptContext: ReviewsPromptContext = {
    ownerName: tenant.ownerName,
    businessName: tenant.businessName,
    vertical: tenant.vertical,
  };

  // ─── Define the executor that runAgent will call ─────────────
  const executor = async () => {
    // Wrap the Anthropic call in withRetry: 3 attempts, 1s/2s/4s exponential
    // backoff with jitter. Retries on transient errors (5xx, 429, network);
    // throws immediately on terminal errors (400, 401, 422). Total max wall
    // time when all 3 attempts fail: ~7s. Successful first-try is zero
    // overhead. See src/lib/with-retry.ts for details.
    const response = await withRetry(
      () =>
        anthropic.messages.create({
          model: MODEL,
          max_tokens: 2048,
          system: systemBlocks,
          messages: [
            {
              role: "user",
              content: buildReviewsUserMessage(promptContext, wrappedBlock),
            },
          ],
          output_config: {
            format: {
              type: "json_schema",
              schema: REVIEWS_AGENT_OUTPUT_SCHEMA,
            },
          },
        }),
      {
        onRetry: ({ attempt, nextDelayMs, error }) => {
          console.warn(
            `[reviews] LLM attempt ${attempt} failed; retrying in ${Math.round(nextDelayMs)}ms`,
            { error: error instanceof Error ? error.message : String(error) }
          );
        },
      }
    );

    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const parsed = JSON.parse(text) as ReviewsAgentOutput;

    return {
      output: parsed,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_input_tokens:
          (response.usage as { cache_read_input_tokens?: number })
            .cache_read_input_tokens ?? 0,
        cache_creation_input_tokens:
          (response.usage as { cache_creation_input_tokens?: number })
            .cache_creation_input_tokens ?? 0,
      },
    };
  };

  // ─── Run the agent (telemetry + cost via runAgent) ───────────
  const runResult = await runAgent<ReviewsAgentOutput>(
    { tenantId, agentId: "reviews", triggerSource, model: MODEL },
    undefined,
    executor
  );

  if (runResult.status === "failed" || !runResult.output) {
    return {
      ...runResult,
      draftIds: [],
      defamationFlags: [],
    };
  }

  // ─── Per-draft defamation check + persist to drafts table ────
  const db = createAdminClient();
  const draftIds: string[] = [];
  const defamationFlags: ReviewsRunResult["defamationFlags"] = [];

  for (const draft of runResult.output.drafts) {
    // Find the matching source review for the defamation comparison.
    const sourceReview = reviews.find((r) => r.id === draft.reviewId);
    const sourceText = sourceReview?.text ?? "";

    // Defamation check (Haiku 4.5)
    let defamationRisk: "low" | "medium" | "high" = "low";
    let flaggedPhrases: string[] = [];
    let blockedReason: string | null = null;

    try {
      const check = await checkDefamationRisk(draft.draftText, sourceText);
      defamationRisk = check.risk;
      flaggedPhrases = check.flagged_phrases;
      defamationFlags.push({
        reviewId: draft.reviewId,
        risk: check.risk,
        flaggedPhrases: check.flagged_phrases,
      });

      if (check.risk === "high") {
        blockedReason = `Defamation risk: ${check.reason}`;
      }
    } catch (err) {
      console.error(
        `[reviews_agent] Defamation check failed for review ${draft.reviewId}:`,
        err
      );
      // Defamation check failure ≠ hard block. Mark medium so owner sees a warning.
      defamationRisk = "medium";
      defamationFlags.push({
        reviewId: draft.reviewId,
        risk: "medium",
        flaggedPhrases: [],
      });
    }

    // Find PII info for this review
    const reviewWithScrub = reviewsWithScrub.find(
      (rw) => rw.review.id === draft.reviewId
    );
    const hadPii = reviewWithScrub?.scrub.hadPii ?? false;

    // Hash the recipient (for Google reviews, the "recipient" is the review thread).
    const recipientHash = await hashRecipient(
      "google_review_reply",
      draft.reviewId
    );

    const draftRow = {
      tenant_id: tenantId,
      agent_run_id: runResult.runId,
      agent_id: "reviews",
      type: "review_reply",
      content: {
        reviewId: draft.reviewId,
        reviewerName: draft.reviewerName,
        rating: draft.rating,
        reviewTextDisplay: draft.reviewTextDisplay,
        sentiment: draft.sentiment,
        intent: draft.intent,
        draftText: draft.draftText,
        rationale: draft.rationale,
        suggestsOfflineContact: draft.suggestsOfflineContact,
      },
      status: blockedReason ? "rejected" : "pending",
      action_type: "requires_approval",
      context: {
        trigger: triggerSource,
        consent_status_at_run: tenant.consentStatus,
        dpa_accepted_at_run: tenant.dpaAccepted,
        original_review_text: sourceText,
      },
      external_target: {
        platform: "google_business_profile",
        review_id: draft.reviewId,
      },
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      defamation_risk: defamationRisk,
      defamation_flagged_phrases: flaggedPhrases,
      contains_pii: hadPii,
      pii_scrubbed: hadPii,
      rejected_at: blockedReason ? new Date().toISOString() : null,
      rejection_reason: blockedReason,
      recipient_hash: recipientHash,
      recipient_label: draft.reviewerName,
    };

    const { data: insertedDraft, error: insertError } = await db
      .from("drafts")
      .insert(draftRow)
      .select("id")
      .single();

    if (insertError) {
      console.error(
        `[reviews_agent] Failed to persist draft for review ${draft.reviewId}:`,
        insertError
      );
      continue;
    }

    draftIds.push(insertedDraft.id);
  }

  return {
    ...runResult,
    draftIds,
    defamationFlags,
  };
}
