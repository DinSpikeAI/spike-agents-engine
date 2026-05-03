// src/app/api/demo/status/route.ts
//
// Sub-stage 1.4 — Polling endpoint for Demo UI.
//
// Given an event_id, returns the current state of the pipeline:
//   - watcher_run: latest watcher agent_run for this tenant since event was created
//   - hot_leads_row: hot_leads row keyed by event_id
//   - sales_qr_draft: drafts row with type=sales_quick_response and context.event_id=X
//
// Polled every ~1s by the Demo UI until all three reach terminal states
// (succeeded / failed / no_op / cascade_skipped). Read-only.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOnboarded } from "@/lib/auth/require-onboarded";
import type { DemoStatusResponse } from "@/lib/demo/types";

const DEMO_ALLOWED_EMAILS = new Set(["din6915@gmail.com"]);

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Auth check — same allowlist.
  const { userEmail, tenantId } = await requireOnboarded();
  if (!DEMO_ALLOWED_EMAILS.has(userEmail)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const eventId = req.nextUrl.searchParams.get("event_id");
  if (!eventId) {
    return NextResponse.json(
      { ok: false, error: "event_id is required" },
      { status: 400 }
    );
  }

  const db = createAdminClient();

  // ─── Load event ──────────────────────────────────────────
  const { data: event } = await db
    .from("events")
    .select("id, received_at")
    .eq("id", eventId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!event) {
    return NextResponse.json<DemoStatusResponse>({
      ok: true,
      event: null,
      watcher: { status: null, cost_ils: null, finished_at: null },
      hot_leads: {
        bucket: null,
        reason: null,
        suggested_action: null,
        classified_at: null,
      },
      sales_qr: { status: null, draft_id: null, message_text: null },
    });
  }

  // ─── Watcher status ──────────────────────────────────────
  // Watcher doesn't have a direct event_id reference (it batches recent
  // events). We find the most recent watcher run for this tenant that
  // started at or after the event's received_at (with a 1s buffer for
  // clock skew).
  const watcherSinceIso = new Date(
    new Date(event.received_at).getTime() - 1000
  ).toISOString();

  const { data: watcherRun } = await db
    .from("agent_runs")
    .select("status, cost_actual_ils, cost_estimate_ils, finished_at")
    .eq("tenant_id", tenantId)
    .eq("agent_id", "watcher")
    .eq("trigger_source", "webhook")
    .gte("started_at", watcherSinceIso)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ─── Hot Leads classification ────────────────────────────
  // One-to-one match via event_id. Returns null if Hot Leads hasn't yet
  // inserted a row for this event.
  const { data: hotLeadRow } = await db
    .from("hot_leads")
    .select("bucket, reason, suggested_action, created_at")
    .eq("tenant_id", tenantId)
    .eq("event_id", eventId)
    .maybeSingle();

  // ─── Sales QuickResponse draft ───────────────────────────
  const { data: salesDraft } = await db
    .from("drafts")
    .select("id, content")
    .eq("tenant_id", tenantId)
    .eq("agent_id", "sales")
    .eq("type", "sales_quick_response")
    .filter("context->>event_id", "eq", eventId)
    .maybeSingle();

  // ─── Derive Sales QR status ──────────────────────────────
  // Logic mirrors what runHotLeadsOnEvent does (cascade only on hot/burning):
  //   - hot_leads not classified yet         → "pending_classification"
  //   - hot_leads classified, bucket cold/warm/spam → "skipped_cold_bucket"
  //   - hot_leads bucket=hot/burning, no draft yet → "drafting"
  //   - draft exists                         → "draft_ready"
  const CASCADE_BUCKETS = ["hot", "burning"];

  let salesQrStatus: DemoStatusResponse["sales_qr"]["status"] = null;
  if (!hotLeadRow) {
    salesQrStatus = "pending_classification";
  } else if (
    hotLeadRow.bucket &&
    !CASCADE_BUCKETS.includes(hotLeadRow.bucket)
  ) {
    salesQrStatus = "skipped_cold_bucket";
  } else if (
    hotLeadRow.bucket &&
    CASCADE_BUCKETS.includes(hotLeadRow.bucket)
  ) {
    salesQrStatus = salesDraft ? "draft_ready" : "drafting";
  }

  const draftContent = salesDraft?.content as Record<string, unknown> | null;
  const messageText =
    typeof draftContent?.["messageHebrew"] === "string"
      ? (draftContent["messageHebrew"] as string)
      : null;

  return NextResponse.json<DemoStatusResponse>({
    ok: true,
    event: {
      id: event.id,
      received_at: event.received_at,
    },
    watcher: {
      status: (watcherRun?.status as DemoStatusResponse["watcher"]["status"]) ?? null,
      cost_ils:
        watcherRun?.cost_actual_ils ?? watcherRun?.cost_estimate_ils ?? null,
      finished_at: watcherRun?.finished_at ?? null,
    },
    hot_leads: {
      bucket: hotLeadRow?.bucket ?? null,
      reason: hotLeadRow?.reason ?? null,
      suggested_action: hotLeadRow?.suggested_action ?? null,
      classified_at: hotLeadRow?.created_at ?? null,
    },
    sales_qr: {
      status: salesQrStatus,
      draft_id: salesDraft?.id ?? null,
      message_text: messageText,
    },
  });
}
