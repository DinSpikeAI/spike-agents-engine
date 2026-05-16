// src/app/api/cron/watcher/route.ts
//
// Daily cron that runs the Watcher agent for any tenant with recent activity.
//
// SCHEDULE: "0 6 * * *" — daily at 06:00 UTC (~09:00 IL summer / 08:00 IL winter).
//           Configured in vercel.json. Hobby tier has a flexible time window
//           of up to 1 hour, so actual fire time may be 06:00-07:00 UTC.
//
// PURPOSE: safety net for the webhook-triggered Watcher run. The webhook
//   handler at /api/webhooks/whatsapp uses waitUntil(runWatcherAgent(...))
//   for fire-and-forget classification. If that fails (network blip, LLM
//   timeout, Vercel context cutoff), this cron catches it within a day.
//
// SPRINT 3X (2026-05-13) — Owner WhatsApp auto-send for critical/high alerts.
//   After each successful Watcher run, this cron inspects the produced
//   alerts. If any are critical or high severity AND not present in the
//   tenant's previous successful Watcher run (diff-based dedupe — no new
//   DB column needed), it sends a Hebrew WhatsApp ping to the owner with
//   the new alerts. Same Iron-Rule carve-out as Morning (§15.25): owner-
//   self loopback is exempt from the [אשר] flow.
//
// DEDUPE LOGIC:
//   1. After runWatcherAgent succeeds, filter output.alerts to critical+high.
//   2. Query the previous successful Watcher run for this tenant from
//      agent_runs (LIMIT 2 ORDER BY finished_at DESC; index 0 is the run
//      we just made, index 1 is the previous one if it exists).
//   3. Compute signature for each alert as `${category}|${source}|${occurredAt}`.
//   4. NEW alerts = current critical+high alerts whose signature is NOT in
//      the previous run's critical+high alerts.
//   5. If NEW is non-empty → format Hebrew WhatsApp body → send.
//   This means: same alert continuing across daily runs = sent once;
//   alert that drops out of the 24h window then re-appears = sent again
//   (treated as new, which is correct since the situation re-emerged).
//
// IDEMPOTENCY: re-running Watcher on the same events is safe. Watcher is
//   read-only against `events` and writes only to `agent_runs` (telemetry)
//   and its own `WatcherAlert` output (consumed by the dashboard). It does
//   not create drafts, leads, or notifications. So duplicate runs cost
//   tokens but don't pollute downstream state. The 3X auto-send adds an
//   external side-effect (WhatsApp send) that IS sensitive to dedupe,
//   handled by the diff logic above.
//
// SCOPE: every tenant with at least one event in the last 24h gets a
//   Watcher run. This intentionally runs Watcher for tenants that already
//   ran successfully — simpler than tracking which tenants are "due", and
//   the spend cap inside runAgent prevents runaway cost.
//
// AUTH: Vercel cron sends "Authorization: Bearer <CRON_SECRET>" when
//   CRON_SECRET is configured in the project's env vars. We require it in
//   production but allow unauthenticated requests in local dev (where
//   process.env.CRON_SECRET is unset) so curl testing works.
//
// LOOKBACK_HOURS mirrors the constant inside watcher/run.ts. If we change
// one, we should change both.

import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWatcherAgent } from "@/lib/agents/watcher/run";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import {
  lookupWhatsAppIntegration,
  wasContactedInLast24h,
  mapSendErrorToHebrew,
} from "@/lib/whatsapp/helpers";
import {
  severityRank,
  SEVERITY_LABELS_HE,
} from "@/lib/agents/watcher/hierarchy";
import type {
  WatcherAgentOutput,
  WatcherAlert,
  RunResult,
} from "@/lib/agents/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOOKBACK_HOURS = 24;

// Concurrency cap for per-tenant processing. Sprint 3X each tenant's run
// includes an Anthropic LLM call (Watcher Haiku) plus a DB lookup + possibly
// a WhatsApp send. 5 at a time is gentle on rate limits and matches the
// Morning cron's MAX_CONCURRENT_TENANTS (§10.39).
const MAX_CONCURRENT_TENANTS = 5;

// Sprint 3X — alerts at or above this severity trigger WhatsApp auto-send.
// "high" → severityRank() returns 1 → filter accepts ranks 0 (critical) and 1 (high).
// medium (rank 2) + low (rank 3) stay dashboard-only to avoid notification flood.
const AUTO_SEND_SEVERITY_THRESHOLD: "critical" | "high" | "medium" | "low" = "high";

