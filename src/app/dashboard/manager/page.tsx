import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import {
  listManagerReports,
  markManagerReportRead,
  getManagerLockState,
} from "@/app/dashboard/actions";
import { ManagerReportCard } from "@/components/dashboard/manager-report-card";

export const dynamic = "force-dynamic";

export default async function ManagerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const userEmail = user.email ?? "";

  // ─── Fetch reports ────────────────────────────────────────
  const result = await listManagerReports(10);
  const reports = result.success ? (result.reports ?? []) : [];

  // ─── If latest is unread → mark it read NOW ───────────────
  // This is the moment the 7-day lock starts.
  // Idempotent: markManagerReportRead has a WHERE read_at IS NULL guard.
  if (reports.length > 0 && reports[0].read_at === null) {
    await markManagerReportRead(reports[0].id);
    // Re-fetch so the UI shows the updated read_at and lock state.
    const refetch = await listManagerReports(10);
    if (refetch.success) {
      reports.splice(0, reports.length, ...(refetch.reports ?? []));
    }
  }

  // ─── Get current lock state for banner ────────────────────
  const lockResult = await getManagerLockState();
  const lockState = lockResult.success ? lockResult.state : null;

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
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              ← חזרה לסקירה
            </Link>
            <h1 className="mt-2 text-3xl font-bold text-slate-100">
              🧠 דוח מנהל
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              סקירה שבועית של בריאות המערכת — איכות הסוכנים, חריגות, מדדי
              צמיחה והמלצה אחת לפעולה.
            </p>
          </div>

          {/* Lock-state banner */}
          {lockState && lockState.reason === "weekly_lock" && (
            <div className="mb-6 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-sm text-violet-200">
              🔒 הדוח הבא יהיה זמין בעוד{" "}
              <span className="font-semibold">
                {lockState.daysUntilNext > 0
                  ? `${lockState.daysUntilNext} ${
                      lockState.daysUntilNext === 1 ? "יום" : "ימים"
                    }`
                  : `${lockState.hoursUntilNext} ${
                      lockState.hoursUntilNext === 1 ? "שעה" : "שעות"
                    }`}
              </span>
              .{" "}
              <span className="text-violet-400/70">
                סוכן המנהל רץ פעם בשבוע כדי לתת תמונה רחבה ויציבה.
              </span>
            </div>
          )}

          {/* Content */}
          {!result.success ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
              ⚠️ שגיאה בטעינת הדוחות: {result.error}
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-12 text-center">
              <div className="mb-3 text-5xl">📊</div>
              <h2 className="text-xl font-semibold text-slate-200">
                עוד אין דוחות מנהל
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                הרץ סוכן מנהל מהדשבורד כדי ליצור את הדוח הראשון.
              </p>
              <Link
                href="/dashboard"
                className="mt-4 inline-block rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400"
              >
                חזרה לדשבורד
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <ManagerReportCard report={reports[0]} isLatest={true} />

              {reports.length > 1 && (
                <details className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-slate-400 hover:text-slate-200">
                    📚 דוחות קודמים ({reports.length - 1})
                  </summary>
                  <div className="mt-4 space-y-4">
                    {reports.slice(1).map((r) => (
                      <ManagerReportCard key={r.id} report={r} isLatest={false} />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
