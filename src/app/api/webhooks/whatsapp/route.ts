// src/app/api/webhooks/whatsapp/route.ts
//
// Meta Cloud API webhook endpoint for WhatsApp Business.
//
//   GET  → Meta's webhook verification handshake.
//          Returns the hub.challenge string if hub.verify_token matches our
//          WHATSAPP_VERIFY_TOKEN env var. This is how Meta confirms ownership
//          of the endpoint when we register it in the App Dashboard.
//
//   POST → Inbound message webhook. Meta delivers customer messages here.
//          We parse, dedupe by whatsapp_message_id (used as the events.id
//          PRIMARY KEY), write to events, and fire-and-forget the Watcher
//          classifier via waitUntil().
//
// IDEMPOTENCY: events.id is a text PRIMARY KEY supplied by the caller.
//   We use the WhatsApp message ID (e.g. "wamid.HBgL...") as id, which Meta
//   guarantees unique per message. If Meta retries a webhook (network blip,
//   our 5xx, etc.), the second insert hits the existing primary key and
//   throws Postgres error 23505 — we catch that as a no-op.
//   No separate index needed; the PK is the dedup mechanism.
//
// WATCHER TRIGGER: after a successful insert, we call runWatcherAgent via
//   waitUntil() so it executes after the response is sent back to Meta.
//   This prevents Meta's 5-second response timeout from cutting off the
//   ~10-15s LLM call. If this trigger fails (network, timeout, schema parse),
//   the failure is logged. The hourly cron at /api/cron/watcher catches any
//   missed classifications within an hour — see vercel.json.
//
// STAGE 1: WHATSAPP_APP_SECRET is unset → signature verification is bypassed,
//   so we can test with curl/Postman/the demo UI. The endpoint is reachable
//   at app.spikeai.co.il/api/webhooks/whatsapp.
//
// STAGE 2: WHATSAPP_APP_SECRET is set → real Meta-signed payloads required.
//
// Multi-tenancy NOTE (Stage 1): every incoming message currently routes to
//   DEMO_TENANT_ID. The phone_number_id → tenant_id mapping is deferred to
//   Stage 2 once we decide the schema for the `integrations` table (the
//   current schema has no `credentials` JSONB column). For demo/testing,
//   X-Spike-Tenant-Override header lets you direct messages to any tenant.

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyMetaSignature } from "@/lib/webhooks/whatsapp/signature";
import {
  extractMessages,
  buildHebrewSummary,
} from "@/lib/webhooks/whatsapp/parser";
import { runWatcherAgent } from "@/lib/agents/watcher/run";
import type { WhatsAppWebhookPayload } from "@/lib/webhooks/whatsapp/types";

// We need Node runtime for crypto.createHmac in signature verification.
// (Default is "nodejs" but being explicit prevents accidental edge migration.)
export const runtime = "nodejs";

// Don't cache anything — every webhook is unique.
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/**
 * Demo tenant ID — the universal fallback in Stage 1 (every message lands
 * here). Once Stage 2 lands a real integrations schema, this becomes a true
 * fallback for unmapped phone_number_ids only. From CLAUDE.md §5.4.
 */
const DEMO_TENANT_ID = "15ef2c6e-a064-49bf-9455-217ba937ccf2";

/**
 * Meta verification token — must match what we configure in Meta App Dashboard.
 * In Stage 1 testing, a known string is fine. In Stage 2 production, set
 * WHATSAPP_VERIFY_TOKEN in Vercel to a strong random value.
 */
const META_VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN ?? "spike-engine-stage-1-token";

