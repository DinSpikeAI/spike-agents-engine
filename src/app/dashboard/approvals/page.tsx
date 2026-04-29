import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { listPendingDrafts } from "@/app/dashboard/actions";
import { ApprovalsList } from "@/components/dashboard/approvals-list";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userEmail = user.email ?? "";
  const result = await listPendingDrafts();

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
                תיבת אישורים
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                כל טיוטה שהסוכנים הכינו מחכה כאן לאישורך לפני שתישלח. שום פעולה
                חיצונית לא יוצאת בלי לחיצה שלך.
              </p>
            </div>
          </div>

          {/* Content */}
          {!result.success ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
              ⚠️ שגיאה בטעינת הטיוטות: {result.error}
            </div>
          ) : (result.drafts ?? []).length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-12 text-center">
              <div className="mb-3 text-5xl">📭</div>
              <h2 className="text-xl font-semibold text-slate-200">
                אין טיוטות מחכות לאישור
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                הרץ סוכן (כמו סוכן ביקורות) מהדשבורד כדי לראות טיוטות כאן.
              </p>
              <Link
                href="/dashboard"
                className="mt-4 inline-block rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-teal-400"
              >
                חזרה לדשבורד
              </Link>
            </div>
          ) : (
            <ApprovalsList drafts={result.drafts ?? []} />
          )}
        </main>
      </div>
    </div>
  );
}
