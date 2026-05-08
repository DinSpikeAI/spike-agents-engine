// src/lib/whatsapp/types.ts
//
// Sub-stage 1.15.3 (Sprint 2 Batch 2C) — outbound WhatsApp send types.
//
// Note on layout: there is also `src/lib/webhooks/whatsapp/` which holds
// types for INBOUND messages (webhook receiver). These two are kept in
// separate folders deliberately because the surface area is different —
// inbound deals with verification tokens, signature validation, payload
// parsing; outbound deals with phone number IDs, access tokens, message
// templates. Mixing them would tempt callers to import the wrong shape.

/**
 * High-level category of a Meta Cloud API send error. The Hebrew error
 * surface for the user is derived from this — see `mapSendErrorToHebrew`
 * in growth/actions.ts (or wherever it ends up being shared in 2D).
 *
 * Categories:
 *   - "auth": 401 / token expired / token revoked. Needs operator action;
 *     no point retrying.
 *   - "template_required": 131026 / 131051 — recipient is outside the 24h
 *     customer-initiated window, so freeform text is rejected. We catch
 *     this BEFORE the API call (via `wasContactedInLast24h`), but Meta
 *     can still surface it if our 24h check returns a false positive
 *     (e.g. clock skew, edge cases).
 *   - "invalid_number": 131000 / 131005 / 131009 — number not registered
 *     on WhatsApp. Permanent for that number.
 *   - "rate_limit": 4xx 80007 / 130429 — slow down. We don't auto-retry
 *     these; Growth approvals are user-paced anyway.
 *   - "transient": 5xx + network/timeout. Retried internally by send.ts
 *     up to 2 times with exponential backoff before being surfaced.
 *   - "unknown": anything else. Surface Meta's message verbatim plus a
 *     generic Hebrew prefix.
 */
export type MetaErrorCategory =
  | "auth"
  | "template_required"
  | "invalid_number"
  | "rate_limit"
  | "transient"
  | "unknown";

/**
 * Input contract for a single outbound text message. Keep this minimal —
 * any per-tenant context (token, phone_number_id) is the caller's
 * responsibility to look up. send.ts is a pure transport layer.
 */
export interface SendWhatsAppMessageInput {
  /**
   * Recipient phone. Accepted in any of the common Israeli formats
   * (+972..., 972..., 0541234567); send.ts normalizes to E.164 without
   * the leading `+` (which is what Meta Cloud API expects).
   */
  toPhone: string;

  /** UTF-8 message text. Meta limit is 4,096 characters; we cap at 2,000
   *  upstream in the draft editor for UX reasons. */
  messageBody: string;

  /** From `integrations.metadata.phone_number_id` — Meta's ID for the
   *  business phone number that's sending. NOT the human-readable number. */
  phoneNumberId: string;

  /** From `integrations.metadata.access_token`. Plain text in DB for now;
   *  vault encryption is pre-launch debt. */
  accessToken: string;
}

/**
 * Discriminated union for the result. `ok: true` carries the WhatsApp
 * message ID (`wamid.HBgM...`) which downstream code may store for
 * reply correlation (future work — see growth_outcomes notes).
 */
export type SendWhatsAppMessageResult =
  | {
      ok: true;
      whatsappMessageId: string | null;
    }
  | {
      ok: false;
      errorCategory: MetaErrorCategory;
      errorMessage: string;
      /** Meta's numeric error code as a string (e.g. "131051"), or HTTP
       *  status code as fallback (e.g. "500"), or null if no Meta payload. */
      metaCode: string | null;
    };
