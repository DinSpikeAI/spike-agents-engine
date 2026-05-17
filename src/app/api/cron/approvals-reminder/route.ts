// src/app/api/cron/approvals-reminder/route.ts
//
// Sprint 3J (2026-05-17) — Approvals pile-up WhatsApp reminder.
//
// FOURTH Iron-Rule §15.25 owner-self loopback carve-out. The three earlier:
//   - Morning daily summary (Sprint 3M, §10.39) — daily 07:00 IL
//   - Watcher critical/high alerts (Sprint 3X, §10.41) — daily after Watcher run
//   - Manager weekly digest (Sprint 3Y, §10.42; now Sprint 3Z Inngest) — Sunday 08:00 IL
//
// This adds: weekday afternoon "you have N drafts waiting" ping when the
// owner's approval inbox piles up. Threshold = 5 pending drafts older than
// 1 hour. Dedupe = no ping if one was sent in the last 6h.
//
// Real-data trigger: Sprint 3F Spike Impact widget (shipped earlier today,
// §10.50 TBD) revealed the demo tenant had 19 drafts created and 1 approved
// in the last 7 days — a 5% approval rate. The bottleneck to Spike's value
// delivery isn't draft quality (§10.40 confirmed native-voice drafts on
// first generation); it's owners forgetting to visit /approvals. A daily
// nudge closes that gap.
//
// Iron Rule §15.25 compliance: this message goes from Spike TO the owner.
// It is NOT a customer-facing send. No [אשר] approval step required.
//
// ─────────────────────────────────────────────────────────────
// Method = GET per §15.34. Vercel Cron sends GET requests; exporting POST
// produces a silent 405 that no one sees until they check trigger_source
// in agent_runs and find zero scheduled rows for weeks. (See Inventory
// cron silent-405 saga, §10.46.)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  lookupWhatsAppIntegration,
  wasContactedInLast24h,
  mapSendErrorToHebrew,
} from "@/lib/whatsapp/helpers";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Tunables — kept inline (not env vars) because they're product decisions,
// not deployment config. Adjust here when usage patterns reveal a better
// threshold or cadence.
const PENDING_DRAFTS_THRESHOLD = 5;
const MIN_AGE_MINUTES = 60; // ignore drafts created in the last hour — owner may be reviewing them right now
const DEDUPE_WINDOW_HOURS = 6;
const APPROVALS_URL = "https://app.spikeai.co.il/dashboard/approvals";

interface TenantRow {
  id: string;
  name: string | null;
  config: Record<string, unknown> | null;
}

interface SendOutcome {
  tenantId: string;
  pendingCount: number;
  skipped?: "no-integration" | "outside-24h" | "deduped" | "below-threshold";
  sent?: boolean;
  errorHebrew?: string;
}

