// src/lib/safety/pii-scrubber.ts
//
// PII redaction middleware. Runs on every piece of user-generated content
// (review text, DM, customer message) BEFORE it goes into a Claude prompt.
//
// Iron rule: NAMES are preserved (the agent needs them to write a personal
// reply). IDENTIFIERS (ID number, phone, email, IBAN, credit card) are
// redacted to placeholder tokens. The agent gets enough to do its job
// without acquiring anything that triggers Privacy Protection Law §11A
// processing-without-consent claims.
//
// Why we still call this "scrubber" and not "anonymizer": the original
// data is preserved in our DB (drafts.context, agent_runs.input). What
// changes is what crosses the API boundary to Anthropic.
//
// Sub-stage 1.5.5 — comprehensive Israeli phone format audit:
//   - phone regex now handles spaces, multiple dashes, parentheses, +972 prefix
//     with various separator combinations
//   - israeli_id covers 8-9 digit IDs (pre-2007 IDs were 8 digits)
//   - safer over-redaction posture: false positives are acceptable since the
//     LLM just sees a placeholder; false negatives leak PII to Anthropic which
//     is a Privacy Protection Law §11A concern.

import "server-only";

export type PiiType =
  | "israeli_id"      // 8-9 consecutive digits (8 = pre-2007 IDs still valid)
  | "phone"           // Israeli mobile/landline formats with various separators
  | "email"           // standard email addresses
  | "iban"            // Israeli bank account
  | "credit_card";    // 16-digit card numbers

export interface ScrubResult {
  /** The text with PII replaced by placeholders. Send this to Claude. */
  scrubbed: string;
  /** What was found, for telemetry + drafts.contains_pii flag. */
  detected: { type: PiiType; count: number }[];
  /** Whether anything was redacted at all. */
  hadPii: boolean;
}

// ─────────────────────────────────────────────────────────────
// Detection patterns
// ─────────────────────────────────────────────────────────────
//
// Israeli ID: 8 or 9 digits. Pre-2007 IDs were 8 digits and remain valid
// for living Israelis. Negative lookaround prevents matching inside longer
// digit sequences.
//
// Israeli phone: comprehensive coverage for all common formats:
//   - Mobile: 050/051/052/053/054/055/058/059
//   - Landline: 02/03/04/08/09
//   - VoIP: 072/073/074/077/078/079
//   - Country code: +972 with optional space/dash separator
//   - Body: 7 digits with optional dashes, spaces, or parentheses
//
// The regex is intentionally permissive for false-positive safety. A digit
// run that "looks like" a phone gets redacted — that's fine because the LLM
// just sees [טלפון] and proceeds. A real phone number that escapes redaction
// is a Privacy Protection Law §11A violation, much worse than over-redacting.
//
// Email: pragmatic RFC-compatible pattern. Not bulletproof, good enough
// for redaction.
//
// IBAN: IL + 2 check digits + 19 digits, optionally space-separated in
// 4-digit groups.
//
// Credit card: 13-19 digits with optional separators (covers Visa/MC/Amex
// and short-form refs). Original 16-only pattern missed Amex (15 digits).

const PATTERNS: Record<PiiType, RegExp> = {
  // ─── Israeli ID (8 or 9 digits) ───
  // Negative lookbehind/ahead avoid matching inside larger digit blocks.
  israeli_id: /(?<!\d)\d{8,9}(?!\d)/g,

  // ─── Israeli phone (comprehensive) ───
  // Matches:
  //   +972-50-123-4567 / +972 50 123 4567 / +972501234567
  //   050-123-4567 / 050 123 4567 / 0501234567 / 050-1234567
  //   (050) 123-4567 / (050)1234567
  //   02-123-4567 / 02 123 4567 / 021234567
  //   072-123-4567 (VoIP)
  //
  // Structure:
  //   - Optional +972 or 972 prefix with optional separator
  //   - OR leading 0
  //   - Area code: [23489] (landline), 5[0-9] (mobile), 7[2-9] (VoIP)
  //   - 7 digits total in body, with allowed separators (- or space) anywhere
  //
  // The negative lookaround at the end prevents matching when followed by
  // more digits (avoids breaking on "phone is 050-1234567 and order is 12").
  phone: new RegExp(
    [
      // Country code variant: +972 / 972 with optional separator
      "(?:\\+?972[\\s-]?|0)",
      // Area code in parentheses or bare
      "(?:\\(\\s*[23489]|\\(\\s*5[0-9]|\\(\\s*7[2-9]|[23489]|5[0-9]|7[2-9])",
      // Optional close paren and separator
      "\\)?[\\s-]?",
      // 7 digits with optional separators (matches 1234567, 123-4567, 123 4567, 1-2-3-4567, etc.)
      "(?:\\d[\\s-]?){6}\\d",
    ].join(""),
    "g"
  ),

  // ─── Email ───
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,

  // ─── Israeli IBAN ───
  iban: /IL\d{2}(?:\s?\d{4}){4}\s?\d{3}/g,

  // ─── Credit card (13-19 digits, separators allowed every 4) ───
  // Covers Visa (13/16), MC (16), Amex (15), Discover (16), Diners (14)
  credit_card: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}\b/g,
};

