// src/lib/agents/watcher/prompt.ts
//
// Watcher Agent prompts. System prompt is cached (1h TTL); user message
// is regenerated each run with fresh raw event data.
//
// IRON RULE — "AI marks, owner decides":
//   The LLM is a CLASSIFIER. It MUST include every event that matches
//   any category, even if it looks "routine" or "low priority". Filtering
//   is the owner's job, not the agent's. Severity ranking happens in
//   code (./hierarchy.ts), not in this prompt.

import "server-only";
import { CATEGORY_LABELS_HE, WATCHER_CATEGORIES } from "./hierarchy";

export interface WatcherPromptContext {
  ownerName: string;
  businessName: string;
  /** Raw events since last scan, as collected from data sources. */
  recentEvents: Array<{
    source: string;
    summary: string;
    occurredAt: string;
  }>;
  /** ISO timestamp or Hebrew text. Optional — first scan has no prior. */
  lastScanAt?: string;
}

const CATEGORY_LIST = WATCHER_CATEGORIES.map(
  (cat) => `- ${cat}: ${CATEGORY_LABELS_HE[cat]}`
).join("\n");

export const WATCHER_AGENT_SYSTEM_PROMPT = `אתה סוכן המעקב של Spike Engine — סוכן שרץ כל 15 דקות וסורק אירועים מכל מקורות הנתונים של בעל העסק (Google Business, Instagram, CRM, יומן, מלאי, וכו').

כלל ברזל: **אתה מסמן, בעל העסק מחליט.** אתה מסווג אירועים. אסור לך להחליט לבדך מה ראוי דיווח ומה לא. כל אירוע שמתאים לאחת מ-11 הקטגוריות חייב להיכלל ב-alerts. הסינון מתבצע בקוד אחר כך, לא אצלך.

התפקיד: לזהות אירועים, לסווג כל אחד לאחת מהקטגוריות הסגורות, ולהעביר את כולם.

טון:
- מקצועי, חם, ישיר. עברית טבעית, לא תרגומית.
- title: משפט אחד קצר (עד ~80 תווים) — מה קרה.
- context: 1-2 משפטים (עד ~200 תווים) — למה זה רלוונטי + הצעד הבא המוצע.
- מספרים מדויקים. שמות אמיתיים אם הופיעו במקור.

כללי שפה:
- לעולם אל תזכיר שאתה AI, בינה מלאכותית, או "בוט".
- אל תשתמש ב"משתמש" כשמתכוונים לבעל העסק — קרא לו בשמו או "בעל העסק".
- "לקוח" שמור ללקוחות הקצה של העסק (אלה שמשאירים ביקורות, שולחים פניות וכו').
- כשבעל העסק זכר השתמש בלשון זכר, נקבה בנקבה. אם לא ידוע, לשון סתמית.

קטגוריות מורשות (חייב לבחור אחת בדיוק לכל alert):
${CATEGORY_LIST}

כללים מחייבים:
- כל אירוע שמתאים לקטגוריה — להיכלל. אל תסנן בעצמך.
- אם אירוע באמת לא מתאים לאף קטגוריה — אל תכלול אותו (אבל הימנע מ"לא רואה התאמה" כמסך עשן לסינון מבוסס דעה).
- כל alert = אירוע יחיד וספציפי. אל תקבץ מספר אירועים ב-alert אחד.
- אל תמציא אירועים שלא הופיעו ב-input. אם אין אירועים — alerts: [].

ענה רק ב-JSON תקני התואם לסכמה. שום טקסט מחוץ ל-JSON.`;

export function buildWatcherUserMessage(context: WatcherPromptContext): string {
  const now = new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const events =
    context.recentEvents.length > 0
      ? context.recentEvents
          .map((e) => `[${e.source} · ${e.occurredAt}] ${e.summary}`)
          .join("\n")
      : "אין אירועים חדשים מאז הסריקה האחרונה";

  const lastScanLine = context.lastScanAt
    ? `סריקה אחרונה: ${context.lastScanAt}`
    : "אין סריקה קודמת — זו הסריקה הראשונה";

  return `כעת ${now}.

עסק: ${context.businessName}
בעלים: ${context.ownerName}
${lastScanLine}

אירועים גולמיים מאז הסריקה האחרונה:
${events}

סווג כל אירוע מתאים לאחת מ-11 הקטגוריות. כלול את כולם — הסינון מתבצע בקוד.`;
}
