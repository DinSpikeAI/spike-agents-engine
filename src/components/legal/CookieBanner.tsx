// src/components/legal/CookieBanner.tsx
//
// באנר עוגיות עם 3 כפתורים שווים (אישור הכל / דחיית הכל / התאמה אישית)
// תואם תיקון 13 + ePrivacy Directive Art. 5(3)
//
// עקרונות:
// - כל העוגיות הלא-חיוניות OFF as default
// - כפתורי "אישור" ו"דחייה" בגודל וחשיבות זהים (no dark patterns)
// - תיעוד הבחירה ב-localStorage + שליחה ל-/api/consent
// - שמירת הבחירה ל-12 חודשים, ולאחר מכן בקשה מחודשת
//
// שימוש: בלייאאוט הראשי מעל כל הקומפוננטות:
//   <CookieBanner />
//   {children}

"use client";

import { useEffect, useState } from "react";

type ConsentChoice = "accepted_all" | "rejected_all" | "customized";

type ConsentPrefs = {
  essential: true; // always true
  analytics: boolean;
  marketing: boolean;
};

type StoredConsent = {
  choice: ConsentChoice;
  prefs: ConsentPrefs;
  timestamp: string;
  version: string;
};

const COOKIE_BANNER_VERSION = "1.0";
const STORAGE_KEY = "spike_cookie_consent";
const CONSENT_VALIDITY_DAYS = 365;

export default function CookieBanner() {
  const [show, setShow] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [prefs, setPrefs] = useState<ConsentPrefs>({
    essential: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    // Check existing consent
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredConsent;
        const ageMs =
          Date.now() - new Date(parsed.timestamp).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);

        if (ageDays < CONSENT_VALIDITY_DAYS && parsed.version === COOKIE_BANNER_VERSION) {
          // Valid consent on file
          applyConsentToScripts(parsed.prefs);
          return;
        }
      }
    } catch {
      // localStorage unavailable or corrupted - show banner
    }

    setShow(true);
  }, []);

  const persistConsent = async (
    choice: ConsentChoice,
    finalPrefs: ConsentPrefs
  ) => {
    const record: StoredConsent = {
      choice,
      prefs: finalPrefs,
      timestamp: new Date().toISOString(),
      version: COOKIE_BANNER_VERSION,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // ignore - might be private mode
    }

    // Log to backend for audit trail (anonymous if no auth)
    try {
      await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "cookie_policy",
          documentVersion: COOKIE_BANNER_VERSION,
          consented: choice !== "rejected_all",
          consentMethod: "cookie_banner",
        }),
      });
    } catch {
      // network failure - localStorage is the source of truth on client
    }

    applyConsentToScripts(finalPrefs);
    setShow(false);
  };

  const handleAcceptAll = () => {
    const all: ConsentPrefs = {
      essential: true,
      analytics: true,
      marketing: true,
    };
    setPrefs(all);
    persistConsent("accepted_all", all);
  };

  const handleRejectAll = () => {
    const none: ConsentPrefs = {
      essential: true,
      analytics: false,
      marketing: false,
    };
    setPrefs(none);
    persistConsent("rejected_all", none);
  };

  const handleSaveCustom = () => {
    persistConsent("customized", prefs);
  };

  if (!show) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-300 bg-white shadow-2xl"
      dir="rtl"
      role="dialog"
      aria-labelledby="cookie-banner-title"
    >
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        {!showCustomize ? (
          <>
            <h2
              id="cookie-banner-title"
              className="mb-2 text-base font-semibold text-gray-900 md:text-lg"
            >
              🍪 אתר Spike Engine משתמש בעוגיות
            </h2>
            <p className="mb-4 text-sm text-gray-600 md:text-base">
              עוגיות חיוניות (תמיד פעילות) מאפשרות התחברות ואבטחה. עוגיות
              אנליטיקה עוזרות לנו להבין שימוש ולשפר את האתר. עוגיות שיווק עוזרות
              להציג מודעות מותאמות. בחר מה מתאים לך:
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              {/* All three buttons identical size, color, prominence — NO dark patterns */}
              <button
                onClick={handleAcceptAll}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                אישור הכל
              </button>
              <button
                onClick={handleRejectAll}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                דחיית הכל
              </button>
              <button
                onClick={() => setShowCustomize(true)}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                התאמה אישית
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
              <a
                href="/cookies"
                className="underline hover:text-gray-700"
                target="_blank"
              >
                מדיניות עוגיות מלאה
              </a>
              <span>·</span>
              <a
                href="/privacy"
                className="underline hover:text-gray-700"
                target="_blank"
              >
                מדיניות פרטיות
              </a>
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              התאמה אישית של עוגיות
            </h2>

            <div className="space-y-3">
              {/* Essential — disabled, always on */}
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked
                  disabled
                  className="mt-1 h-4 w-4 cursor-not-allowed"
                />
                <div>
                  <span className="font-medium text-gray-900">
                    עוגיות חיוניות (חובה)
                  </span>
                  <p className="text-sm text-gray-600">
                    התחברות, אבטחה, וזיכרון בחירותיך. בלעדיהן האתר לא יפעל.
                  </p>
                </div>
              </label>

              {/* Analytics */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.analytics}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, analytics: e.target.checked }))
                  }
                  className="mt-1 h-4 w-4 cursor-pointer accent-blue-600"
                />
                <div>
                  <span className="font-medium text-gray-900">
                    עוגיות אנליטיקה
                  </span>
                  <p className="text-sm text-gray-600">
                    Google Analytics — סטטיסטיקות שימוש אנונימיות לשיפור האתר.
                  </p>
                </div>
              </label>

              {/* Marketing */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.marketing}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, marketing: e.target.checked }))
                  }
                  className="mt-1 h-4 w-4 cursor-pointer accent-blue-600"
                />
                <div>
                  <span className="font-medium text-gray-900">
                    עוגיות שיווק
                  </span>
                  <p className="text-sm text-gray-600">
                    מעקב התנהגותי לפרסום מותאם בפלטפורמות אחרות.
                  </p>
                </div>
              </label>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={handleSaveCustom}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                שמירת בחירותיי
              </button>
              <button
                onClick={() => setShowCustomize(false)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                חזרה
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Apply consent to actual scripts (Google Analytics, Meta Pixel, etc.)
function applyConsentToScripts(prefs: ConsentPrefs) {
  // Google Consent Mode v2
  if (typeof window !== "undefined" && (window as any).gtag) {
    (window as any).gtag("consent", "update", {
      analytics_storage: prefs.analytics ? "granted" : "denied",
      ad_storage: prefs.marketing ? "granted" : "denied",
      ad_user_data: prefs.marketing ? "granted" : "denied",
      ad_personalization: prefs.marketing ? "granted" : "denied",
    });
  }

  // Inject Meta Pixel only if marketing consented
  if (prefs.marketing && typeof window !== "undefined") {
    // load Meta Pixel script here when ready
  }

  // Dispatch event for any other listeners (custom analytics, etc.)
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("spike:cookie-consent-changed", { detail: prefs })
    );
  }
}

// Helper to expose "Cookie Settings" link in footer to re-open the banner
export function reopenCookieBanner() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  window.location.reload();
}
