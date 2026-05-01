/**
 * Watcher Agent — Day 6 (Real Anthropic + code-side classification)
 *                + Day 19 (real DB-backed events)
 *
 * Pipeline:
 *   1. Load tenant context (name, owner) from public.tenants
 *   2. Load recent events from public.events (last 24h, max 50)
 *   3. If 0 events → return no_op without calling LLM (saves ₪)
 *   4. LLM classifies each event into a category (no severity)
 *   5. Code adds severity from CATEGORY_SEVERITY lookup (./hierarchy.ts)
 *   6. Code sorts: severity asc, then occurredAt desc within tier
 *   7. If LLM returns empty alerts → status: "no_op" (not failure!)
 *
 * Events table contract (public.events):
 *   - id          text          — primary key
 *   - tenant_id   uuid          — for multi-tenant isolation
 *   - provider    text          — source name ("whatsapp", "google_business", ...)
 *   - event_type  text          — free-form (LLM does the classification)
 *   - payload     jsonb         — must contain `summary` (Hebrew, 1-2 sentences)
 *   - received_at timestamptz   — used as occurredAt
 *
 * To add a real integration later (webhook/form/CRM), insert rows in this
 * exact shape and the Watcher keeps working with no code changes.
 * See INTEGRATION-NOTES.md for the contract.
 */

import { runAgent } from "../run-agent";
import { anthropic } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
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

/** Window of events to load. 24h is enough for hourly Watcher cadence. */
const LOOKBACK_HOURS = 24;

/** Hard cap to control cost; if exceeded, take the most recent. */
const MAX_EVENTS_PER_RUN = 50;

// ─────────────────────────────────────────────────────────────
// LLM raw shapes
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Tenant + events loading
// ─────────────────────────────────────────────────────────────

interface TenantWatcherContext {
  ownerName: string;
  businessName: string;
  /** ISO timestamp of the previous successful Watcher run, or null. */
  lastScanAt: string | null;
}

async function loadTenantContext(tenantId: string): Promise<TenantWatcherContext> {
  const db = createAdminClient();

  const { data: tenant, error: tErr } = await db
    .from("tenants")
    .select("name, config")
    .eq("id", tenantId)
    .single();

  if (tErr || !tenant) {
    throw new Error(`Tenant ${tenantId} not found: ${tErr?.message}`);
  }

  const config = (tenant.config ?? {}) as Record<string, unknown>;
  const ownerName = (config.owner_name as string) ?? "בעל העסק";
  const businessName = (tenant.name as string) ?? "העסק שלי";

  // Last successful Watcher run — purely informational for the prompt.
  const { data: lastRun } = await db
    .from("agent_runs")
    .select("finished_at")
    .eq("tenant_id", tenantId)
    .eq("agent_id", "watcher")
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    ownerName,
    businessName,
    lastScanAt: (lastRun?.finished_at as string | undefined) ?? null,
  };
}

interface RawEventRow {
  provider: string | null;
  event_type: string | null;
  payload: Record<string, unknown> | null;
  received_at: string;
}

/** Load recent events for this tenant from public.events. */
async function loadRecentEvents(
  tenantId: string
): Promise<WatcherPromptContext["recentEvents"]> {
  const db = createAdminClient();

  const since = new Date(
    Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await db
    .from("events")
    .select("provider, event_type, payload, received_at")
    .eq("tenant_id", tenantId)
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(MAX_EVENTS_PER_RUN);

  if (error) {
    console.error("[watcher] loadRecentEvents error:", error);
    // Don't fail the run on a transient read error — return empty so the
    // agent reports "no events" cleanly instead of crashing the dashboard.
    return [];
  }

  const rows = (data ?? []) as RawEventRow[];

  // Map DB rows → prompt shape.
  // The `summary` lives inside payload.summary (Hebrew sentence).
  // If payload is malformed (no summary), drop the event silently —
  // the Watcher prompt expects 1-2 sentence summaries, not raw JSON.
  return rows
    .map((row) => {
      const payload = row.payload ?? {};
      const summary =
        typeof payload.summary === "string" ? payload.summary : null;
      if (!summary) return null;

      return {
        source: row.provider ?? row.event_type ?? "unknown",
        summary,
        occurredAt: row.received_at,
      };
    })
    .filter(
      (e): e is WatcherPromptContext["recentEvents"][number] => e !== null
    );
}

// ─────────────────────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────────────────────

/**
 * Run the Watcher agent.
 *
 * @param tenantId      — the tenant to scan
 * @param triggerSource — how this run was triggered (manual/scheduled/...)
 * @param context       — OPTIONAL override for testing. If provided AND
 *                        recentEvents is non-undefined, skips DB load and
 *                        uses the passed events directly. Production code
 *                        should NOT pass this; it's a test seam.
 */
export async function runWatcherAgent(
  tenantId: string,
  triggerSource: "manual" | "scheduled" | "webhook" | "admin_manual" = "manual",
  context?: Partial<WatcherPromptContext>
): Promise<RunResult<WatcherAgentOutput>> {
  // ─── Step 1: Resolve prompt context ───────────────────────────────
  // If caller passed recentEvents (tests), use those. Otherwise load from DB.
  let promptContext: WatcherPromptContext;

  if (context?.recentEvents !== undefined) {
    promptContext = {
      ownerName: context.ownerName ?? "בעל העסק",
      businessName: context.businessName ?? "העסק שלי",
      recentEvents: context.recentEvents,
      lastScanAt: context.lastScanAt,
    };
  } else {
    const [tenantCtx, recentEvents] = await Promise.all([
      loadTenantContext(tenantId),
      loadRecentEvents(tenantId),
    ]);

    promptContext = {
      ownerName: context?.ownerName ?? tenantCtx.ownerName,
      businessName: context?.businessName ?? tenantCtx.businessName,
      recentEvents,
      lastScanAt: context?.lastScanAt ?? tenantCtx.lastScanAt ?? undefined,
    };
  }

  // ─── Step 2: Run LLM via runAgent wrapper (handles spend cap + telemetry)
  // If recentEvents is empty, the LLM returns alerts: [] cleanly and the
  // status becomes no_op — no special-casing needed here.
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

    // ─── Code-side processing ───────────────────────────────────────
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

    // 3. Empty alerts from LLM → no_op (clean halt, not failure).
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
