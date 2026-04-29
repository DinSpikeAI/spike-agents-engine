// src/lib/safety/gender-lock.ts
//
// Hebrew gender lock for agent output.
//
// Hebrew is heavily gendered: "אתה עשית" (you-male did) vs "את עשית"
// (you-female did) vs "אתם עשיתם" (you-plural did). Without an explicit
// instruction, Claude defaults to male singular roughly 70% of the time
// in our testing — which is wrong for ~half of business owners and
// always wrong for partnerships.
//
// Worse, Claude sometimes flips gender mid-completion in long outputs.
// A morning briefing that starts "בוקר טוב, את עשית" can drift to
// "כדאי לך לבדוק" then "תראה בעצמך" — three different genders in one
// paragraph. This looks robotic at best, insulting at worst.
//
// The fix: lock gender at the prompt level via tenants.business_owner_gender.
// Inject the instruction AFTER the cached static prefix (so the cache still
// works for the static portion; only the gender line is dynamic).

import "server-only";

export type BusinessOwnerGender = "male" | "female" | "plural";

/**
 * Build the Hebrew system-prompt instruction that locks gender for the
 * current tenant. Inject this into every agent's system prompt right
 * after the cached static portion.
 */
export function buildGenderInstruction(g: BusinessOwnerGender): string {
  switch (g) {
    case "male":
      return `**מגדר בעל העסק: זכר.** השתמש בלשון זכר יחיד בכל פנייה אליו ("אתה", "שלך", "כדאי לך", "תוכל"). אל תחליף מגדר באמצע פסקה. אם הסגנון מאלץ ניסוח כללי, השתמש בלשון סתמית ("אפשר", "כדאי") ולא בלשון נקבה.`;

    case "female":
      return `**מגדר בעל העסק: נקבה.** השתמש בלשון נקבה יחיד בכל פנייה אליה ("את", "שלך", "כדאי לך", "תוכלי"). אל תחליף מגדר באמצע פסקה. אם הסגנון מאלץ ניסוח כללי, השתמש בלשון סתמית ("אפשר", "כדאי") ולא בלשון זכר.`;

    case "plural":
      return `**מגדר בעל העסק: רבים (שותפים/צוות).** השתמש בלשון רבים בכל פנייה ("אתם", "שלכם", "כדאי לכם", "תוכלו"). אל תחליף מגדר באמצע פסקה. אם הסגנון מאלץ ניסוח כללי, השתמש בלשון סתמית ("אפשר", "כדאי").`;
  }
}

/**
 * Inject gender instruction into a `system` array for the Anthropic API.
 *
 * Pattern:
 *   system: [
 *     { type: "text", text: STATIC_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } },
 *     { type: "text", text: buildGenderInstruction(tenant.business_owner_gender) }
 *   ]
 *
 * The static portion stays cached. Only the gender block changes per tenant.
 */
export function withGenderLock(
  staticPrompt: string,
  gender: BusinessOwnerGender | null
): { type: "text"; text: string; cache_control?: { type: "ephemeral"; ttl: "1h" } }[] {
  const blocks: ReturnType<typeof withGenderLock> = [
    {
      type: "text",
      text: staticPrompt,
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ];

  if (gender) {
    blocks.push({
      type: "text",
      text: buildGenderInstruction(gender),
    });
  } else {
    // No gender configured (pre-onboarding tenant). Use defensive sutmiyut.
    blocks.push({
      type: "text",
      text: `**מגדר בעל העסק: לא ידוע.** השתמש בלשון סתמית ("אפשר", "כדאי", "מומלץ") במקום פנייה ישירה. אל תניח זכר/נקבה.`,
    });
  }

  return blocks;
}

/**
 * Validate that a Hebrew completion respects the locked gender. Used by
 * the nightly Hebrew eval suite to catch drift.
 *
 * Returns a list of violations (phrases in the wrong gender). Empty array
 * means clean.
 */
export function detectGenderViolations(
  text: string,
  expectedGender: BusinessOwnerGender
): string[] {
  const violations: string[] = [];

  // Patterns that strongly indicate gender. Not exhaustive — used as a
  // sanity check, not a strict validator.
  const malePronouns = ["אתה", "שלך,", "תוכל ", "כדאי לך"];
  const femalePronouns = ["את ", "שלך,", "תוכלי ", "כדאי לך"];
  const pluralPronouns = ["אתם", "שלכם", "תוכלו", "כדאי לכם"];

  const targets = {
    male: malePronouns,
    female: femalePronouns,
    plural: pluralPronouns,
  };

  const wrong: BusinessOwnerGender[] = (
    ["male", "female", "plural"] as BusinessOwnerGender[]
  ).filter((g) => g !== expectedGender);

  for (const otherGender of wrong) {
    for (const pattern of targets[otherGender]) {
      // Skip ambiguous patterns shared with the expected gender
      if (targets[expectedGender].includes(pattern)) continue;
      if (text.includes(pattern)) {
        violations.push(`${pattern} (${otherGender})`);
      }
    }
  }

  return violations;
}