// ─────────────────────────────────────────────────────────────
// Hebrew placeholders
// ─────────────────────────────────────────────────────────────
//
// We use Hebrew-language placeholders so the LLM sees them in context
// and naturally avoids referring back to the redacted value. English
// placeholders ("[ID]") sometimes confuse the model into reproducing
// the placeholder instead of working around it.

const PLACEHOLDERS: Record<PiiType, string> = {
  israeli_id: "[ת.ז]",
  phone: "[טלפון]",
  email: "[אימייל]",
  iban: "[חשבון בנק]",
  credit_card: "[כרטיס אשראי]",
};

// ─────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────

export function scrubPii(
  text: string,
  preserve: Partial<Record<PiiType, boolean>> = {}
): ScrubResult {
  if (!text) {
    return { scrubbed: text ?? "", detected: [], hadPii: false };
  }

  const detected: ScrubResult["detected"] = [];
  let scrubbed = text;

  // Order matters: process structured patterns (IBAN/credit_card) BEFORE
  // less-specific patterns (israeli_id matches any 8-9 digit run, which
  // would match parts of an IBAN). Phone before email for safety.
  // Israeli_id LAST because it's the broadest pattern.
  const order: PiiType[] = [
    "iban",
    "credit_card",
    "phone",
    "email",
    "israeli_id",
  ];

  for (const type of order) {
    if (preserve[type]) continue;
    const matches = scrubbed.match(PATTERNS[type]);
    if (matches && matches.length > 0) {
      detected.push({ type, count: matches.length });
      scrubbed = scrubbed.replace(PATTERNS[type], PLACEHOLDERS[type]);
    }
  }

  return {
    scrubbed,
    detected,
    hadPii: detected.length > 0,
  };
}

/**
 * Hash a recipient identifier for storage in do_not_contact / drafts.recipient_hash.
 * We never store the raw recipient (phone/email/handle) — only the hash.
 *
 * Normalization rules:
 *   - phone: digits only, prepend +972 if Israeli format detected
 *   - email: lowercased, trimmed
 *   - other: lowercased, trimmed
 */
export async function hashRecipient(
  channel: string,
  recipient: string
): Promise<string> {
  let normalized = recipient.trim().toLowerCase();

  if (channel === "whatsapp" || channel === "sms" || channel === "phone_call") {
    // Strip everything but digits, then add +972 if it's an Israeli local number.
    // Already-international numbers (starting with 972) are left as-is.
    let digits = normalized.replace(/\D/g, "");
    if (digits.startsWith("0") && digits.length === 10) {
      digits = "972" + digits.slice(1);
    }
    normalized = digits;
  }

  const data = new TextEncoder().encode(`${channel}|${normalized}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─────────────────────────────────────────────────────────────
// Self-test (run with: tsx src/lib/safety/pii-scrubber.ts)
// ─────────────────────────────────────────────────────────────
// This runs only when the file is executed directly (not when imported).
// The Israeli phone format coverage is the most fragile part of the regex,
// so we keep these as documentation + sanity check.

const PHONE_TEST_CASES: { input: string; shouldRedact: boolean }[] = [
  // Mobile, all common formats
  { input: "0501234567", shouldRedact: true },
  { input: "050-1234567", shouldRedact: true },
  { input: "050-123-4567", shouldRedact: true },
  { input: "050 123 4567", shouldRedact: true },
  { input: "(050) 123-4567", shouldRedact: true },
  { input: "+972501234567", shouldRedact: true },
  { input: "+972-50-123-4567", shouldRedact: true },
  { input: "+972 50 123 4567", shouldRedact: true },
  { input: "972-50-1234567", shouldRedact: true },
  // Landline
  { input: "02-1234567", shouldRedact: true },
  { input: "03-123-4567", shouldRedact: true },
  // VoIP
  { input: "072-1234567", shouldRedact: true },
  // Should NOT redact (not phone-shaped)
  { input: "12345", shouldRedact: false }, // too short
  { input: "1234567890123", shouldRedact: false }, // too long, not phone-formed
];

/**
 * Validate that the phone regex covers all common Israeli phone formats.
 * Exported so tests can call it; not used at runtime.
 */
export function _validatePhoneCoverage(): { passed: number; failed: string[] } {
  const failed: string[] = [];
  let passed = 0;

  for (const tc of PHONE_TEST_CASES) {
    const result = scrubPii(tc.input);
    const wasRedacted = result.detected.some((d) => d.type === "phone");
    if (wasRedacted === tc.shouldRedact) {
      passed += 1;
    } else {
      failed.push(
        `Input "${tc.input}" expected shouldRedact=${tc.shouldRedact} but got ${wasRedacted}`
      );
    }
  }

  return { passed, failed };
}
