import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { listClassifiedLeads } from "@/app/dashboard/actions";
import { LeadsBoard } from "@/components/dashboard/leads-board";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userEmail = user.email ?? "";
  const result = await listClassifiedLeads();

  return (
    <div
      className="relative min-h-screen"
      dir="rtl"
      style={{ background: "var(--spike-bg)", color: "var(--spike-text)" }}
    >
      <Sidebar userEmail={userEmail} />

      <div className="md:mr-[248px]">
        <main className="spike-scroll mx-auto max-w-[1400px] px-6 pb-20 pt-8 md:px-10">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <Link
                href="/dashboard"
                className="text-sm text-slate-400 hover:text-slate-200"
              >
                ← חזרה לסקירה
              </Link>
              <h1 className="mt-2 text-3xl font-bold text-slate-100">
                לידים חמים
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                כל הפניות הנכנסות מסווגות לפי פוטנציאל סגירה. הסיווג מתבסס אך
                ורק על ההתנהגות בהודעה — לא על שם או דמוגרפיה.
              </p>
            </div>
          </div>

          {/* Bias notice */}
          <div className="mb-6 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-200">
            <span className="font-semibold">🛡️ הגנת אפליה: </span>
            הסוכן מקבל רק טקסט ההודעה ומאפייני התנהגות (אורך, מילות כוונה,
            סימני דחיפות). הוא לא רואה שמות, מספרי טלפון, תמונות או handles.
            ביקורת הטיות חודשית רצה ב-Day 13.
          </div>

          {/* Content */}
          {!result.success ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
              ⚠️ שגיאה בטעינת הלידים: {result.error}
            </div>
          ) : (result.leads ?? []).length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-12 text-center">
              <div className="mb-3 text-5xl">🎯</div>
              <h2 className="text-xl font-semibold text-slate-200">
                אין לידים מסווגים
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                הרץ סוכן לידים חמים מהדשבורד כדי לראות לידים כאן.
              </p>
              <Link
                href="/dashboard"
                className="mt-4 inline-block rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-orange-400"
              >
                חזרה לדשבורד
              </Link>
            </div>
          ) : (
            <LeadsBoard leads={result.leads ?? []} />
          )}
        </main>
      </div>
    </div>
  );
}
