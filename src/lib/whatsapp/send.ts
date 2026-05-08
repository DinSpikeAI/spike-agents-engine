// src/lib/whatsapp/send.ts
//
// Sub-stage 1.15.3 (Sprint 2 Batch 2C) — outbound WhatsApp text-message
// transport. Pure function, no Spike-specific logic. The caller (e.g.
// `approveGrowthCandidate` in actions/growth.ts, and 2D's drafts.ts)
// looks up the integration row + per-tenant token and passes them in.
//
// Why "pure transport layer" matters: 2D will wire this same helper to
// the existing 9 agents' approve flow without changing the helper. If
// we baked tenant-lookup or outcome-insertion into here, every caller
// would need different shape.
//
// Iron Rule preservation: this function only sends when called. The
// caller is responsible for ensuring a human approval preceded the call
// (in 2C, that's the user clicking [אשר]). The helper has no opinion
// about that — it just transports.

import "server-only";
import type {
  MetaErrorCategory,
  SendWhatsAppMessageInput,
  SendWhatsAppMessageResult,
} from "./types";

// Meta Graph API version. v22.0 is the current stable as of 2026.
// If the integration row stores a `metadata.api_version`, we honor it
// (forward-compat); otherwise we use this default. v18+ is required for
// modern Cloud API features; below that, request shapes differ.
const DEFAULT_API_VERSION = "v22.0";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3; // 1 initial + 2 retries
const RETRY_BACKOFF_MS = 200; // doubled each attempt: 200ms, 400ms

/**
 * Normalize an Israeli phone number to E.164 *without* the leading `+`
 * (which is what Meta Cloud API expects in the `to` field).
 *
 * Accepted inputs:
 *   - "+972541234567"   → "972541234567"
 *   - "972541234567"    → "972541234567"
 *   - "0541234567"      → "972541234567"
 *   - "541234567"       → "972541234567"  (assumed Israeli mobile)
 *   - "+972 54 123 4567" → "972541234567" (whitespace stripped)
 *   - "054-123-4567"    → "972541234567"  (dashes stripped)
 *
 * Returns null for inputs that don't look like a plausible Israeli
 * number — caller should treat null as a permanent error (don't retry,
 * surface to the user as "מספר לא תקין").
 */
export function normalizeIsraeliPhoneToE164(raw: string): string | null {
  if (!raw) return null;
  // Strip everything that isn't a digit. This deletes +, spaces, dashes,
  // parens — anything that might appear in a casually-formatted number.
  const digitsOnly = raw.replace(/[^\d]/g, "");

  // Already in 972XXXXXXXXX form (12 digits starting with 972)?
  if (digitsOnly.length === 12 && digitsOnly.startsWith("972")) {
    return digitsOnly;
  }

  // 0XXXXXXXXX form (Israeli local with leading 0, 10 digits)?
  if (digitsOnly.length === 10 && digitsOnly.startsWith("0")) {
    return "972" + digitsOnly.slice(1);
  }

  // 5XXXXXXXX form (mobile without country code or leading 0, 9 digits)?
  // We're conservative — only accept if it starts with 5 (mobile prefix)
  // or 7 (a few mobile carriers). Landline patterns are intentionally
  // not auto-prefixed because they're more likely to be transcription
  // errors than valid numbers.
  if (digitsOnly.length === 9 && /^[57]/.test(digitsOnly)) {
    return "972" + digitsOnly;
  }

  return null;
}

/**
 * Translate a Meta error code (or HTTP status) to one of our internal
 * categories. The mapping is intentionally narrow — only codes we've
 * actually seen documented or in the wild. Unknown codes fall through
 * to "unknown" with the raw Meta message preserved for surfacing.
 *
 * Reference codes from Meta's Cloud API docs:
 *   131000 - Generic message undeliverable
 *   131005 - Recipient phone number not on WhatsApp
 *   131009 - Parameter values invalid (often phone format)
 *   131026 - Message undeliverable: re-engagement message required
 *   131051 - Unsupported message type (often = outside 24h freeform)
 *   130429 - Rate limit hit
 *    80007 - Application rate limit hit
 */