// ─────────────────────────────────────────────────────────────
// GET — Meta verification handshake
// ─────────────────────────────────────────────────────────────
//
// Meta calls this once when the webhook is registered, with query params:
//   hub.mode=subscribe
//   hub.verify_token=<our token>
//   hub.challenge=<random string Meta wants echoed back>
//
// We respond with the challenge as plain text if the token matches.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === META_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// ─────────────────────────────────────────────────────────────
// POST — Inbound WhatsApp message handler
// ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Read the raw body — necessary because signature verification requires
  // the exact bytes Meta signed. JSON.stringify(parsedBody) wouldn't match.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  // Stage 1 mode: no WHATSAPP_APP_SECRET → verifyMetaSignature returns true.
  // Stage 2 mode: returns false unless Meta-signed.
  if (!verifyMetaSignature(rawBody, signature)) {
    console.warn("[whatsapp-webhook] Invalid signature — rejecting request");
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 },
    );
  }

  // Parse JSON. Malformed → 400, but log so we notice if Meta changes format.
  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.warn("[whatsapp-webhook] Malformed JSON body", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Extract messages. Empty array is fine (e.g. payload was a status update).
  const messages = extractMessages(payload);
  if (messages.length === 0) {
    return NextResponse.json(
      { status: "ok", processed: 0 },
      { status: 200 },
    );
  }

  // Demo override: pin all messages in this request to a specific tenant.
  // Used by the demo UI (Sub-stage 1.4) and curl testing.
  const tenantOverride = request.headers.get("x-spike-tenant-override");

  const supabase = createAdminClient();

  let inserted = 0;
  let skippedDuplicates = 0;
  let errored = 0;

  // Track which tenants had at least one fresh insert — we trigger Watcher
  // once per tenant per request, not once per message. (If a single batch
  // contains 5 messages for the same tenant, one Watcher run sees them all.)
  const tenantsToTrigger = new Set<string>();

  for (const msg of messages) {
    // Stage 1: every message lands on DEMO_TENANT_ID unless explicitly
    // overridden via header. Stage 2 will reintroduce phone_number_id-based
    // tenant resolution against a finalized integrations schema.
    const tenantId = tenantOverride ?? DEMO_TENANT_ID;

    const summary = buildHebrewSummary(msg);

    // Build the canonical event payload. Note: PII (contact_phone, raw_message)
    // is stored as-is here; the safety pipeline scrubs it later when an agent
    // reads from this event. See CLAUDE.md §1.5 and §6.4.
    const eventPayload = {
      summary,
      source: "whatsapp",
      whatsapp_message_id: msg.whatsappMessageId,
      whatsapp_phone_number_id: msg.whatsappPhoneNumberId,
      contact_name: msg.fromName,
      contact_phone: msg.fromPhone,
      raw_message: msg.text,
      message_type: msg.messageType,
      received_at: msg.timestamp,
    };

    // events.id is a TEXT PRIMARY KEY supplied by the caller — it's the
    // natural idempotency key for this event. We use the WhatsApp message ID
    // (e.g. "wamid.HBgL...") which Meta guarantees globally unique per
    // message. A retry from Meta will collide on the PK and surface as
    // Postgres error 23505, which we catch below as skippedDuplicates.
    //
    // event_type follows the snake_case convention used by all existing
    // event types in the DB (lead_received, review_received, message_received,
    // etc.). We use whatsapp_message_received here, not "whatsapp.message".
    //
    // Schema (verified 2026-05-02): id text NOT NULL, tenant_id uuid,
    // provider text, event_type text, payload jsonb, received_at timestamptz.
    const { error } = await supabase
      .from("events")
      .insert({
        id: msg.whatsappMessageId,
        tenant_id: tenantId,
        provider: "whatsapp",
        event_type: "whatsapp_message_received",
        payload: eventPayload,
      });

    if (error) {
      // Postgres unique violation — idempotency win, not a real error.
      // (Triggered when Meta retries the same wamid.)
      if (error.code === "23505") {
        skippedDuplicates += 1;
        continue;
      }
      // Anything else: log but don't fail the whole batch.
      // Returning non-2xx to Meta triggers retry storms.
      console.error("[whatsapp-webhook] Insert failed", {
        error,
        whatsappMessageId: msg.whatsappMessageId,
      });
      errored += 1;
      continue;
    }

    inserted += 1;
    tenantsToTrigger.add(tenantId);
  }

  // ─── Fire-and-forget Watcher trigger ─────────────────────────────
  // For each tenant that received a fresh event in this batch, kick off
  // runWatcherAgent in the background. waitUntil() extends the function
  // context past the response, so the LLM call doesn't get cut off when
  // we return 200 to Meta within the 5-second window.
  //
  // Failures are logged and forgotten — the hourly cron at
  // /api/cron/watcher will catch any missed classification within an hour.
  for (const tenantId of tenantsToTrigger) {
    waitUntil(
      runWatcherAgent(tenantId, "webhook").catch((err) => {
        console.error("[whatsapp-webhook] Watcher trigger failed", {
          tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
      }),
    );
  }

  // Always return 200 to Meta. Internal failures are logged, never surfaced
  // to the webhook caller — Meta retries aggressively on 5xx.
  return NextResponse.json(
    {
      status: "ok",
      processed: messages.length,
      inserted,
      skipped_duplicates: skippedDuplicates,
      errored,
      watcher_triggered: tenantsToTrigger.size,
    },
    { status: 200 },
  );
}
