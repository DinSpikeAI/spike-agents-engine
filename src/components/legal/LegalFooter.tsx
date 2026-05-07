"use client";

import Link from "next/link";
import { reopenCookieBanner } from "./CookieBanner";

export default function LegalFooter() {
  return (
    <footer
      dir="rtl"
      className="mt-12 border-t border-gray-200 bg-gray-50 py-6 print:hidden"
    >
      <div className="mx-auto max-w-5xl px-4 text-sm text-gray-600">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/privacy" className="hover:text-gray-900">
            מדיניות פרטיות
          </Link>
          <Link href="/terms" className="hover:text-gray-900">
            תנאי שימוש
          </Link>
          <Link href="/aup" className="hover:text-gray-900">
            מדיניות שימוש מקובל
          </Link>
          <Link href="/cookies" className="hover:text-gray-900">
            מדיניות עוגיות
          </Link>
          <Link href="/sub-processors" className="hover:text-gray-900">
            מעבדי משנה
          </Link>
          <Link href="/dpa" className="hover:text-gray-900">
            DPA
          </Link>
          <Link href="/dsar" className="hover:text-gray-900">
            בקשות גישה לנתונים
          </Link>
          <button
            onClick={reopenCookieBanner}
            className="hover:text-gray-900 underline cursor-pointer"
          >
            הגדרות עוגיות
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          © {new Date().getFullYear()} Spike Engine — דין משה (עוסק פטור) ·
          ישראל · privacy@spikeai.co.il
        </p>
      </div>
    </footer>
  );
}
