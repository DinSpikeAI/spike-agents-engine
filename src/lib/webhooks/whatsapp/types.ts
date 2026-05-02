// src/lib/webhooks/whatsapp/types.ts
//
// Type definitions for Meta Cloud API webhook payloads.
//
// Reference:
//   https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
//
// We define only what Spike actually consumes today. Meta's payload has many
// optional fields (media, location, contacts, interactive replies, reactions);
// we'll add them when an agent needs them. Keeping the surface area small
// avoids false security from "well-typed garbage".

// ─────────────────────────────────────────────────────────────
// Top-level webhook payload
// ─────────────────────────────────────────────────────────────

export interface WhatsAppWebhookPayload {
  object: "whatsapp_business_account";
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  /** Meta WhatsApp Business Account ID */
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: WhatsAppChangeValue;
  /** "messages" for inbound texts; "statuses" for delivery receipts; we only handle "messages" */
  field: "messages" | "statuses" | string;
}

export interface WhatsAppChangeValue {
  messaging_product: "whatsapp";
  metadata: WhatsAppMetadata;
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  /** Delivery receipts — ignored in Stage 1 */
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppMetadata {
  /** E.g. "972501234567" (no plus sign) */
  display_phone_number: string;
  /** Meta's internal ID for this business phone — used for tenant mapping */
  phone_number_id: string;
}

export interface WhatsAppContact {
  profile: { name: string };
  /** Contact's WhatsApp ID — usually their phone without "+" */
  wa_id: string;
}

export interface WhatsAppMessage {
  /** Sender's phone, e.g. "972501234567" */
  from: string;
  /** Unique message ID, e.g. "wamid.HBgL..." — used for idempotency */
  id: string;
  /** Unix timestamp as string */
  timestamp: string;
  /** Stage 1 only handles "text"; the others are listed for future expansion */
  type:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "location"
    | "contacts"
    | "interactive"
    | "button"
    | "reaction"
    | "sticker"
    | "system"
    | "unknown";
  text?: { body: string };
  // Other typed payloads omitted for now — add as agents need them.
}

export interface WhatsAppStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
}

// ─────────────────────────────────────────────────────────────
// Internal extracted message — what the parser hands to the route
// ─────────────────────────────────────────────────────────────

export interface ExtractedWhatsAppMessage {
  whatsappMessageId: string;
  whatsappPhoneNumberId: string;
  fromPhone: string;
  fromName: string;
  text: string;
  /** Unix timestamp in seconds */
  timestamp: number;
  messageType: WhatsAppMessage["type"];
}
