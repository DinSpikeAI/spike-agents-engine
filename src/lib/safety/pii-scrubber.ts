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

import "server-only";

export type PiiType =
  | "israeli_id"      // 9 consecutive digits
  | "phone"           // Israeli mobile/landline formats
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
// Israeli ID: 9 digits. We accept any 9 consecutive digits not preceded
// by a digit (avoids matching inside longer numbers like phone numbers
// when no separator).
//
// Israeli phone: +972, 0+ prefixes. Mobile (05x), landline (02/03/04/08/09),
// special (07x for VoIP). Allows optional dash before the last 7 digits.
//
// Email: pragmatic RFC-compatible pattern. Not bulletproof, good enough
// for redaction.
//
// IBAN: IL + 2 check digits + 19 digits, optionally space-separated in
// 4-digit groups.
//
// Credit card: 16 digits with optional dashes/spaces every 4. We don't
// validate Luhn — false positives are fine, we'd rather over-redact.

const PATTERNS: Record<PiiType, RegExp> = {
  israeli_id: /(?<!\d)\d{9}(?!\d)/g,
  phone: /(?:\+972|0)(?:[23489]|5[0-9]|7[2-9])-?\d{7}/g,
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  iban: /IL\d{2}(?:\s?\d{4}){4}\s?\d{3}/g,
  credit_card: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
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

  // Order matters slightly: process IBAN/credit card BEFORE israeli_id,
  // because both contain runs of digits and we want the structured
  // patterns to match first.
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
    // Strip everything but digits, then add +972 if it's an Israeli local number
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