// ─────────────────────────────────────────────────────────────
// Outcome type — for response JSON + logging
// ─────────────────────────────────────────────────────────────

type AgentOutcome = "succeeded" | "no_op" | "failed";

type AutoSendOutcome =
  | "sent"
  | "no_critical_or_high"
  | "no_new_since_previous"
  | "no_owner_phone"
  | "no_integration"
  | "missing_credentials"
  | "outside_24h"
  | "send_failed"
  | "skipped_agent_not_succeeded"
  | "uncaught_error";

interface TenantResult {
  tenantId: string;
  agent: AgentOutcome;
  agentError?: string;
  autoSend: {
    outcome: AutoSendOutcome;
    detail?: string;
    /** Number of NEW critical+high alerts found in this run vs previous. */
    newAlertCount?: number;
  };
}

// ─────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // ─── Auth ───────────────────────────────────────────────────────
  // Production: require CRON_SECRET via Authorization: Bearer header.
  // Dev (env var unset): allow open access for local cron testing.
  if (process.env.CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (authHeader !== expected) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Defense-in-depth: never run an open cron in prod even if someone
    // forgets to set CRON_SECRET. Better to fail loudly than silently
    // expose the endpoint.
    console.error(
      "[cron-watcher] CRON_SECRET not set in production — refusing to run",
    );
    return new NextResponse("Server misconfigured", { status: 503 });
  }

  const supabase = createAdminClient();
  const sinceIso = new Date(
    Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000,
  ).toISOString();

  // ─── Find active tenants ────────────────────────────────────────
  // Tenants with at least one event in the lookback window. We dedupe
  // tenant_id in JS rather than using DISTINCT in SQL because PostgREST's
  // .select() doesn't expose DISTINCT cleanly; the row count here is
  // bounded by Watcher's MAX_EVENTS_PER_RUN × tenant count, well under any
  // reasonable Vercel function memory limit.
  const { data: rows, error } = await supabase
    .from("events")
    .select("tenant_id")
    .gte("received_at", sinceIso);

  if (error) {
    console.error("[cron-watcher] Failed to load active tenants", error);
    return NextResponse.json(
      { error: "DB query failed", details: error.message },
      { status: 500 },
    );
  }

  const uniqueTenantIds = Array.from(
    new Set(
      (rows ?? [])
        .map((r) => r.tenant_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  if (uniqueTenantIds.length === 0) {
    return NextResponse.json({
      status: "ok",
      tenants_processed: 0,
      message: "No tenants with recent events",
    });
  }

  // ─── Run Watcher + auto-send per tenant ─────────────────────────
  // Chunked Promise.allSettled — matches Morning cron's pattern (§10.39).
  // Each tenant's processTenant call is independent; one failing must not
  // poison the others.
  const results: TenantResult[] = [];

  for (let i = 0; i < uniqueTenantIds.length; i += MAX_CONCURRENT_TENANTS) {
    const chunk = uniqueTenantIds.slice(i, i + MAX_CONCURRENT_TENANTS);
    const chunkResults = await Promise.allSettled(
      chunk.map((tenantId) => processTenant(supabase, tenantId)),
    );
    chunkResults.forEach((settled, idx) => {
      const tenantId = chunk[idx];
      if (settled.status === "fulfilled") {
        results.push({ tenantId, ...settled.value });
      } else {
        results.push({
          tenantId,
          agent: "failed",
          agentError:
            settled.reason instanceof Error
              ? settled.reason.message
              : String(settled.reason),
          autoSend: { outcome: "uncaught_error" },
        });
      }
    });
  }

  // ─── Tally for response + logs ──────────────────────────────────
  const agentTally = results.reduce<Record<AgentOutcome, number>>(
    (acc, r) => {
      acc[r.agent] = (acc[r.agent] ?? 0) + 1;
      return acc;
    },
    { succeeded: 0, no_op: 0, failed: 0 },
  );

  const autoSendTally = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.autoSend.outcome] = (acc[r.autoSend.outcome] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    `[cron-watcher] processed ${results.length} tenants:`,
    "agent=" +
      Object.entries(agentTally)
        .map(([k, v]) => `${k}:${v}`)
        .join(","),
    "auto_send=" +
      Object.entries(autoSendTally)
        .map(([k, v]) => `${k}:${v}`)
        .join(","),
  );

  return NextResponse.json({
    status: "ok",
    tenants_processed: uniqueTenantIds.length,
    succeeded: agentTally.succeeded,
    no_op: agentTally.no_op,
    failed: agentTally.failed,
    auto_send: {
      sent: autoSendTally.sent ?? 0,
      tally: autoSendTally,
    },
    results,
  });
}

// ─────────────────────────────────────────────────────────────────────
// processTenant — run Watcher then attempt auto-send
// ─────────────────────────────────────────────────────────────────────

async function processTenant(
  db: SupabaseClient,
  tenantId: string,
): Promise<Omit<TenantResult, "tenantId">> {
  // ─── Step 1: Run Watcher agent ───────────────────────────────
  let result: RunResult<WatcherAgentOutput>;
  try {
    result = await runWatcherAgent(tenantId, "scheduled");
  } catch (err) {
    return {
      agent: "failed",
      agentError: err instanceof Error ? err.message : String(err),
      autoSend: { outcome: "skipped_agent_not_succeeded" },
    };
  }

  if (result.status !== "succeeded") {
    return {
      agent: result.status === "no_op" ? "no_op" : "failed",
      autoSend: { outcome: "skipped_agent_not_succeeded" },
    };
  }

  // ─── Step 2: Try auto-send — never let it fail the watcher run ───
  // The Watcher's primary job (write alerts to agent_runs.output) is
  // already done. Auto-send is best-effort: errors get logged + reported
  // in the response but don't bubble up to fail the cron tick.
  try {
    const autoSend = await maybeSendCriticalAlerts(db, tenantId, result);
    return { agent: "succeeded", autoSend };
  } catch (err) {
    console.error(`[cron-watcher] auto-send error for tenant ${tenantId}:`, err);
    return {
      agent: "succeeded",
      autoSend: {
        outcome: "uncaught_error",
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// maybeSendCriticalAlerts — diff-based dedupe + WhatsApp send
// ─────────────────────────────────────────────────────────────────────

async function maybeSendCriticalAlerts(
  db: SupabaseClient,
  tenantId: string,
  currentResult: RunResult<WatcherAgentOutput>,
): Promise<TenantResult["autoSend"]> {
  // Filter current run's alerts to critical + high severity.
  const threshold = severityRank(AUTO_SEND_SEVERITY_THRESHOLD);
  const currentHigh = (currentResult.output?.alerts ?? []).filter(
    (a) => severityRank(a.severity) <= threshold,
  );

  if (currentHigh.length === 0) {
    return { outcome: "no_critical_or_high" };
  }

  // Fetch the two most recent successful Watcher runs for this tenant.
  // Index 0 = the run we just made (already persisted to DB by runAgent
  // before runWatcherAgent returned). Index 1 = the previous run (if any).
  // Using "two most recent" instead of needing currentResult.runId keeps
  // this resilient to any future changes in RunResult shape.
  const { data: recentRuns } = await db
    .from("agent_runs")
    .select("id, output, finished_at")
    .eq("tenant_id", tenantId)
    .eq("agent_id", "watcher")
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false })
    .limit(2);

  const prevRun = recentRuns?.[1] ?? null;
  const prevOutput = (prevRun?.output ?? null) as {
    alerts?: WatcherAlert[];
  } | null;

  const prevHigh = (prevOutput?.alerts ?? []).filter(
    (a) => severityRank(a.severity) <= threshold,
  );

  // Signature = category + source + occurredAt. Unique enough for dedupe
  // because each Watcher alert is tied to a specific event in time, and
  // (category, source, occurredAt) collisions would require two distinct
  // events at the exact same timestamp on the same source — possible but
  // rare, and the worst case is one missed ping, not a duplicate.
  const signatureOf = (a: WatcherAlert): string =>
    `${a.category}|${a.source}|${a.occurredAt}`;

  const prevSigs = new Set(prevHigh.map(signatureOf));
  const newAlerts = currentHigh.filter((a) => !prevSigs.has(signatureOf(a)));

  if (newAlerts.length === 0) {
    return {
      outcome: "no_new_since_previous",
      detail: `${currentHigh.length} high-sev alerts, all seen in previous run`,
    };
  }

  // ─── Gate 1: tenant has owner_phone configured ───────────────
  const { data: tenant } = await db
    .from("tenants")
    .select("config")
    .eq("id", tenantId)
    .single();

  const config = (tenant?.config ?? {}) as Record<string, unknown>;
  const ownerPhoneRaw = config.owner_phone;
  if (
    typeof ownerPhoneRaw !== "string" ||
    ownerPhoneRaw.trim().length === 0
  ) {
    return {
      outcome: "no_owner_phone",
      newAlertCount: newAlerts.length,
    };
  }
  const ownerPhone = ownerPhoneRaw.trim();

  // ─── Gate 2: WhatsApp integration connected with credentials ──
  const integration = await lookupWhatsAppIntegration(db, tenantId);
  if (!integration.ok) {
    return {
      outcome:
        integration.reason === "not_connected"
          ? "no_integration"
          : "missing_credentials",
      detail: integration.reason,
      newAlertCount: newAlerts.length,
    };
  }

  // ─── Gate 3: owner texted Spike within last 24h (Meta session window) ─
  // Outside 24h Meta requires an approved template message — pending
  // Meta-Business-verification paperwork. Mirrors §10.39 Morning cron.
  const within24h = await wasContactedInLast24h(db, tenantId, ownerPhone);
  if (!within24h) {
    return {
      outcome: "outside_24h",
      detail:
        "owner has not messaged spike in the last 24h; needs template message (post-Meta-verification)",
      newAlertCount: newAlerts.length,
    };
  }

  // ─── Build + send ─────────────────────────────────────────────
  const messageBody = renderWatcherAlertsMessage(newAlerts);
  const sendResult = await sendWhatsAppMessage({
    toPhone: ownerPhone,
    messageBody,
    phoneNumberId: integration.phoneNumberId,
    accessToken: integration.accessToken,
  });

  if (!sendResult.ok) {
    console.warn(
      `[cron-watcher] send failed for tenant ${tenantId}: ${sendResult.errorCategory} / ${sendResult.metaCode ?? "no-code"} / ${sendResult.errorMessage}`,
    );
    return {
      outcome: "send_failed",
      detail: `${sendResult.errorCategory}: ${mapSendErrorToHebrew(sendResult)}`,
      newAlertCount: newAlerts.length,
    };
  }

  return {
    outcome: "sent",
    newAlertCount: newAlerts.length,
  };
}

// ─────────────────────────────────────────────────────────────────────
// renderWatcherAlertsMessage
// ─────────────────────────────────────────────────────────────────────
//
// Format Hebrew WhatsApp body for owner-self alert delivery. WhatsApp
// inline formatting supported: *bold* with single asterisks, newlines,
// emojis. Bullet style: "• item" (matches §10.39 Morning render).
//
// Layout:
//   🔔 Spike — (1 התראה חדשה | N התראות חדשות)
//
//   [optional numbering, single alert has no number]
//   *<title>* (<severity in Hebrew>)
//   <context>
//   מקור: <source>
//
//   לפרטים: app.spikeai.co.il/dashboard/alerts
//
// Critical alerts are NOT visually distinguished from high alerts in the
// message body — they're already prioritized at the cron level (only
// critical+high go through this path, medium+low stay dashboard-only).
// The Hebrew severity label ("קריטי" / "גבוה") provides per-alert context.

function renderWatcherAlertsMessage(alerts: WatcherAlert[]): string {
  const lines: string[] = [];

  // Header
  if (alerts.length === 1) {
    lines.push("🔔 Spike — התראה חדשה");
  } else {
    lines.push(`🔔 Spike — ${alerts.length} התראות חדשות`);
  }
  lines.push("");

  // Body
  for (let i = 0; i < alerts.length; i++) {
    const a = alerts[i];
    const severityLabel = SEVERITY_LABELS_HE[a.severity];
    const numberPrefix = alerts.length > 1 ? `${i + 1}. ` : "";
    lines.push(`${numberPrefix}*${a.title}* (${severityLabel})`);
    lines.push(a.context);
    lines.push(`מקור: ${a.source}`);
    if (i < alerts.length - 1) lines.push("");
  }

  // Footer
  lines.push("");
  lines.push("לפרטים: app.spikeai.co.il/dashboard/alerts");

  return lines.join("\n").trim();
}
