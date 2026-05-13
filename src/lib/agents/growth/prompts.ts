// src/lib/agents/growth/prompts.ts
//
// System prompts and message builders for the Growth Agent.
//
// Two stages, two prompts:
//   1. HAIKU_SCAN_SYSTEM_PROMPT — classify+score a list of candidates
//   2. SONNET_DRAFT_SYSTEM_PROMPT — write a personal Hebrew message
//
// Both prompts apply prompt caching on the system block + tenant context
// block. The 1h ephemeral TTL is right for Growth: the Sunday-morning cron
// fires Sonnet 10-15 times in succession, so cache reads (0.1x base) save
// ~50% of Sonnet cost on the run after the first call.
//
// Sprint 3I Phase 2 Batch 3 (2026-05-13): owner-authored voice brief is
// loaded into TenantContextForGrowth.businessBrief by run.ts and injected
// into draft.ts as a third NON-cached system block placed after the
// two existing cached blocks. The brief deliberately lives OUTSIDE the
// cached tenant-context block so edits to the brief don't invalidate
// the cache for the rest of the tenant context (name/vertical/tone
// change rarely; brief is edited more often by iterating owners).
// See §10.40 + §15.33 in CLAUDE.md.

import "server-only";

// ─────────────────────────────────────────────────────────────
// Stage 1 — Haiku scan: scoring candidates
// ─────────────────────────────────────────────────────────────

export const HAIKU_SCAN_SYSTEM_PROMPT = `אתה סוכן הצמיחה של Spike Engine — סוכן ש"מסמן" הזדמנויות מכירה לבעל עסק. אתה לא פועל לבד — אתה רק מסמן. בעל העסק מחליט.

התפקיד שלך:
מקבל מערך של מועמדים (לקוחות רדומים מ-DB פנימי + הודעות לא-נענו ב-Instagram/Facebook) ולתת לכל אחד ציון 1-100 + סיבה קצרה בעברית + קטגוריה.

שתי קטגוריות אפשריות:
1. reactivation — לקוח שלא היה זמן רב, יש לו היסטוריה עם העסק
2. lead_discovery — שאל מחיר/שירות/זמינות ולא נענה (מקור instagram/facebook)

מתי להעניק ציון גבוה (90-100):
- VIP שנעלם (3+ ביקורים בעבר, סנטימנט חיובי, יותר מ-60 יום ללא פעילות)
- שאלת מחיר ברורה ב-IG/FB ללא תגובה (סבירות גבוהה לסגירה)
- לקוח שהתעניין בשירות ספציפי לפני זמן קצר ולא חזר

מתי להעניק ציון בינוני (70-89):
- לקוח עם היסטוריה דקה (2 ביקורים בעבר), נעלם 45-60 יום
- התעניינות כללית ב-IG/FB ("יש זמינות?")

מתי להעניק ציון נמוך (50-69):
- היסטוריה מאוד דקה (2 ביקורים בלבד, סנטימנט ניטרלי)
- הודעת IG/FB ישנה מאוד (40+ יום)

אסור:
- אל תחזיר מועמד עם ציון מתחת ל-50.
- אל תמציא מידע שלא קיים במטה-דאטה שניתן לך.
- אל תכתוב טיוטות הודעה — זה לא התפקיד שלך. שלב הכתיבה מתבצע אחר כך על ידי מודל אחר.
- אל תיתן הסברים ארוכים ב-reason. משפט אחד קצר בעברית, מקסימום 15 מילים.

החזר JSON תקני בלבד לפי ה-schema. ללא טקסט נוסף, ללא הסבר, ללא Markdown, ללא code fence.`;

export function buildHaikuScanUserMessage(candidatesPayload: string): string {
  return `Candidates to score (JSON array):

${candidatesPayload}

Score each. Return only those with score >= 50.`;
}

// ─────────────────────────────────────────────────────────────
// Stage 2 — Sonnet draft: writing the personal message
// ─────────────────────────────────────────────────────────────

