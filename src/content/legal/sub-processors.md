# רשימת מעבדי משנה (Sub-processors) — Spike Engine

> **גרסה:** 1.0 | **עודכן לאחרונה:** 5 במאי 2026

מסמך זה מפרט את ספקי השירות החיצוניים (מעבדי משנה / Sub-processors) שעמם Spike Engine פועלת לצורך מתן השירות. הרשימה ציבורית בהתאם לחובות תיקון 13 לחוק הגנת הפרטיות וסעיף 28 ל-GDPR.

**שינויים** ברשימה זו יודעו ללקוחות **30 יום מראש** באמצעות אימייל + עדכון בעמוד זה. ללקוח זכות התנגדות וביטול חוזה ללא קנס במקרה כזה.

---

## רשימה נוכחית

| ספק | שירות | מיקום עיבוד | מנגנון העברה לחו"ל | DPA | אישור DPF |
|---|---|---|---|---|---|
| **Anthropic, PBC** | מודל בינה מלאכותית (Claude API) | ארה"ב | DPF + SCCs Module 2 | [Link](https://privacy.claude.com/en/articles/7996862-data-processing-addendum) | ✅ |
| **Supabase, Inc.** | מסד נתונים, אימות משתמשים | פרנקפורט, גרמניה (EU) | אדקווציה אירופית | [Link](https://supabase.com/legal/dpa) | N/A (EU) |
| **Vercel, Inc.** | שירותי אירוח, Edge Functions | פרנקפורט (EU — fra1 region) | DPF + SCCs | [Link](https://vercel.com/legal/dpa) | ✅ |
| **Resend, Inc.** | משלוח דואר אלקטרוני טרנזקציוני | ארה"ב | DPF + SCCs | [Link](https://resend.com/legal/dpa) | ✅ |
| **Meta Platforms, Inc.** | WhatsApp Business Cloud API | רב-אזורי | תחת WhatsApp Business Solution Terms + DPF | [Link](https://www.whatsapp.com/legal/business-solution-terms) | ✅ |

---

## הערות

1. **Vercel** מוגדר אצלנו לפעול ב-`fra1` (פרנקפורט) כדי לשמור את ה-data plane באיחוד האירופי.
2. **Anthropic** אינה מאמנת מודלים על נתוני לקוחות API לפי תנאיה המסחריים (Commercial Terms).
3. כל הספקים שלעיל חתומים על Data Processing Agreement מולנו.
4. ספקי משנה של ספקי המשנה (sub-sub-processors) — למשל AWS תחת Supabase — מתועדים בעמוד DPA של כל ספק.

---

## היסטוריית שינויים

| גרסה | תאריך | שינוי |
|---|---|---|
| 1.0 | 5 במאי 2026 | פרסום ראשוני |

---

**שאלות:** privacy@spikeai.co.il
