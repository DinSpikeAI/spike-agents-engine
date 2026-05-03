/**
 * Social Agent — Day 14 + Sub-stage 1.5.1 (LLM retry)
 *
 * Generates 3 daily Hebrew social media post drafts.
 * Owner copy-pastes manually to Instagram/Facebook (no auto-posting).
 *
 * Pipeline:
 *   1. Load tenant context (name, vertical, owner, social config)
 *   2. Resolve "today" — date, day-of-week, holiday status
 *   3. Build prompt with all context (silent-day branch returns empty posts)
 *   4. Send to Sonnet 4.6 with native JSON schema output
 *      — wrapped in withRetry: 3 attempts, 1s/2s/4s exponential backoff
 *   5. Persist each post as a draft row in the drafts table:
 *      - status='pending', action_type='requires_approval'
 *      - content jsonb contains all post fields
 *      - external_target.platform = 'instagram_or_facebook' (manual paste)
 *      - expires_at = end of today (posts are time-sensitive)
 *   6. Return SocialRunResult with draft IDs
 *
 * Cost optimization:
 *   - Sonnet 4.6 — quality matters for social
 *   - cache_control: ephemeral, ttl: '1h' on system prompt
 *   - No thinking budget
 *
 * Standalone Day 14 scope:
 *   - No external integrations (no Google Business, no Instagram API)
 *   - Works with empty tenant.config using sensible defaults
 *   - Owner enriches config later for personalized output
 */

import { runAgent } from "../run-agent";
import { anthropic } from "@/lib/anthropic";
import { withRetry } from "@/lib/with-retry";
import { createAdminClient } from "@/lib/supabase/admin";
import { SOCIAL_AGENT_OUTPUT_SCHEMA } from "./schema";
import {
  SOCIAL_AGENT_SYSTEM_PROMPT,
  buildSocialUserMessage,
  type SocialPromptContext,
} from "./prompt";
import { withGenderLock, type BusinessOwnerGender } from "@/lib/safety/gender-lock";
import type { RunResult } from "../types";

const MODEL = "claude-sonnet-4-6" as const;
// ─────────────────────────────────────────────────────────────
// Output type — matches schema
// ─────────────────────────────────────────────────────────────

export interface SocialPost {
  slot: "morning" | "noon" | "evening";
  platformRecommendation: "instagram" | "facebook" | "both";
  postType:
    | "educational"
    | "promotional"
    | "testimonial"
    | "behind_scenes"
    | "seasonal"
    | "milestone"
    | "engagement";
  captionHebrew: string;
  hashtags: string[];
  suggestedImagePrompt: string;
  cta: string;
  bestTimeToPostLocal: string;
  confidence: "low" | "medium" | "high";
  rationaleShort: string;
}

export interface SocialAgentOutput {
  posts: SocialPost[];
  summary: string;
  noOpReason: string | null;
}

export interface SocialRunResult extends RunResult<SocialAgentOutput> {
  draftIds: string[];
}

// ─────────────────────────────────────────────────────────────
// Tenant context loading
// ─────────────────────────────────────────────────────────────

interface TenantSocialContext {
  gender: BusinessOwnerGender | null;
  vertical: string;
  ownerName: string;
  businessName: string;
  toneOfVoice: string;
  servicesTop3: string[];
  uniqueSellingPoints: string;
  ctaDefault: string;
  audienceGenderFocus: "all" | "feminine" | "masculine";
  configIsEmpty: boolean;
}

async function loadTenantContext(tenantId: string): Promise<TenantSocialContext> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("tenants")
    .select("name, business_owner_gender, vertical, config")
    .eq("id", tenantId)
    .single();

  if (error || !data) {
    throw new Error(`Tenant ${tenantId} not found: ${error?.message}`);
  }

  const config = (data.config as Record<string, unknown> | null) ?? {};
  const socialConfig =
    (config["social"] as Record<string, unknown> | undefined) ?? {};

  // Detect "config is empty" state — means social block is missing or all defaults
  const configIsEmpty =
    !socialConfig ||
    Object.keys(socialConfig).length === 0 ||
    !socialConfig["servicesTop3"];

  return {
    gender: data.business_owner_gender as BusinessOwnerGender | null,
    vertical: data.vertical ?? "general",
    ownerName: (config["owner_name"] as string) ?? "בעל העסק",
    businessName: data.name ?? "העסק שלי",
    toneOfVoice: (socialConfig["toneOfVoice"] as string) ?? "friendly",
    servicesTop3: (socialConfig["servicesTop3"] as string[]) ?? [],
    uniqueSellingPoints:
      (socialConfig["uniqueSellingPoints"] as string) ?? "",
    ctaDefault:
      (socialConfig["ctaDefault"] as string) ?? "לפרטים בוואטסאפ",
    audienceGenderFocus:
      (socialConfig["audienceGenderFocus"] as
        | "all"
        | "feminine"
        | "masculine") ?? "all",
    configIsEmpty,
  };
}

// ─────────────────────────────────────────────────────────────
// Date / holiday resolution
// ─────────────────────────────────────────────────────────────

interface TodayContext {
  todayDateIso: string;
  dayOfWeek: string;
  isHolidayEve: boolean;
  isSilentDay: boolean;
  silentDayName: string | null;
}