export const SONNET_DRAFT_SYSTEM_PROMPT = `אתה כותב הודעת WhatsApp/Instagram מטעם בעל עסק לפנייה אישית ללקוח.

מטרה:
החזרת לקוח רדום או טיפול בליד שלא נענה. אתה מקבל את ההיסטוריה הספציפית של הלקוח ואת הסיבה למה הוא נבחר.

ההודעה חייבת להיות:
- קצרה: 2-4 משפטים בלבד
- אישית: מבוססת על המידע הספציפי שניתן לך, לא גנרית
- בעברית טבעית: לא תרגום ממכונה, לא מילים מליציות, לא ניב גבוה
- בטון של בעל העסק: קל, אנושי, ידידותי, כמו הודעה שחבר היה כותב

איסורים מוחלטים:
- ללא em-dash (—), ללא en-dash (–), ללא double hyphen (--)
- ללא hashtags (#)
- ללא אימוג'י כללי (ניתן לכלול אחד ספציפי בסוף, אופציונלי, רק אם זה מתאים לטון)
- ללא חיווי שזה AI/אוטומציה
- ללא הבטחות שלא הובטחו ("הנחה 30%!", "חינם!" — רק אם ה-context מציין זאת מפורש)
- ללא טקטיקות לחץ ("עוד יומיים", "ההזדמנות תפוג", "מהר!")
- ללא חתימה אלא אם בעל העסק ביקש אותה ב-context

איך להשתמש בהיסטוריה:
- אם יש שירות ספציפי שהלקוח עבר ("קרטין", "טיפול פנים") — תזכיר אותו בעדינות
- אם יש שאלת מחיר שלא נענתה — תאמת את השאלה והצע מענה
- אם יש זמן ארוך ללא פעילות — תוכל להזכיר ש"לא ראינו אותך מזמן" אבל לא בצורה מאשימה

אם המידע ההיסטורי דל מאוד, כתוב הודעה ניטרלית-חמה בלי להמציא פרטים ספציפיים.

החזר JSON תקני בלבד עם:
- draft_message: ההודעה עצמה (עברית, בלי הקדמה ובלי סיכום)
- candidate_subtitle: 2-5 מילים בעברית שיופיעו ב-dashboard ככותרת משנה לכרטיס המועמד (למשל "VIP נעלם 90 יום" או "שאל מחיר באינסטגרם")`;

// ─────────────────────────────────────────────────────────────
// Tenant context builder (cached block, repeated across runs)
// ─────────────────────────────────────────────────────────────

export interface TenantContextForGrowth {
  /** Display name of the business (used by Sonnet for tone) */
  businessName: string;
  /** Vertical (salon/restaurant/clinic/etc) — informs vertical-specific tone */
  vertical: string;
  /** Free-text owner notes about preferred tone (from onboarding) */
  toneNotes: string | null;
  /** Signature preference (e.g. "ללא חתימה" / "כולל שם פרטי") */
  signatureStyle: string | null;
  /**
   * Sprint 3I Phase 2 — owner-authored voice brief from
   * tenants.config.business_brief. Loaded by run.ts via
   * extractBusinessBrief. Used by draft.ts to add a third
   * NON-cached system block via buildBusinessBriefBlock. Null
   * for tenants who haven't filled the settings textarea yet.
   * Intentionally NOT included in buildTenantContextBlock — see
   * the cache-rationale note at the top of this file.
   */
  businessBrief: string | null;
}

export function buildTenantContextBlock(ctx: TenantContextForGrowth): string {
  return `הקשר עסקי:
- שם העסק: ${ctx.businessName}
- תחום: ${ctx.vertical}
- טון: ${ctx.toneNotes ?? "ידידותי, אנושי, לא מליצי"}
- חתימה: ${ctx.signatureStyle ?? "ללא חתימה"}`;
}

// ─────────────────────────────────────────────────────────────
// Sonnet draft user message builder
// ─────────────────────────────────────────────────────────────

export interface DraftUserMessageInput {
  goal: "reactivation" | "lead_discovery";
  reasonFromHaiku: string;
  customerLabel: string;
  draftChannel: "whatsapp" | "instagram" | "facebook";
  recentMessages: Array<{
    direction: "inbound" | "outbound";
    text: string;
    timestamp: string;
  }>;
  historicalSummary: string;
  lastInteractionDate: string | null;
  lastInteractionTopic: string | null;
}

export function buildSonnetDraftUserMessage(input: DraftUserMessageInput): string {
  const recentBlock =
    input.recentMessages.length > 0
      ? input.recentMessages
          .map(
            (m) =>
              `[${m.timestamp}] ${m.direction === "inbound" ? "לקוח" : "בעל העסק"}: ${m.text}`
          )
          .join("\n")
      : "(אין היסטוריית שיחה זמינה)";

  return `Goal: ${input.goal}
Why selected: ${input.reasonFromHaiku}
Customer label: ${input.customerLabel}
Channel for the draft: ${input.draftChannel}

Recent messages (most recent first):
${recentBlock}

Historical summary:
${input.historicalSummary || "(אין סיכום זמין)"}

Last interaction:
- Date: ${input.lastInteractionDate ?? "(לא ידוע)"}
- Topic: ${input.lastInteractionTopic ?? "(לא ידוע)"}

Write the draft_message in Hebrew, plus a 2-5 word Hebrew candidate_subtitle for the dashboard card.`;
}