export async function GET(request: Request) {
  // Cron auth — same Bearer pattern as every other cron route.
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const startedAt = Date.now();

  // Fetch all active tenants. Same shape as other crons; we'll filter to
  // ones with WhatsApp integration inline (lookupWhatsAppIntegration
  // returns null if the tenant has no active wa_business_account row).
  const { data: tenants, error: tenantsError } = await db
    .from("tenants")
    .select("id, name, config")
    .eq("status", "active");

  if (tenantsError) {
    console.error(
      "[approvals-reminder] tenants fetch failed:",
      tenantsError,
    );
    return NextResponse.json(
      { error: "tenants fetch failed", details: tenantsError.message },
      { status: 500 },
    );
  }

  if (!tenants || tenants.length === 0) {
    return NextResponse.json({
      ok: true,
      tenantsProcessed: 0,
      durationMs: Date.now() - startedAt,
    });
  }

  // Process tenants in parallel chunks of 5 (mirrors Morning + Watcher
  // patterns from §10.39/§10.41). Each tenant's pipeline is independent,
  // so failures don't cascade.
  const outcomes: SendOutcome[] = [];
  const CHUNK_SIZE = 5;

  for (let i = 0; i < tenants.length; i += CHUNK_SIZE) {
    const chunk = tenants.slice(i, i + CHUNK_SIZE);
    const chunkOutcomes = await Promise.allSettled(
      chunk.map((tenant) =>
        processTenant(db, tenant as TenantRow),
      ),
    );
    for (const result of chunkOutcomes) {
      if (result.status === "fulfilled") {
        outcomes.push(result.value);
      } else {
        console.error(
          "[approvals-reminder] tenant crash:",
          result.reason,
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    tenantsProcessed: tenants.length,
    sent: outcomes.filter((o) => o.sent).length,
    skippedNoIntegration: outcomes.filter(
      (o) => o.skipped === "no-integration",
    ).length,
    skippedBelowThreshold: outcomes.filter(
      (o) => o.skipped === "below-threshold",
    ).length,
    skippedOutside24h: outcomes.filter((o) => o.skipped === "outside-24h")
      .length,
    skippedDeduped: outcomes.filter((o) => o.skipped === "deduped").length,
    errors: outcomes.filter((o) => o.errorHebrew).length,
    durationMs: Date.now() - startedAt,
  });
}

async function processTenant(
  db: ReturnType<typeof createAdminClient>,
  tenant: TenantRow,
): Promise<SendOutcome> {
  const tenantId = tenant.id;

  // ─────────────────────────────────────────────────────────────
  // Step 1 — count pending drafts older than MIN_AGE_MINUTES
  // ─────────────────────────────────────────────────────────────
  const minAgeIso = new Date(
    Date.now() - MIN_AGE_MINUTES * 60 * 1000,
  ).toISOString();

  const { data: pendingDrafts, error: draftsError } = await db
    .from("drafts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .lt("created_at", minAgeIso);

  if (draftsError) {
    console.error(
      "[approvals-reminder] drafts query failed for tenant:",
      tenantId,
      draftsError,
    );
    return { tenantId, pendingCount: 0, errorHebrew: "DB query failed" };
  }

  const pendingCount = pendingDrafts?.length ?? 0;

  if (pendingCount < PENDING_DRAFTS_THRESHOLD) {
    return { tenantId, pendingCount, skipped: "below-threshold" };
  }

  // ─────────────────────────────────────────────────────────────
  // Step 2 — dedupe check: was a reminder already sent in the last
  // DEDUPE_WINDOW_HOURS? events table is the source of truth.
  // Column is `received_at` (matches the schema used by
  // wasContactedInLast24h in src/lib/whatsapp/helpers.ts).
  // ─────────────────────────────────────────────────────────────
  const dedupeWindowStart = new Date(
    Date.now() - DEDUPE_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: recentReminders } = await db
    .from("events")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("provider", "whatsapp")
    .eq("event_type", "approvals_reminder_sent")
    .gte("received_at", dedupeWindowStart)
    .limit(1);

  if (recentReminders && recentReminders.length > 0) {
    return { tenantId, pendingCount, skipped: "deduped" };
  }

  // ─────────────────────────────────────────────────────────────
  // Step 3 — WhatsApp integration lookup. The result is a discriminated
  // union { ok: true; phoneNumberId; accessToken } | { ok: false; reason }.
  // Narrow on `.ok` before accessing tokens.
  // ─────────────────────────────────────────────────────────────
  const integration = await lookupWhatsAppIntegration(db, tenantId);
  if (!integration.ok) {
    return { tenantId, pendingCount, skipped: "no-integration" };
  }

  // ─────────────────────────────────────────────────────────────
  // Step 4 — owner phone + 24h Meta window check. Owner phone lives
  // in `tenants.config.owner_phone` (NOT on the integration row, which
  // only holds the Meta WABA credentials). Same precondition as
  // Morning/Manager/Watcher: owner must have messaged Spike in the
  // last 24h or Meta rejects the outbound.
  // ─────────────────────────────────────────────────────────────
  const ownerPhone =
    typeof tenant.config?.owner_phone === "string" &&
    tenant.config.owner_phone.length > 0
      ? tenant.config.owner_phone
      : null;
  if (!ownerPhone) {
    return { tenantId, pendingCount, skipped: "no-integration" };
  }

  const withinWindow = await wasContactedInLast24h(
    db,
    tenantId,
    ownerPhone,
  );
  if (!withinWindow) {
    return { tenantId, pendingCount, skipped: "outside-24h" };
  }

  // ─────────────────────────────────────────────────────────────
  // Step 5 — compose + send. Message is intentionally short: a
  // glance-readable one-liner + the URL. No fluff. Hebrew RTL.
  // ─────────────────────────────────────────────────────────────
  const messageBody = buildReminderMessage(pendingCount);

  const sendResult = await sendWhatsAppMessage({
    toPhone: ownerPhone,
    messageBody,
    phoneNumberId: integration.phoneNumberId,
    accessToken: integration.accessToken,
  });

  if (!sendResult.ok) {
    const errorHebrew = mapSendErrorToHebrew(sendResult);
    console.error(
      "[approvals-reminder] send failed for tenant:",
      tenantId,
      sendResult.errorCategory,
      sendResult.errorMessage,
    );
    return { tenantId, pendingCount, errorHebrew };
  }

  // ─────────────────────────────────────────────────────────────
  // Step 6 — log the send to events for dedupe + analytics. Schema
  // matches the existing whatsapp_message_received events used by
  // wasContactedInLast24h (provider + received_at).
  //
  // Per §5.1: events.id is text NOT NULL with no default — caller
  // supplies. Webhook events use Meta's wamid; internal events use
  // a synthesized key `approvals_reminder_${tenantId}_${timestamp}`
  // for traceability + natural uniqueness.
  // ─────────────────────────────────────────────────────────────
  const now = new Date();
  const eventId = `approvals_reminder_${tenantId}_${now.getTime()}`;

  await db.from("events").insert({
    id: eventId,
    tenant_id: tenantId,
    provider: "whatsapp",
    event_type: "approvals_reminder_sent",
    received_at: now.toISOString(),
    payload: {
      pending_count: pendingCount,
      threshold: PENDING_DRAFTS_THRESHOLD,
      whatsapp_message_id: sendResult.whatsappMessageId,
    },
  });

  return { tenantId, pendingCount, sent: true };
}

/**
 * Build the Hebrew reminder message body.
 *
 * Format intentionally short — owners scan WhatsApp messages in 2-3 seconds
 * while doing other things. One line of context, one line with the URL.
 * No emoji-heavy preamble, no "Hi {name}, hope you're well" filler. The
 * owner already knows it's from Spike (it's coming via their WhatsApp
 * integration).
 *
 * Singular vs plural form is handled — Hebrew grammar matters even in a
 * quick ping. "1 טיוטה" not "1 טיוטות".
 */
function buildReminderMessage(pendingCount: number): string {
  const noun =
    pendingCount === 1 ? "טיוטה אחת מחכה" : `${pendingCount} טיוטות מחכות`;
  return `שלום! ${noun} לאישור שלך.\nלאישור והעברה ללקוחות:\n${APPROVALS_URL}`;
}
