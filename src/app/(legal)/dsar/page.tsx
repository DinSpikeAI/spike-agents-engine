export const metadata = {
  title: "בקשת גישה לנתונים - Spike Engine",
  description: "DSAR landing page",
};

export default function Page() {
  return (
    <article dir="rtl" className="prose prose-lg mx-auto max-w-3xl px-4 py-8">
      <h1>בקשת גישה לנתונים אישיים</h1>

      <h2>צרכן/ית קצה?</h2>
      <p>
        אם הנתונים שלך עובדו דרך עסק שמשתמש ב-Spike Engine (מספרה, מרפאה,
        מסעדה וכדומה), הבקשה שלך צריכה להיות מופנית <strong>לאותו העסק</strong>,
        שהוא בעל המאגר תחת חוק הגנת הפרטיות.
      </p>
      <p>
        נשמח לעזור לעסק לאתר את הנתונים שלך - כתוב/י ל-{" "}
        <a href="mailto:dsar@spikeai.co.il">dsar@spikeai.co.il</a> ונכוון אותך.
      </p>

      <h2>לקוח/ת עסקי/ת של Spike?</h2>
      <p>שלח/י את הפרטים הבאים ל-<a href="mailto:dsar@spikeai.co.il">dsar@spikeai.co.il</a>:</p>
      <ul>
        <li>שם מלא</li>
        <li>כתובת מייל רשומה במערכת</li>
        <li>מספר טלפון נייד (לאימות זהות)</li>
        <li>היקף הבקשה (עיון, תיקון, מחיקה, התנגדות)</li>
      </ul>
      <p>נשיב תוך 30 יום. במקרים מורכבים נארך ב-30 יום נוספים בהודעה.</p>

      <h2>זכותך</h2>
      <p>
        זכותך לפנות לרשות להגנת הפרטיות במשרד המשפטים אם תשובתנו אינה משביעת רצון:<br />
        <a href="https://www.gov.il/he/departments/the_privacy_protection_authority" target="_blank" rel="noopener">
          https://www.gov.il/he/departments/the_privacy_protection_authority
        </a>
      </p>
    </article>
  );
}
