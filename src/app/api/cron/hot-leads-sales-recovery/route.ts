/**
 * Hot Leads + Sales QR Recovery Cron — Sub-stage 1.5.2
 *
 * Schedule: 0 2 * * * UTC (~05:00 IL summer / 04:00 IL winter)
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Why this exists:
 *   The primary path for Hot Leads + Sales QR is the WhatsApp webhook
 *   (real-time, ~15-16s end-to-end). But webhook calls can fail:
 *     - Vercel cold-start timeout (30s hard limit)
 *     - Network blips
 *     - Anthropic API outages mid-cascade
 *     - waitUntil() task killed before completion
 *
 *   Watcher already has a webhook+cron-fallback pattern (1.2). This route
 *   extends that pattern to Hot Leads + Sales QR.
 *
 * Vercel Hobby tier constraint:
 *   Hobby = max 1 cron run/day per project. To fit the limit, this single
 *   endpoint runs once daily and handles BOTH stages: Hot Leads recovery
 *   (Stage 1) and Sales QR recovery (Stage 2).
 *
 * Window: 48 hours back (overlap protects against missed cron days).
 * Cap: 50 events max per run (prevents spike-of-cost if backlog).
 *
 * Idempotency layers (no risk of duplicate inserts):
 *   1. events.id is PRIMARY KEY (text) — already idempotent
 *   2. hot_leads.event_id has partial UNIQUE — second insert blocked
 *   3. drafts filtered on (tenant_id, agent_id, type, context.event_id)
 *
 * Always returns HTTP 200 (even on partial failure) — non-200 triggers
 * Vercel cron retry, undesired for fallback recovery.
 *
 * Best-effort logging: console.log only. No agent_runs row at the cron
 * level (this is recovery, not a primary agent invocation; the wrapped
 * functions create their own agent_runs rows internally).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runHotLeadsOnEvent } from "@/lib/agents/hot_leads/run";
import { runSalesQuickResponseOnEvent } from "@/lib/agents/sales/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — covers up to 50 LLM calls × ~6s

const WINDOW_HOURS = 48;
const MAX_EVENTS_PER_RUN = 50;

interface RecoveryStats {
  windowStart: string;
  hotLeadsScanned: number;
  hotLeadsRecovered: number;
  hotLeadsSkippedAlreadyClassified: number;
  hotLeadsSkippedNoMessage: number;
  hotLeadsErrors: number;
  hotLeadsCappedAt: number;
  salesQrScanned: number;
  salesQrRecovered: number;
  salesQrSkippedDuplicate: number;
  salesQrSkippedNoMessage: number;
  salesQrErrors: number;
  salesQrCappedAt: number;
  durationMs: number;
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  // ─── Auth check ───────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  // If CRON_SECRET unset (local dev), allow through.

  const db = createAdminClient();
  const windowStart = new Date(
    Date.now() - WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  const stats: RecoveryStats = {
    windowStart,
    hotLeadsScanned: 0,
    hotLeadsRecovered: 0,
    hotLeadsSkippedAlreadyClassified: 0,
    hotLeadsSkippedNoMessage: 0,
    hotLeadsErrors: 0,
    hotLeadsCappedAt: MAX_EVENTS_PER_RUN,
    salesQrScanned: 0,
    salesQrRecovered: 0,
    salesQrSkippedDuplicate: 0,
    salesQrSkippedNoMessage: 0,
    salesQrErrors: 0,
    salesQrCappedAt: MAX_EVENTS_PER_RUN,
    durationMs: 0,
  };

  // ───────────────────────────────────────────────────────────
  // STAGE 1: Hot Leads recovery
  // ───────────────────────────────────────────────────────────
  // Find events from the last 48h that are WhatsApp messages but have
  // no matching hot_leads row. These are events the webhook tried to
  // classify but failed (or the cascade was killed before insert).
  //
  // We use a fetch-then-filter approach: pull candidate events, then
  // filter client-side against hot_leads.event_id. This is simpler than
  // building a NOT EXISTS in PostgREST, and the cap (50) keeps it small.

  try {
    const { data: candidateEvents, error: eventsError } = await db
      .from("events")
      .select("id, tenant_id, payload, received_at")
      .eq("provider", "whatsapp")
      .eq("event_type", "whatsapp_message_received")
      .gte("received_at", windowStart)
      .order("received_at", { ascending: false })
      .limit(MAX_EVENTS_PER_RUN * 3); // overshoot — we'll filter

    if (eventsError) {
      console.error(
        "[hot-leads-sales-recovery] Failed to fetch candidate events:",
        eventsError
      );
    } else if (candidateEvents && candidateEvents.length > 0) {
      // Fetch hot_leads.event_id for the candidate event IDs
      const candidateIds = candidateEvents.map((e) => e.id);
      const { data: existingHotLeads } = await db
        .from("hot_leads")
        .select("event_id")
        .in("event_id", candidateIds);

      const handledEventIds = new Set(
        (existingHotLeads ?? []).map((hl) => hl.event_id).filter(Boolean)
      );

      // Filter to events that have NO matching hot_leads row
      const orphanedEvents = candidateEvents.filter(
        (e) => !handledEventIds.has(e.id)
      );

      stats.hotLeadsScanned = orphanedEvents.length;

      // Cap at MAX_EVENTS_PER_RUN
      const toProcess = orphanedEvents.slice(0, MAX_EVENTS_PER_RUN);

      console.log(
        `[hot-leads-sales-recovery] Stage 1 (Hot Leads): ${orphanedEvents.length} orphaned events found, processing ${toProcess.length}`
      );

      // Run recovery sequentially to control LLM rate
      for (const event of toProcess) {
        try {
          // runHotLeadsOnEvent returns HotLeadsOnEventResult:
          //   { skipped, skipReason, leadId, runResult, salesCascadeFired }
          // It does NOT have a top-level .status field.
          const result = await runHotLeadsOnEvent(event.tenant_id, event.id);

          if (result.skipped) {
            // Race-safe: another run beat us, or no_raw_message. Either way, fine.
            if (result.skipReason === "already_classified") {
              stats.hotLeadsSkippedAlreadyClassified += 1;
            } else if (result.skipReason === "no_raw_message") {
              stats.hotLeadsSkippedNoMessage += 1;
            }
            console.log(
              `[hot-leads-sales-recovery] Hot Leads recovery for event ${event.id.slice(
                0,
                12
              )} skipped: ${result.skipReason}`
            );
          } else if (
            result.runResult &&
            result.runResult.status === "succeeded"
          ) {
            stats.hotLeadsRecovered += 1;
            // If the recovery itself fired the Sales cascade (bucket=hot/burning),
            // log that too — Stage 2 below would skip these as duplicates.
            if (result.salesCascadeFired) {
              console.log(
                `[hot-leads-sales-recovery] Hot Leads recovery fired Sales cascade for event ${event.id.slice(0, 12)}`
              );
            }
          } else {
            // ran but failed/no_op — count as recovered attempted, not error
            console.log(
              `[hot-leads-sales-recovery] Hot Leads recovery for event ${event.id.slice(
                0,
                12
              )}: ${result.runResult?.status ?? "unknown"}`
            );
          }
        } catch (err) {
          stats.hotLeadsErrors += 1;
          console.error(
            `[hot-leads-sales-recovery] Hot Leads recovery FAILED for event ${event.id.slice(
              0,
              12
            )}:`,
            err instanceof Error ? err.message : err
          );
          // Continue to next event — one failure doesn't stop the cron
        }
      }
    } else {
      console.log(
        "[hot-leads-sales-recovery] Stage 1 (Hot Leads): no candidate events"
      );
    }
  } catch (err) {
    console.error(
      "[hot-leads-sales-recovery] Stage 1 (Hot Leads) outer error:",
      err
    );
    // Continue to Stage 2
  }

  // ───────────────────────────────────────────────────────────
  // STAGE 2: Sales QR recovery
  // ───────────────────────────────────────────────────────────
  // Find hot_leads with bucket in {hot, burning} from last 48h that have
  // no matching sales_quick_response draft. These are leads where Hot
  // Leads classified successfully but the Sales QR cascade failed.
  //
  // Note: events recovered in Stage 1 above with bucket=hot/burning will
  // have already fired Sales QR via the cascade, so they'll be filtered
  // out here naturally.

  try {
    const { data: candidateLeads, error: leadsError } = await db
      .from("hot_leads")
      .select("id, tenant_id, event_id, bucket, received_at")
      .in("bucket", ["hot", "burning"])
      .not("event_id", "is", null)
      .gte("received_at", windowStart)
      .order("received_at", { ascending: false })
      .limit(MAX_EVENTS_PER_RUN * 3);

    if (leadsError) {
      console.error(
        "[hot-leads-sales-recovery] Failed to fetch candidate leads:",
        leadsError
      );
    } else if (candidateLeads && candidateLeads.length > 0) {
      // PostgREST jsonb filter: drafts.context->>'event_id' IN (...)
      // We can't directly IN-filter a jsonb path, so fetch all
      // sales_quick_response drafts in window and filter client-side.
      const { data: existingDrafts } = await db
        .from("drafts")
        .select("context")
        .eq("agent_id", "sales")
        .eq("type", "sales_quick_response")
        .gte("created_at", windowStart);

      const handledEventIds = new Set(
        (existingDrafts ?? [])
          .map(
            (d) =>
              (d.context as Record<string, unknown> | null)?.["event_id"] as
                | string
                | undefined
          )
          .filter(Boolean) as string[]
      );

      const orphanedLeads = candidateLeads.filter(
        (l) => l.event_id && !handledEventIds.has(l.event_id)
      );

      stats.salesQrScanned = orphanedLeads.length;

      const toProcess = orphanedLeads.slice(0, MAX_EVENTS_PER_RUN);

      console.log(
        `[hot-leads-sales-recovery] Stage 2 (Sales QR): ${orphanedLeads.length} orphaned hot/burning leads found, processing ${toProcess.length}`
      );

      for (const lead of toProcess) {
        if (!lead.event_id) continue;

        try {
          // runSalesQuickResponseOnEvent returns SalesQuickResponseResult:
          //   { runId, draftId, status }
          // status: "succeeded" | "no_op" | "failed" | "skipped_duplicate" | "skipped_no_message"
          const result = await runSalesQuickResponseOnEvent(
            lead.tenant_id,
            lead.event_id
          );

          if (result.status === "succeeded") {
            stats.salesQrRecovered += 1;
          } else if (result.status === "skipped_duplicate") {
            stats.salesQrSkippedDuplicate += 1;
          } else if (result.status === "skipped_no_message") {
            stats.salesQrSkippedNoMessage += 1;
          } else if (result.status === "failed") {
            stats.salesQrErrors += 1;
            console.warn(
              `[hot-leads-sales-recovery] Sales QR recovery returned 'failed' for event ${lead.event_id.slice(0, 12)}`
            );
          }
          // 'no_op' is also a valid outcome — message_text empty, log only
          if (result.status === "no_op") {
            console.log(
              `[hot-leads-sales-recovery] Sales QR recovery 'no_op' for event ${lead.event_id.slice(0, 12)}`
            );
          }
        } catch (err) {
          stats.salesQrErrors += 1;
          console.error(
            `[hot-leads-sales-recovery] Sales QR recovery FAILED for lead ${lead.id.slice(
              0,
              12
            )}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    } else {
      console.log(
        "[hot-leads-sales-recovery] Stage 2 (Sales QR): no candidate leads"
      );
    }
  } catch (err) {
    console.error(
      "[hot-leads-sales-recovery] Stage 2 (Sales QR) outer error:",
      err
    );
  }

  // ───────────────────────────────────────────────────────────
  // Finalize
  // ───────────────────────────────────────────────────────────
  stats.durationMs = Date.now() - startedAt;

  console.log("[hot-leads-sales-recovery] Run complete:", stats);

  // Always 200 — Vercel cron retries on non-200, undesired for recovery
  return NextResponse.json(
    {
      ok: true,
      stats,
    },
    { status: 200 }
  );
}
