// src/app/dashboard/demo/actions.ts
//
// Sub-stage 1.4 ΓÇö Demo action that simulates an incoming WhatsApp webhook.
//
// Why not call the real webhook over HTTP? Two reasons:
//   1. Avoids needing a NEXT_PUBLIC_BASE_URL env var.
//   2. Avoids HTTP roundtrip overhead and signature-verification setup.
//
// What we do instead: replicate the webhook's core logic ΓÇö insert events
// row + fire waitUntil(Watcher) + waitUntil(Hot Leads). The Hot Leads
// cascade to Sales QuickResponse (when bucket=hot/burning) is automatic
// because runHotLeadsOnEvent fires it itself. End result is functionally
// identical to a real Meta webhook delivery.
//
// IMPORTANT: This file uses "use server" directive. It can ONLY export
// async functions. Constants like DEMO_TEMPLATES are imported from
// @/lib/demo/types (a neutral module) ΓÇö defining them here would result
// in `undefined` when imported by client components.

"use server";

import { redirect } from "next/navigation";
import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOnboarded } from "@/lib/auth/require-onboarded";
import { runWatcherAgent } from "@/lib/agents/watcher/run";
import { runHotLeadsOnEvent } from "@/lib/agents/hot_leads/run";
import {
  DEMO_TEMPLATES,
  type DemoTemplate,
  type RunDemoTemplateResult,
} from "@/lib/demo/types";

const DEMO_ALLOWED_EMAILS = new Set(["din6915@gmail.com"]);

/**
 * Simulate an incoming WhatsApp webhook with the chosen template.
 * Returns { ok, eventId } on success ΓÇö the UI uses eventId to poll status.
 */
export async function runDemoTemplate(
  template: DemoTemplate
): Promise<RunDemoTemplateResult> {
  // Auth check ΓÇö same allowlist as the page.
  const { userEmail, tenantId } = await requireOnboarded();
  if (!DEMO_ALLOWED_EMAILS.has(userEmail)) {
    redirect("/dashboard");
  }

  const config = DEMO_TEMPLATES[template];
  if (!config) {
    return { ok: false, error: `Unknown template: ${template}` };
  }

  // Generate a fresh event id for each click ΓÇö prevents idempotency-skip.
  const eventId = `wamid.DEMO_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const receivedAtSec = Math.floor(Date.now() / 1000);

  const summary = `╫ö╫ò╫ô╫ó╫¬ WhatsApp ╫á╫¢╫á╫í╫ö ╫₧-${config.contactName}: ${
    config.text.length > 100 ? config.text.slice(0, 99) + "ΓÇª" : config.text
  }`;

  const payload = {
    summary,
    source: "whatsapp",
    whatsapp_message_id: eventId,
    whatsapp_phone_number_id: "DEMO_PHONE_NUMBER_ID",
    contact_name: config.contactName,
    contact_phone: config.contactPhone,
    raw_message: config.text,
    message_type: "text",
    received_at: receivedAtSec,
    is_demo: true, // mark for filtering / debugging later
  };

  // ΓöÇΓöÇΓöÇ Insert event ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const db = createAdminClient();
  const { error: insertError } = await db.from("events").insert({
    id: eventId,
    tenant_id: tenantId,
    provider: "whatsapp",
    event_type: "whatsapp_message_received",
    payload,
    // received_at uses default (now())
  });

  if (insertError) {
    console.error("[demo] events.insert failed:", insertError);
    return {
      ok: false,
      error: `╫⌐╫Æ╫Ö╫É╫ö ╫æ╫ö╫ò╫í╫ñ╫¬ event: ${insertError.message}`,
    };
  }

  // ΓöÇΓöÇΓöÇ Fire Watcher + Hot Leads in parallel (same as webhook) ΓöÇΓöÇΓöÇΓöÇ
  // Hot Leads will internally fire Sales QuickResponse cascade if
  // bucket Γêê {hot, burning}. We don't need to coordinate that here.
  waitUntil(
    runWatcherAgent(tenantId, "webhook").catch((err) => {
      console.error(`[demo] Watcher failed for event ${eventId}:`, err);
    })
  );

  waitUntil(
    runHotLeadsOnEvent(tenantId, eventId).catch((err) => {
      console.error(`[demo] Hot Leads failed for event ${eventId}:`, err);
    })
  );

  return { ok: true, eventId };
}