function mapMetaErrorToCategory(
  code: string | null,
  httpStatus: number
): MetaErrorCategory {
  // Auth — 401, or Meta code 190 (token expired/invalid)
  if (httpStatus === 401 || code === "190") return "auth";

  // Template required / outside 24h window
  if (code === "131026" || code === "131051") return "template_required";

  // Invalid recipient
  if (code === "131000" || code === "131005" || code === "131009") {
    return "invalid_number";
  }

  // Rate limit
  if (code === "130429" || code === "80007" || httpStatus === 429) {
    return "rate_limit";
  }

  // Transient (5xx)
  if (httpStatus >= 500 && httpStatus < 600) return "transient";

  return "unknown";
}

/**
 * One attempt at sending. Returns the result of THIS attempt — caller
 * (sendWhatsAppMessage) handles retry orchestration.
 */
async function sendAttempt(
  url: string,
  body: object,
  accessToken: string
): Promise<
  | { kind: "success"; whatsappMessageId: string | null }
  | { kind: "fail"; result: Extract<SendWhatsAppMessageResult, { ok: false }> }
> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Network error / abort / DNS / etc. Treat as transient.
    const message = err instanceof Error ? err.message : "network error";
    return {
      kind: "fail",
      result: {
        ok: false,
        errorCategory: "transient",
        errorMessage: message,
        metaCode: null,
      },
    };
  }

  // Parse response body — Meta returns JSON for both success and error.
  // If parsing fails, treat as unknown error and don't retry (likely
  // a malformed gateway response, not transient).
  type MetaSendSuccess = {
    messages?: Array<{ id?: string }>;
  };
  type MetaSendError = {
    error?: {
      code?: number | string;
      message?: string;
    };
  };
  let parsed: MetaSendSuccess & MetaSendError;
  try {
    parsed = (await res.json()) as MetaSendSuccess & MetaSendError;
  } catch {
    return {
      kind: "fail",
      result: {
        ok: false,
        errorCategory: "unknown",
        errorMessage: `HTTP ${res.status} (non-JSON response)`,
        metaCode: null,
      },
    };
  }

  if (res.ok) {
    const wamid = parsed.messages?.[0]?.id ?? null;
    return { kind: "success", whatsappMessageId: wamid };
  }

  const metaCodeRaw = parsed.error?.code;
  const metaCode =
    metaCodeRaw === undefined || metaCodeRaw === null
      ? null
      : String(metaCodeRaw);
  const metaMessage = parsed.error?.message ?? `HTTP ${res.status}`;
  const category = mapMetaErrorToCategory(metaCode, res.status);

  return {
    kind: "fail",
    result: {
      ok: false,
      errorCategory: category,
      errorMessage: metaMessage,
      metaCode,
    },
  };
}

/**
 * Send a freeform text WhatsApp message via Meta Cloud API.
 *
 * Retry policy:
 *   - 5xx + network/timeout (category="transient") → retry up to 2 times
 *     with exponential backoff (200ms, 400ms).
 *   - 4xx → no retry. The user (or caller) takes action.
 *
 * Returns a discriminated union — see types.ts. On success, the wamid
 * (Meta's message identifier) may be useful for downstream reply
 * correlation in a future sub-stage (currently we don't store it).
 */
export async function sendWhatsAppMessage(
  input: SendWhatsAppMessageInput
): Promise<SendWhatsAppMessageResult> {
  const normalizedTo = normalizeIsraeliPhoneToE164(input.toPhone);
  if (!normalizedTo) {
    return {
      ok: false,
      errorCategory: "invalid_number",
      errorMessage: `cannot normalize phone "${input.toPhone}" to E.164`,
      metaCode: null,
    };
  }

  const url = `https://graph.facebook.com/${DEFAULT_API_VERSION}/${input.phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: normalizedTo,
    type: "text",
    text: { body: input.messageBody },
  };

  let lastFailure: Extract<SendWhatsAppMessageResult, { ok: false }> | null =
    null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const outcome = await sendAttempt(url, body, input.accessToken);
    if (outcome.kind === "success") {
      return { ok: true, whatsappMessageId: outcome.whatsappMessageId };
    }

    lastFailure = outcome.result;

    // Only retry transient failures. Everything else surfaces immediately.
    if (outcome.result.errorCategory !== "transient") {
      return outcome.result;
    }

    // Wait before retrying — but not after the last attempt.
    if (attempt < MAX_ATTEMPTS - 1) {
      const delayMs = RETRY_BACKOFF_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // All attempts exhausted, all transient. Surface the last one.
  return (
    lastFailure ?? {
      ok: false,
      errorCategory: "unknown",
      errorMessage: "send failed after retries (no error captured)",
      metaCode: null,
    }
  );
}
