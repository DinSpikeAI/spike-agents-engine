// src/lib/safety/anti-ai-strip.ts
//
// Post-processing utility that strips AI signature tells from agent output
// AFTER the LLM returns but BEFORE the output reaches the drafts table or UI.
//
// Defense-in-depth: even if the prompt fails to instruct, the regex catches.
// Deterministic, zero-cost, ~10 lines per agent integration.
//
// Status:
//   - 1.5.1 hotfix (this file + 5 agents): Morning, Reviews, Social, Manager,
//     Inventory — the agents that don't yet have prompt-level anti-AI rules.
//   - Also Watcher (already had prompt rules; this is belt-and-suspenders).
//   - 1.5.3 (planned): apply also to Hot Leads + Sales QR.
//
// What this strips (per CLAUDE.md §1.9):
//   - em-dash (—): the strongest AI tell. Replace with period + space.
//   - en-dash (–) mid-sentence: replace with regular hyphen.
//   - #hashtag patterns inline in text: remove entirely (with leading whitespace).
//
// What this does NOT touch (deferred to 1.5.3):
//   - multiple emojis (≤1/msg rule)
//   - forbidden Hebrew phrases ("תודה על פנייתך" etc.)
//   - sentence count enforcement
//   - the `hashtags: string[]` field in Social output — handled in social/run.ts
//
// Hebrew-aware: regex handles RTL text without corrupting bytes.

const EM_DASH_RE = /\s*—\s*/g;
const EN_DASH_MID_RE = /(\S)\s*–\s*(\S)/g;
// Match optional leading whitespace + #word (Hebrew letters, Latin, digits, underscore)
const HASHTAG_INLINE_RE = /\s*#[\u0590-\u05FFa-zA-Z0-9_]+/g;
const COLLAPSE_SPACES_RE = /[ \t]{2,}/g;
const SPACE_BEFORE_DOT_RE = /\s+\./g;

/**
 * Strip AI signature tells from a single Hebrew/English string.
 *
 * Examples:
 *   "קונים חכם — חוסכים זמן"       → "קונים חכם. חוסכים זמן"
 *   "אחריות, החלפה — נמצא שם"     → "אחריות, החלפה. נמצא שם"
 *   "תוכן #קניות #חיסכון אחרי"     → "תוכן אחרי"
 *   "מחיר–איכות יחס"               → "מחיר-איכות יחס"
 */
export function stripAiTells(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(EM_DASH_RE, ". ")
    .replace(EN_DASH_MID_RE, "$1-$2")
    .replace(HASHTAG_INLINE_RE, "")
    .replace(SPACE_BEFORE_DOT_RE, ".")
    .replace(COLLAPSE_SPACES_RE, " ")
    .trim();
}

/**
 * Recursively walk an object/array tree and strip AI tells from all string
 * values. Returns a NEW tree; does not mutate input.
 *
 * Special handling:
 *   - Arrays: each element recursively stripped. Empty strings (after
 *     stripping) are filtered out — useful for arrays of free-form strings
 *     that became all-empty.
 *   - Objects: each value recursively stripped.
 *   - Non-string primitives (number, boolean, null, undefined): passed
 *     through unchanged.
 *
 * Type-safe via generic — returns the same type as input.
 */
export function stripAiTellsDeep<T>(value: T): T {
  if (typeof value === "string") {
    return stripAiTells(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => stripAiTellsDeep(item))
      .filter((item) => {
        // Drop strings that became empty after stripping
        if (typeof item === "string") return item.trim().length > 0;
        return true;
      }) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripAiTellsDeep(v);
    }
    return out as T;
  }
  return value;
}
