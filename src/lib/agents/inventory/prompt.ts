/**
 * Spike Engine — Inventory Agent Prompts
 *
 * System prompt: stable, cached with ttl: "1h" via cache_control.
 * User message: changes per run (the actual product analysis data).
 */

import type { ProductAnalysis } from "./csv-parser";

// ─────────────────────────────────────────────────────────────
// System prompt (stable, cached)
// ─────────────────────────────────────────────────────────────

export const INVENTORY_AGENT_SYSTEM_PROMPT = `אתה סוכן AI לניתוח מלאי בעסק ישראלי קטן/בינוני. תפקידך לקבל רשימת מוצרים שכבר נותחה במערכת (כל מוצר עם current stock, daily average, days of coverage, status), ולהפיק תובנות בעברית פשוטה לבעל העסק.

הכללים שלך:

1. **רק דיווח, לא הוראות.** אתה מציג מצב — לא נותן הוראות הזמנה. אסור לכתוב "תזמין X" או "צור קשר עם הספק". המשתמש מחליט מה לעשות עם המידע. אתה רק מציג עובדות.

2. **תעדוף מוצרים שדורשים תשומת לב.** מוצרים בסטטוס critical → priority 1. low → priority 2. אחרים — priority 3+. ככה הבעלים רואה את הדחוף ביותר ראשון.

3. **insight לכל מוצר.** משפט אחד בעברית טבעית, מתמקד בעובדה הכי חשובה על המוצר. דוגמאות טובות:
   - "המלאי יחזיק כ-3 ימים לפי קצב המכירה הנוכחי"
   - "מכירה איטית — 60 יחידות במלאי, רק 1.5 נמכרים ביום"
   - "אין תנועה בחודש האחרון"
   - "המלאי במצב יציב — כ-12 ימים נשארו"
   
   דוגמאות **רעות** (אסור!):
   - "צריך להזמין דחוף!" ❌ (הוראה)
   - "פנה לספק תנובה" ❌ (הוראה ספציפית)
   - "מומלץ להזמין 50 יחידות" ❌ (כמות)

4. **summary** במשפט אחד קצר על המצב הכללי. למשל "3 מוצרים במצב קריטי, 12 בסדר".

5. **topConcernsHe** — פסקה קצרה (2-4 משפטים) שמסכמת את הדאגות. אם אין critical/low → "המלאי במצב יציב, אין מוצרים שדורשים תשומת לב מיידית."

6. **שפה ישירה אבל אדיבה.** לא קליל מדי, לא רשמי מדי. כמו עוזר אישי שמדווח לבעל עסק.

7. **counts** חייב להתאים בדיוק לסטטוסים של המוצרים שאתה מחזיר. אל תמציא ספירות.

8. **products** חייב לכלול את כל המוצרים שקיבלת — אל תשמיט. סדר אותם לפי priority עולה (1, 2, 3...).

9. **אין הזכרה של ספקים, מחירים, או החלטות עסקיות שאתה לא מסוגל לבסס על הנתונים שקיבלת.**

הפלט חייב להיות JSON תקני בדיוק לפי הסכמה שסופקה.`;

// ─────────────────────────────────────────────────────────────
// User message builder
// ─────────────────────────────────────────────────────────────

export interface InventoryPromptContext {
  ownerName: string;
  businessName: string;
  vertical: string;
  /** Already analyzed products from code (status + daysOfCoverage computed) */
  products: ProductAnalysis[];
  /** When was the CSV uploaded (ISO timestamp). Used to flag stale data. */
  snapshotUploadedAt: string;
}

export function buildInventoryUserMessage(
  ctx: InventoryPromptContext
): string {
  const ageHours =
    (Date.now() - new Date(ctx.snapshotUploadedAt).getTime()) / (1000 * 60 * 60);
  const ageDays = Math.floor(ageHours / 24);
  const ageHint =
    ageDays === 0
      ? "הקובץ הועלה היום."
      : ageDays === 1
      ? "הקובץ הועלה אתמול."
      : `הקובץ הועלה לפני ${ageDays} ימים. אם המלאי משתנה מהר, הנתונים עשויים לא לשקף את המצב הנוכחי בדיוק.`;

  const productLines = ctx.products
    .map((p, i) => {
      const code = p.productCode ? ` [${p.productCode}]` : "";
      const unit = p.unit ? ` ${p.unit}` : "";
      const coverage =
        p.daysOfCoverage === null
          ? "אין תנועה"
          : `${p.daysOfCoverage} ימים`;
      const dailyAvg = p.dailyAvgSales.toFixed(2);
      return `${i + 1}. ${p.productName}${code}: מלאי ${p.currentStock}${unit}, ממוצע יומי ${dailyAvg}, נשאר ל-${coverage} (status=${p.status})`;
    })
    .join("\n");

  return `עסק: ${ctx.businessName} (${ctx.vertical})
בעלים: ${ctx.ownerName}
${ageHint}

נתוני המלאי הנוכחי (${ctx.products.length} מוצרים):

${productLines}

הפק תובנות וסכם את המצב לפי ההנחיות בהוראות המערכת. החזר JSON תקני בלבד.`;
}
