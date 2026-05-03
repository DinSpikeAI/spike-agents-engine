/**
 * Morning Agent — Day 5 (Real Anthropic) + Sub-stage 1.5.1 (LLM retry)
 *                + 1.5.1 hotfix (anti-AI post-processing)
 *
 * Passes a real executor to runAgent() which calls claude-haiku-4-5
 * with the Hebrew morning briefing prompt + structured output schema.
 */
import { runAgent } from "../run-agent";
import { anthropic } from "@/lib/anthropic";
import { withRetry } from "@/lib/with-retry";
import { stripAiTellsDeep } from "@/lib/safety/anti-ai-strip";
import { MORNING_AGENT_OUTPUT_SCHEMA } from "./schema";
import { MORNING_AGENT_SYSTEM_PROMPT, buildMorningUserMessage } from "./prompt";
import type { MorningAgentOutput, RunResult } from "../types";
import type { MorningPromptContext } from "./prompt";

const MODEL = "claude-haiku-4-5" as const;

export async function runMorningAgent(
  tenantId: string,
  triggerSource: "manual" | "scheduled" | "webhook" | "admin_manual" = "manual",
  context?: Partial<MorningPromptContext>
): Promise<RunResult<MorningAgentOutput>> {
  const promptContext: MorningPromptContext = {
    ownerName: context?.ownerName ?? "בעל העסק",
    businessName: context?.businessName ?? "העסק שלי",
    todaysEvents: context?.todaysEvents ?? [],
    yesterdayMetrics: context?.yesterdayMetrics ?? {},
    pendingTasks: context?.pendingTasks ?? [],
    recentUpdates: context?.recentUpdates ?? [],
  };

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
          max_tokens: 1024,
          system: [
            {
              type: "text",
              text: MORNING_AGENT_SYSTEM_PROMPT,
              cache_control: { type: "ephemeral", ttl: "1h" },
            },
          ],
          messages: [
            { role: "user", content: buildMorningUserMessage(promptContext) },
          ],
          output_config: {
            format: {
              type: "json_schema",
              schema: MORNING_AGENT_OUTPUT_SCHEMA,
            },
          },
        }),
      {
        onRetry: ({ attempt, nextDelayMs, error }) => {
          console.warn(
            `[morning] LLM attempt ${attempt} failed; retrying in ${Math.round(nextDelayMs)}ms`,
            { error: error instanceof Error ? error.message : String(error) }
          );
        },
      }
    );

    // Extract text from content blocks. Skip thinking blocks (no .text field).
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    // Parse, then strip AI signature tells from all string fields recursively.
    // Defense-in-depth — prompt may not enforce these rules; regex always does.
    const rawOutput = JSON.parse(text) as MorningAgentOutput;
    const output = stripAiTellsDeep(rawOutput);

    return {
      output,
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

  return runAgent<MorningAgentOutput>(
    { tenantId, agentId: "morning", triggerSource, model: MODEL },
    undefined,
    executor
  );
}
