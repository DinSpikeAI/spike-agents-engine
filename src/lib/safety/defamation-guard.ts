// src/lib/safety/defamation-guard.ts
//
// Post-generation defamation classifier.
//
// Israeli Defamation Law (Prohibition of Defamation, 5725-1965) is among the
// most plaintiff-friendly in the world. Statutory damages ₪50,000+ with no
// proof of harm; ₪300,000+ for public-interest factors; recent cases at
// ₪500,000+ for intentional/repeated.
//
// The reviews_agent's job is to draft replies to negative reviews. The risk:
// the draft accuses the reviewer of lying, criminality, mental instability,
// or otherwise characterizes them — published to the public review thread
// by the SMB on the agent's recommendation, this is per-se defamation against
// the reviewer.
//
// This module runs a Haiku 4.5 classifier on every reviews_agent draft.
// Cost: ~$0.001/check. ROI: protection from ₪50k–500k claims.
//
// If risk === 'high' → the draft is BLOCKED from the approval queue. The
// owner sees a redacted message: "הטיוטה כללה ביטויים שעלולים להיחשב לשון
// הרע. ערוך את הטיוטה לפני שליחה." plus the flagged phrases for context.
//
// If risk === 'medium' → draft enters approval queue with a yellow warning
// banner. Owner can still send but is informed of the risk.
//
// If risk === 'low' → standard flow.
//
// We also use this on social_posts agent later — public Instagram/Facebook
// posts have the same defamation exposure.

import "server-only";
import { anthropic } from "@/lib/anthropic";

export type DefamationRisk = "low" | "medium" | "high";

export interface DefamationCheck {
  risk: DefamationRisk;
  flagged_phrases: string[];
  reason: string;
}

const DEFAMATION_CLASSIFIER_SYSTEM = `אתה classifier משפטי שבודק טיוטות תגובה ציבורית של בעלי עסקים, על פי חוק איסור לשון הרע (תשכ"ה-1965) הישראלי.

המטרה: לזהות אם הטיוטה מכילה תוכן שעלול להיחשב לשון הרע נגד הכותב המקורי של הביקורת או נגד אדם שלישי.

**high — אחת מאלה:**
- האשמה ספציפית במעשה (גנב, רימה, שיקר, היה שיכור, סחט, איים, גרם נזק)
- אפיון נפשי/בריאותי של הכותב ("הוא לא רגוע", "יש לו בעיה", "הוא לא בסדר")
- ייחוס מעשה פלילי או מעשה שיש בו חוסר יושר
- חשיפה של מידע אישי שלא הופיע בביקורת המקורית (כתובת, טלפון, תעודת זהות, מקום עבודה)
- האשמת הכותב בכוונת זדון (לפגוע בעסק, להפחית מערכו)

**medium — אחת מאלה:**
- ויכוח על עובדות בלי גיבוי ראייתי ("זה לא קרה", "הוא משקר")
- טון תוקפני אישי כלפי הכותב ("מי אתה בכלל", "תפנה למקום אחר")
- הצהרות שמטילות ספק ביושר הכותב בלי האשמה ספציפית

**low:**
- תגובה עניינית, מתנצלת, או מציעה פיצוי
- אין התייחסות אישית לכותב מעבר לפנייה בשמו
- הצהרת עמדה של העסק בלי לכוון לכותב כאדם

**כללים נוספים:**
- אם הטיוטה רק מתייחסת לעובדה השנויה במחלוקת מבלי לתקוף את הכותב — זה medium, לא high.
- אם הטיוטה מתנצלת אבל אומרת "לא הייתה הזנחה מצידנו" — זה low, לא medium.
- אם הטיוטה מציינת שיש מצלמות/הקלטות/עדים — זה medium (משתמע איום משפטי).
- שם פרטי של הכותב (כפי שהופיע בביקורת המקורית) הוא בסדר. שם משפחה + פרט מזהה נוסף = high.

ענה רק ב-JSON תקני התואם לסכמה. שום טקסט מחוץ ל-JSON.`;

const DEFAMATION_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    risk: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "Overall defamation risk level for the draft.",
    },
    flagged_phrases: {
      type: "array",
      items: { type: "string" },
      description:
        "Specific phrases from the draft that triggered the risk assessment. Empty if risk is low.",
    },
    reason: {
      type: "string",
      description:
        "Brief Hebrew explanation of the risk level (1-2 sentences). Shown to owner on high-risk blocks.",
    },
  },
  required: ["risk", "flagged_phrases", "reason"],
} as const;

export async function checkDefamationRisk(
  draftReply: string,
  originalReview: string
): Promise<DefamationCheck> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    system: [
      {
        type: "text",
        text: DEFAMATION_CLASSIFIER_SYSTEM,
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `ביקורת מקורית של הלקוח:
---
${originalReview}
---

טיוטת התגובה של בעל העסק לבדיקה:
---
${draftReply}
---

סווג את רמת הסיכון של לשון הרע בטיוטה.`,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: DEFAMATION_OUTPUT_SCHEMA,
      },
    },
  });

  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  return JSON.parse(text) as DefamationCheck;
}

/**
 * Hebrew message shown to the owner when a high-risk draft is blocked.
 * The flagged phrases are included so the owner can edit toward safety.
 */
export function buildOwnerBlockMessage(check: DefamationCheck): string {
  if (check.risk !== "high") return "";

  const phrases =
    check.flagged_phrases.length > 0
      ? `\n\nביטויים שסומנו: ${check.flagged_phrases
          .map((p) => `"${p}"`)
          .join(", ")}`
      : "";

  return `הטיוטה הזו לא נשלחה לתיבת האישור כי היא מכילה תוכן שעלול להיחשב לשון הרע על פי חוק איסור לשון הרע (תשכ"ה-1965).

${check.reason}${phrases}

תוכל לערוך את הטיוטה ולנסות שוב, או לכתוב תגובה משלך.`;
}
