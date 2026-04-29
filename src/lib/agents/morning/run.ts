/**
 * Morning Agent — Day 5 (Real Anthropic)
 *
 * Passes a real executor to runAgent() which calls claude-haiku-4-5
 * with the Hebrew morning briefing prompt + structured output schema.
 */
import { runAgent } from "../run-agent";
import { anthropic } from "@/lib/anthropic";
import { MORNING_AGENT_OUTPUT_SCHEMA } from "./schema";
import { MORNING_AGENT_SYSTEM_PROMPT, buildMorningUserMessage } from "./prompt";
import type { MorningAgentOutput, RunResult } from "../types";
import type { MorningPromptContext } from "./prompt";

const MODEL = "claude-haiku-4-5" as const;

export async function runMorningAgent(
  tenantId: string,
  triggerSource: "manual" | "scheduled" | "webhook" = "manual",
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
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: MORNING_AGENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildMorningUserMessage(promptContext) }],
      // @ts-expect-error — output_config is GA but not yet in SDK types
      output_config: {
        format: {
          type: "json_schema",
          schema: MORNING_AGENT_OUTPUT_SCHEMA,
        },
      },
    });

    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    const output = JSON.parse(text) as MorningAgentOutput;

    return {
      output,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_input_tokens: (response.usage as any).cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens ?? 0,
      },
    };
  };

  return runAgent<MorningAgentOutput>(
    { tenantId, agentId: "morning", triggerSource },
    undefined,
    executor
  );
}
