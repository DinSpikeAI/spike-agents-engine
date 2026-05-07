// src/components/legal/SignupConsentCheckboxes.tsx
//
// קומפוננטת ה-checkbox המשפטי לעמוד הרישום
// כל ההסכמות מתועדות ב-Supabase דרך POST /api/consent
//
// שימוש:
// <SignupConsentCheckboxes
//   onValidChange={(isValid, consents) => setConsentsValid(isValid)}
//   userEmail={email}  // for logging after signup completes
// />

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export type ConsentState = {
  termsOfService: boolean;
  privacyPolicy: boolean;
  acceptableUse: boolean;
  marketingOptIn: boolean; // optional - separate from required consents
};

type Props = {
  onValidChange: (isValid: boolean, consents: ConsentState) => void;
  /** Document versions — bump these when documents change */
  versions?: {
    termsOfService: string;
    privacyPolicy: string;
    acceptableUse: string;
  };
};

const DEFAULT_VERSIONS = {
  termsOfService: "1.0",
  privacyPolicy: "1.0",
  acceptableUse: "1.0",
};

export default function SignupConsentCheckboxes({
  onValidChange,
  versions = DEFAULT_VERSIONS,
}: Props) {
  const [consents, setConsents] = useState<ConsentState>({
    termsOfService: false,
    privacyPolicy: false,
    acceptableUse: false,
    marketingOptIn: false,
  });

  // Required consents (everything except marketing)
  const isValid =
    consents.termsOfService &&
    consents.privacyPolicy &&
    consents.acceptableUse;

  useEffect(() => {
    onValidChange(isValid, consents);
  }, [consents, isValid, onValidChange]);

  const updateConsent = (key: keyof ConsentState, value: boolean) => {
    setConsents((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div
      className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-right"
      dir="rtl"
    >
      <h3 className="text-sm font-semibold text-gray-700">
        הסכמות נדרשות לפני יצירת החשבון
      </h3>

      {/* Terms of Service */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={consents.termsOfService}
          onChange={(e) => updateConsent("termsOfService", e.target.checked)}
          className="mt-1 h-4 w-4 cursor-pointer accent-blue-600"
          required
        />
        <span className="text-sm text-gray-700">
          קראתי ואני מסכים/ה ל
          <Link
            href="/terms"
            target="_blank"
            className="mx-1 text-blue-600 underline hover:text-blue-800"
          >
            תנאי השימוש
          </Link>
          (גרסה {versions.termsOfService})
        </span>
      </label>

      {/* Privacy Policy */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={consents.privacyPolicy}
          onChange={(e) => updateConsent("privacyPolicy", e.target.checked)}
          className="mt-1 h-4 w-4 cursor-pointer accent-blue-600"
          required
        />
        <span className="text-sm text-gray-700">
          קראתי ואני מסכים/ה ל
          <Link
            href="/privacy"
            target="_blank"
            className="mx-1 text-blue-600 underline hover:text-blue-800"
          >
            מדיניות הפרטיות
          </Link>
          ולעיבוד הנתונים שלי כמתואר בה (גרסה {versions.privacyPolicy})
        </span>
      </label>

      {/* AUP */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={consents.acceptableUse}
          onChange={(e) => updateConsent("acceptableUse", e.target.checked)}
          className="mt-1 h-4 w-4 cursor-pointer accent-blue-600"
          required
        />
        <span className="text-sm text-gray-700">
          אני מתחייב/ת לעמוד ב
          <Link
            href="/aup"
            target="_blank"
            className="mx-1 text-blue-600 underline hover:text-blue-800"
          >
            מדיניות השימוש המקובל
          </Link>
          ובכלל זה: לבדוק כל טיוטה לפני אישור משלוח, לקבל הסכמת צרכני קצה
          לפני שיווק (סעיף 30א), ולא לעבוד בענפים האסורים (גרסה {versions.acceptableUse})
        </span>
      </label>

      {/* Iron Rule explicit acknowledgment - the key contractual covenant */}
      <div className="border-t border-gray-300 pt-3">
        <p className="rounded bg-yellow-50 border border-yellow-200 p-3 text-sm text-gray-800">
          <strong>⚠️ עיקרון מהותי בחוזה:</strong> "AI מסמן, בעלים מחליט". המערכת
          מציעה טיוטות ולא שולחת באופן אוטומטי. <strong>אני מתחייב/ת לבדוק כל
          טיוטה לפני אישור משלוח</strong>, לרבות בדיקת דיוק עובדות, היעדר תוכן
          פוגעני, וציות לחוקים. אחריותי המלאה בכל תוכן ששלחתי לאחר אישור.
        </p>
      </div>

      {/* Marketing (separate, optional) */}
      <div className="border-t border-gray-300 pt-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consents.marketingOptIn}
            onChange={(e) => updateConsent("marketingOptIn", e.target.checked)}
            className="mt-1 h-4 w-4 cursor-pointer accent-blue-600"
          />
          <span className="text-sm text-gray-600">
            אני מעוניין/ת לקבל מ-Spike Engine עדכוני מוצר, טיפים ומבצעים
            באימייל. ניתן להסיר בכל עת. <em>(לא חובה)</em>
          </span>
        </label>
      </div>

      {/* Status indicator */}
      {!isValid && (
        <p className="text-xs text-red-600">
          יש לאשר את שלושת ההסכמות הראשונות כדי להמשיך
        </p>
      )}
    </div>
  );
}
