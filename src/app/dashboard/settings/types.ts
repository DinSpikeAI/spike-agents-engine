// src/app/dashboard/settings/types.ts
//
// Neutral types file for the Settings page (sub-stage 1.7).
//
// §15.29 mitigation (attempt 6): Turbopack/SWC mishandles type usage
// inside "use server" files in some interaction that has resisted 5
// previous fix attempts. This file isolates ALL type definitions out
// of the "use server" boundary so actions.ts contains nothing but an
// async function with a type-annotated signature.
//
// NOT marked "use server" or "server-only" — by design. Both the
// server action (actions.ts) and the client form (settings-form.tsx)
// import from here. Keeping this file NEUTRAL is the entire point of
// the fix.
//
// Conventions going forward (CRITICAL — do not violate):
// - Type definitions belong HERE, never in actions.ts.
// - When adding new types (e.g. for the upcoming business_brief sprint
//   that injects owner voice into agent prompts), add them HERE.
// - Do NOT re-introduce internal type definitions into actions.ts —
//   that re-opens §15.29.
// - Runtime constants used by validation (VALID_GENDERS, VALID_VERTICALS)
//   live here too, alongside the types they constrain. Drift guards
//   (`as const satisfies ...`) are safe in this neutral file.

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
// in gender-lock.ts without updating this array, tsc fails. This was
// the original location of the constraint in actions.ts (attempt 1
// suspected it was the trigger and removed it; that didn't help — but
// putting it back HERE in a neutral file is both safer and correct.)
export const VALID_GENDERS = ["male", "female", "plural"] as const satisfies readonly BusinessOwnerGender[];

// ─────────────────────────────────────────────────────────────
// Derived types
// ─────────────────────────────────────────────────────────────

export type Vertical = (typeof VALID_VERTICALS)[number];

export interface TenantSettingsInput {
  ownerName: string;
  businessName: string;
  businessOwnerGender: BusinessOwnerGender;
  vertical: Vertical;
}

export interface UpdateTenantSettingsResult {
  ok: boolean;
  error?: string;
  /** Per-field validation errors for inline display in the form. */
  fieldErrors?: Partial<Record<keyof TenantSettingsInput, string>>;
}
