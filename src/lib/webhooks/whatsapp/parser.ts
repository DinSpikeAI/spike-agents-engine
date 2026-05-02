// src/lib/webhooks/whatsapp/parser.ts
//
// Parses a Meta Cloud API webhook payload and extracts what Spike consumes.
//
// One webhook payload may contain multiple messages — Meta batches up to
// roughly 10 per delivery to reduce request volume. We extract each into a
// flat ExtractedWhatsAppMessage record so the route handler can iterate.
//
// Stage 1 only handles type="text" messages. Image/audio/video/etc. are
// silently ignored (returns empty array entry). When Reviews or Sales need
// to consume images, we'll extend the parser.

import type {
  WhatsAppWebhookPayload,
  ExtractedWhatsAppMessage,
} from "./types";

/**
 * Extract all text messages from a Meta webhook payload.
 *
 * Returns empty array (no error) if:
 *   - payload object isn't "whatsapp_business_account"
 *   - the change is a status update (delivery receipt), not a message
 *   - all messages are non-text types (Stage 1 only handles text)
 *   - the payload is malformed at any level
 *
 * The function never throws — webhook handlers must be resilient to garbage
 * input from third parties. Callers can rely on the return value alone.
 */
export function extractMessages(
  payload: WhatsAppWebhookPayload,
): ExtractedWhatsAppMessage[] {
  if (payload?.object !== "whatsapp_business_account") {
    return [];
  }

  const result: ExtractedWhatsAppMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const messages = change.value?.messages ?? [];
      const contacts = change.value?.contacts ?? [];
      const phoneNumberId = change.value?.metadata?.phone_number_id;

      if (!phoneNumberId) continue;

      for (const msg of messages) {
        // Stage 1: only text messages. Other types ignored.
        if (msg.type !== "text" || !msg.text?.body) continue;

        // Best-effort lookup of the sender's display name from the contacts list.
        // Falls back to the raw phone if the contact entry is missing.
        const contact = contacts.find((c) => c.wa_id === msg.from);
        const fromName = contact?.profile?.name ?? msg.from;

        const timestampNum = parseInt(msg.timestamp, 10);
        const timestamp = Number.isFinite(timestampNum)
          ? timestampNum
          : Math.floor(Date.now() / 1000);

        result.push({
          whatsappMessageId: msg.id,
          whatsappPhoneNumberId: phoneNumberId,
          fromPhone: msg.from,
          fromName,
          text: msg.text.body,
          timestamp,
          messageType: msg.type,
        });
      }
    }
  }

  return result;
}

/**
 * Generate a Hebrew summary for a WhatsApp message event.
 *
 * Stage 1 uses a generic template — the Watcher (Sub-stage 1.2) will classify
 * intent and may emit a more specific event (lead.new, complaint, review).
 *
 * The summary is what every customer-facing agent reads via
 * `events.payload.summary`. Length-capped to ~140 chars to keep prompts tight.
 */
export function buildHebrewSummary(msg: ExtractedWhatsAppMessage): string {
  const MAX_PREVIEW = 120;

  const preview =
    msg.text.length > MAX_PREVIEW
      ? msg.text.slice(0, MAX_PREVIEW - 1) + "…"
      : msg.text;

  return `הודעת WhatsApp נכנסה מ-${msg.fromName}: ${preview}`;
}