/**
 * Day 14 stub: holiday detection.
 * TODO Day 17+: integrate hebcal API for full Hebrew calendar.
 * For now, returns false for all holiday flags. Owner can manually skip
 * by toggling the "away" flag in tenant settings (future).
 */
function resolveToday(): TodayContext {
  const now = new Date();
  // ISO format date in Asia/Jerusalem TZ
  const ilFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayDateIso = ilFormatter.format(now); // YYYY-MM-DD

  // Day of week in Asia/Jerusalem
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
  });
  const dayOfWeek = dayFormatter.format(now).toLowerCase();

  return {
    todayDateIso,
    dayOfWeek,
    isHolidayEve: false, // TODO Day 17+
    isSilentDay: false, // TODO Day 17+
    silentDayName: null,
  };
}

// ─────────────────────────────────────────────────────────────
// Main run function
// ─────────────────────────────────────────────────────────────

export async function runSocialAgent(
  tenantId: string,
  triggerSource:
    | "manual"
    | "scheduled"
    | "webhook"
    | "admin_manual" = "manual"
): Promise<SocialRunResult> {
  // ─── Load tenant context ────────────────────────────────────
  const tenant = await loadTenantContext(tenantId);
  const today = resolveToday();

  const promptContext: SocialPromptContext = {
    businessName: tenant.businessName,
    vertical: tenant.vertical,
    ownerName: tenant.ownerName,
    toneOfVoice: tenant.toneOfVoice,
    servicesTop3: tenant.servicesTop3,
    uniqueSellingPoints: tenant.uniqueSellingPoints,
    ctaDefault: tenant.ctaDefault,
    audienceGenderFocus: tenant.audienceGenderFocus,
    todayDateIso: today.todayDateIso,
    dayOfWeek: today.dayOfWeek,
    isHolidayEve: today.isHolidayEve,
    isSilentDay: today.isSilentDay,
    silentDayName: today.silentDayName,
    configIsEmpty: tenant.configIsEmpty,
  };

  // ─── Build system blocks (cached + gender-locked) ───────────
  const systemBlocks = withGenderLock(
    SOCIAL_AGENT_SYSTEM_PROMPT,
    tenant.gender
  );

  // ─── Define the executor that runAgent will call ────────────
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
          max_tokens: 3000,
          system: systemBlocks,
          messages: [
            {
              role: "user",
              content: buildSocialUserMessage(promptContext),
            },
          ],
          output_config: {
            format: {
              type: "json_schema",
              schema: SOCIAL_AGENT_OUTPUT_SCHEMA,
            },
          },
        }),
      {
        onRetry: ({ attempt, nextDelayMs, error }) => {
          console.warn(
            `[social] LLM attempt ${attempt} failed; retrying in ${Math.round(nextDelayMs)}ms`,
            { error: error instanceof Error ? error.message : String(error) }
          );
        },
      }
    );

    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const parsed = JSON.parse(text) as SocialAgentOutput;

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
      // If posts is empty (silent day), mark as no_op
      status:
        parsed.posts.length === 0
          ? ("no_op" as const)
          : ("succeeded" as const),
    };
  };

  // ─── Run the agent (telemetry + cost via runAgent) ──────────
  const runResult = await runAgent<SocialAgentOutput>(
    { tenantId, agentId: "social", triggerSource, model: MODEL },
    undefined,
    executor
  );

  if (runResult.status === "failed" || !runResult.output) {
    return {
      ...runResult,
      draftIds: [],
    };
  }

  // ─── Persist each post as a draft row ───────────────────────
  const db = createAdminClient();
  const draftIds: string[] = [];

  // Compute end-of-today expiry in Israel time (posts are time-sensitive).
  const endOfToday = (() => {
    const now = new Date();
    const isoLocal = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    return new Date(`${isoLocal}T23:59:59+03:00`).toISOString();
  })();

  for (const post of runResult.output.posts) {
    const draftRow = {
      tenant_id: tenantId,
      agent_run_id: runResult.runId,
      agent_id: "social",
      type: "social_post",
      content: {
        slot: post.slot,
        platformRecommendation: post.platformRecommendation,
        postType: post.postType,
        captionHebrew: post.captionHebrew,
        hashtags: post.hashtags,
        suggestedImagePrompt: post.suggestedImagePrompt,
        cta: post.cta,
        bestTimeToPostLocal: post.bestTimeToPostLocal,
        confidence: post.confidence,
        rationaleShort: post.rationaleShort,
      },
      status: "pending",
      action_type: "requires_approval",
      context: {
        trigger: triggerSource,
        vertical: tenant.vertical,
        config_was_empty: tenant.configIsEmpty,
        today_date: today.todayDateIso,
      },
      external_target: {
        platform: "manual_paste",
        target_platforms: post.platformRecommendation,
      },
      expires_at: endOfToday,
      defamation_risk: "low" as const,
      defamation_flagged_phrases: [] as string[],
      contains_pii: false,
      pii_scrubbed: false,
      recipient_label: `${post.slot} post`,
    };

    const { data: insertedDraft, error: insertError } = await db
      .from("drafts")
      .insert(draftRow)
      .select("id")
      .single();

    if (insertError) {
      console.error(
        `[social_agent] Failed to persist ${post.slot} post draft:`,
        insertError
      );
      continue;
    }

    draftIds.push(insertedDraft.id);
  }

  return {
    ...runResult,
    draftIds,
  };
}
