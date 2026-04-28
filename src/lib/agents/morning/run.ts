/**
 * Morning Agent — Day 3 (Mock)
 *
 * Day 3 status: returns canned Hebrew briefing via runAgent() mock.
 * Day 4: will use real Anthropic call with prompt + Native JSON Schema.
 */

import { runAgent } from "../run-agent";
import type { MorningAgentOutput, RunResult } from "../types";

export async function runMorningAgent(
  tenantId: string,
  triggerSource: "manual" | "scheduled" | "webhook" = "manual"
): Promise<RunResult<MorningAgentOutput>> {
  return runAgent<MorningAgentOutput>({
    tenantId,
    agentId: "morning",
    triggerSource,
  });
}
