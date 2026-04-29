/**
 * Watcher Agent — Day 6 (Real Anthropic + code-side classification)
 *
 * Pipeline:
 *   1. LLM classifies each event into a category (no severity)
 *   2. Code adds severity from CATEGORY_SEVERITY lookup (./hierarchy.ts)
 *   3. Code sorts: severity asc, then occurredAt desc within tier
 *   4. If empty → status: "no_op" (not failure!)
 */

import { runAgent } from "../run-agent";
import { anthropic } from "@/lib/anthropic";
import { WATCHER_AGENT_OUTPUT_SCHEMA } from "./schema";
import {
  WATCHER_AGENT_SYSTEM_PROMPT,
  buildWatcherUserMessage,
} from "./prompt";
import { CATEGORY_SEVERITY, severityRank } from "./hierarchy";
import type {
  WatcherAgentOutput,
  WatcherAlert,
  RunResult,
} from "../types";
import type { WatcherCategory } from "./hierarchy";
import type { WatcherPromptContext } from "./prompt";

const MODEL = "claude-haiku-4-5" as const;

// Internal type — what the LLM returns (no severity).
interface WatcherRawAlert {
  category: WatcherCategory;
  title: string;
  context: string;
  source: string;
  occurredAt: string;
}

interface WatcherRawOutput {
  alerts: WatcherRawAlert[];
  scanSummary: string;
  scannedSources: string[];
}

export async function runWatcherAgent(
  tenantId: string,
  triggerSource: "manual" | "scheduled" | "webhook" = "manual",
  context?: Partial<WatcherPromptContext>
): Promise<RunResult<WatcherAgentOutput>> {
  const promptContext: WatcherPromptContext = {
    ownerName: context?.ownerName ?? "בעל העסק",
    businessName: context?.businessName ?? "העסק שלי",
    recentEvents: context?.recentEvents ?? [],
    lastScanAt: context?.lastScanAt,
  };

  const executor = async () => {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: WATCHER_AGENT_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: [
        { role: "user", content: buildWatcherUserMessage(promptContext) },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: WATCHER_AGENT_OUTPUT_SCHEMA,
        },
      },
    });

    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    const raw = JSON.parse(text) as WatcherRawOutput;

    // ─── Code-side processing ──────────────────────────────────
    // 1. Add severity from category (the "policy" lookup).
    const enriched: WatcherAlert[] = raw.alerts.map((a) => ({
      ...a,
      severity: CATEGORY_SEVERITY[a.category],
    }));

    // 2. Sort: severity asc (critical first), then occurredAt desc within tier.
    enriched.sort((a, b) => {
      const sevDiff = severityRank(a.severity) - severityRank(b.severity);
      if (sevDiff !== 0) return sevDiff;
      const aTime = parseTime(a.occurredAt);
      const bTime = parseTime(b.occurredAt);
      return bTime - aTime;
    });

    const output: WatcherAgentOutput = {
      alerts: enriched,
      scanSummary: raw.scanSummary,
      scannedSources: raw.scannedSources,
      totalCount: enriched.length,
    };

    // 3. Empty alerts → no_op (clean halt, not failure).
    const status: "succeeded" | "no_op" =
      enriched.length === 0 ? "no_op" : "succeeded";

    return {
      output,
      status,
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

  return runAgent<WatcherAgentOutput>(
    { tenantId, agentId: "watcher", triggerSource, model: MODEL },
    undefined,
    executor
  );
}

/** Parse occurredAt to a sortable epoch ms. Returns 0 if unparseable. */
function parseTime(s: string): number {
  const ts = Date.parse(s);
  return Number.isFinite(ts) ? ts : 0;
}
