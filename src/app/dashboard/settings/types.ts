// src/app/dashboard/settings/types.ts
//
// Neutral types file for the Settings page (sub-stage 1.7 + Sprint 3I).
//
// §15.29 mitigation (attempt 6 — RESOLVED 2026-05-13, commit c4b6942):
// Turbopack/SWC mishandles type usage inside "use server" files in a way
// that resisted 5 previous fix attempts. This file isolates ALL type
// definitions out of the "use server" boundary so actions.ts contains
// nothing but an async function with a type-annotated signature.
//
// NOT marked "use server" or "server-only" — by design. Both the
// server action (actions.ts), the client form (settings-form.tsx), AND
// the server-component page (page.tsx) import from here. Keeping this
// file NEUTRAL is the entire point of the §15.29 fix.
//
// Conventions going forward (CRITICAL — do not violate):
// - Type definitions belong HERE, never in actions.ts.
// - When adding new types (e.g. Sprint 3I added businessBrief), add
//   them HERE. Do NOT re-introduce internal type definitions into
//   actions.ts — that re-opens §15.29.
// - Runtime constants used by validation (VALID_GENDERS, VALID_VERTICALS,
//   BUSINESS_BRIEF_MAX_LENGTH) live here too, alongside the types they
//   constrain. Drift guards (`as const satisfies ...`) are safe in this
//   neutral file.

import type { BusinessOwnerGender } from "@/lib/safety/gender-lock";

// Re-export the canonical type. Single source of truth is still
// gender-lock.ts; this file is just a neutral relay.
export type { BusinessOwnerGender };

// ─────────────────────────────────────────────────────────────
// Runtime constants
// ─────────────────────────────────────────────────────────────

export const VALID_VERTICALS = [
  "general",
  "clinic",
  "financial",
  "restaurant",
  "retail",
  "services",
  "beauty",
  "education",
] as const;

// Drift guard (§15.12): `satisfies` ensures every value here is a valid
// BusinessOwnerGender. If anyone widens or narrows the canonical type
// in gender-lock.ts without updating this array, tsc fails.
export const VALID_GENDERS = ["male", "female", "plural"] as const satisfies readonly BusinessOwnerGender[];

// Sprint 3I — business_brief max length. Anchors both the textarea
// maxLength in the form AND the server-side validation. Anchor in ONE
// place to avoid drift between client and server caps. The 2000 figure
// was chosen as: long enough to capture meaningful business voice
// (about 250-300 Hebrew words), short enough to fit comfortably inside
// every agent's prompt budget without dominating Sonnet 4.6's 200K
// context window or breaking cache breakpoints.
export const BUSINESS_BRIEF_MAX_LENGTH = 2000;

// ─────────────────────────────────────────────────────────────
// Derived types
// ─────────────────────────────────────────────────────────────

export type Vertical = (typeof VALID_VERTICALS)[number];

export interface TenantSettingsInput {
  ownerName: string;
  businessName: string;
  businessOwnerGender: BusinessOwnerGender;
  vertical: Vertical;
  /**
   * Sprint 3I — free-form Hebrew description of the business and its
   * voice. Injected into customer-facing agent prompts as a
   * `<business_voice>...</business_voice>` block (after the cache
   * breakpoint, so tenant-specific content doesn't invalidate cached
   * static system prompts — see §15.32).
   *
   * `null` means no brief configured. The form submits `null` when
   * the textarea is empty or whitespace-only; the server stores `null`
   * in `tenants.config.business_brief` to keep the JSONB compact.
   */
  businessBrief: string | null;
}

export interface UpdateTenantSettingsResult {
  ok: boolean;
  error?: string;
  /** Per-field validation errors for inline display in the form. */
  fieldErrors?: Partial<Record<keyof TenantSettingsInput, string>>;
}
