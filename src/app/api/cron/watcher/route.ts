// src/app/api/cron/watcher/route.ts
//
// Hourly cron that runs the Watcher agent for any tenant with recent activity.
//
// SCHEDULE: "0 * * * *" — every hour on the hour (configured in vercel.json).
//
// PURPOSE: safety net for the webhook-triggered Watcher run. The webhook
//   handler at /api/webhooks/whatsapp uses waitUntil(runWatcherAgent(...))
//   for fire-and-forget classification. If that fails (network blip, LLM
//   timeout, Vercel context cutoff), this cron catches it within an hour.
//
// IDEMPOTENCY: re-running Watcher on the same events is safe. Watcher is
//   read-only against `events` and writes only to `agent_runs` (telemetry)
//   and its own `WatcherAlert` output (consumed by the dashboard). It does
//   not create drafts, leads, or notifications. So duplicate runs cost
//   tokens but don't pollute downstream state.
//
// SCOPE: every tenant with at least one event in the last 24h gets a
//   Watcher run. This intentionally runs Watcher for tenants that already
//   ran successfully — simpler than tracking which tenants are "due", and
//   the spend cap inside runAgent prevents runaway cost. If volume grows,
//   we can switch to a LATERAL JOIN that filters tenants by last successful
//   Watcher run timestamp.
//
// AUTH: Vercel cron sends "Authorization: Bearer <CRON_SECRET>" when
//   CRON_SECRET is configured in the project's env vars. We require it in
//   production but allow unauthenticated requests in local dev (where
//   process.env.CRON_SECRET is unset) so curl testing works.
//
// LOOKBACK_HOURS mirrors the constant inside watcher/run.ts. If we change
// one, we should change both.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWatcherAgent } from "@/lib/agents/watcher/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOOKBACK_HOURS = 24;

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

  // ─── Run Watcher per tenant ─────────────────────────────────────
  // Sequential (not parallel) to avoid hammering Anthropic and to keep the
  // spend cap RPCs deterministic. Each tenant takes ~5-15s; for our scale
  // (single-digit active tenants in early stage) sequential is fine.
  // If/when this becomes slow, we can parallelize with a small concurrency
  // limit (e.g. 3 at a time via p-limit or similar).
  let succeeded = 0;
  let failed = 0;
  let noOp = 0;

  for (const tenantId of uniqueTenantIds) {
    try {
      const result = await runWatcherAgent(tenantId, "scheduled");
      if (result.status === "succeeded") succeeded += 1;
      else if (result.status === "no_op") noOp += 1;
      else failed += 1;
    } catch (err) {
      console.error("[cron-watcher] Watcher run failed", {
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      failed += 1;
    }
  }

  return NextResponse.json({
    status: "ok",
    tenants_processed: uniqueTenantIds.length,
    succeeded,
    no_op: noOp,
    failed,
  });
}
