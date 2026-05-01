import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import {
  listManagerReports,
  markManagerReportRead,
  getManagerLockState,
  listPendingDrafts,
} from "@/app/dashboard/actions";
import { ManagerReportCard } from "@/components/dashboard/manager-report-card";
import { AppleBg } from "@/components/ui/apple-bg";
import { Glass } from "@/components/ui/glass";
import { ArrowRight, Brain, Lock, BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ManagerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const userEmail = user.email ?? "";

  // ─── Fetch reports + drafts (for sidebar badge) ───────────
  const [result, draftsResult] = await Promise.all([
    listManagerReports(10),
    listPendingDrafts(),
  ]);
  const reports = result.success ? result.reports ?? [] : [];
  const pendingCount = draftsResult.success
    ? draftsResult.drafts?.filter((d) => d.status === "pending").length ?? 0
    : 0;

  // ─── If latest is unread → mark it read NOW ───────────────
  if (reports.length > 0 && reports[0].read_at === null) {
    await markManagerReportRead(reports[0].id);
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
      style={{ color: "var(--color-ink)" }}
    >
      <AppleBg />

      <Sidebar
        userEmail={userEmail}
        isAdmin={isAdminEmail(userEmail)}
        pendingCount={pendingCount}
      />

      <div className="md:mr-[232px]">
        <main className="spike-scroll mx-auto max-w-[1280px] px-6 pb-20 pt-8 md:px-10">
          {/* Header */}
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-[12.5px] transition-colors"
              style={{ color: "var(--color-ink-3)" }}
            >
              <ArrowRight size={12} strokeWidth={1.75} />
              חזרה לסקירה
            </Link>
            <div className="mt-3 flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-[12px] text-[22px]"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(245,247,252,0.7))",
                  border: "1px solid rgba(255,255,255,0.9)",
                  boxShadow:
                    "0 4px 12px rgba(15,20,30,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
                }}
              >
                🧠
              </div>
              <div>
                <h1
                  className="text-[28px] font-bold leading-none tracking-[-0.025em]"
                  style={{ color: "var(--color-ink)" }}
                >
                  דוח מנהל
                </h1>
                <p
                  className="mt-1 text-[12.5px]"
                  style={{ color: "var(--color-ink-3)" }}
                >
                  סקירה שבועית · איכות, חריגות, מדדים, המלצה
                </p>
              </div>
            </div>
          </div>

          {/* Lock-state banner */}
          {lockState && lockState.reason === "weekly_lock" && (
            <Glass className="mb-6 flex items-start gap-3 p-3.5">
              <div
                className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px]"
                style={{
                  background: "rgba(88, 86, 214, 0.12)",
                  color: "#5856D6",
                }}
              >
                <Lock size={14} strokeWidth={1.75} />
              </div>
              <div className="flex-1 text-[12.5px] leading-relaxed">
                <span style={{ color: "var(--color-ink)" }}>
                  הדוח הבא יהיה זמין בעוד{" "}
                </span>
                <span
                  className="font-semibold"
                  style={{ color: "var(--color-ink)" }}
                >
                  {lockState.daysUntilNext > 0
                    ? `${lockState.daysUntilNext} ${
                        lockState.daysUntilNext === 1 ? "יום" : "ימים"
                      }`
                    : `${lockState.hoursUntilNext} ${
                        lockState.hoursUntilNext === 1 ? "שעה" : "שעות"
                      }`}
                </span>
                <span style={{ color: "var(--color-ink-3)" }}>
                  {" · "}סוכן המנהל רץ פעם בשבוע כדי לתת תמונה רחבה ויציבה.
                </span>
              </div>
            </Glass>
          )}

          {/* Content */}
          {!result.success ? (
            <Glass className="p-5">
              <div
                className="text-[13px]"
                style={{ color: "var(--color-sys-pink)" }}
              >
                ⚠️ שגיאה בטעינת הדוחות: {result.error}
              </div>
            </Glass>
          ) : reports.length === 0 ? (
            <Glass className="p-12 text-center">
              <div
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[14px]"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(245,247,252,0.7))",
                  border: "1px solid rgba(255,255,255,0.9)",
                  boxShadow:
                    "0 4px 12px rgba(15,20,30,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
                }}
              >
                <BarChart3
                  size={24}
                  strokeWidth={1.5}
                  style={{ color: "var(--color-ink-3)" }}
                />
              </div>
              <h2
                className="text-[18px] font-semibold tracking-tight"
                style={{ color: "var(--color-ink)" }}
              >
                עוד אין דוחות מנהל
              </h2>
              <p
                className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed"
                style={{ color: "var(--color-ink-2)" }}
              >
                הרץ סוכן מנהל מהדשבורד כדי ליצור את הדוח הראשון.
              </p>
              <Link
                href="/dashboard"
                className="mt-5 inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-medium text-white transition-all"
                style={{
                  background: "var(--color-sys-blue)",
                  boxShadow: "var(--shadow-cta)",
                }}
              >
                חזרה לדשבורד
              </Link>
            </Glass>
          ) : (
            <div className="space-y-6">
              <ManagerReportCard report={reports[0]} isLatest={true} />

              {reports.length > 1 && (
                <Glass className="p-4">
                  <details>
                    <summary
                      className="cursor-pointer text-[13px] font-medium transition-colors"
                      style={{ color: "var(--color-ink-2)" }}
                    >
                      📚 דוחות קודמים ({reports.length - 1})
                    </summary>
                    <div className="mt-4 space-y-4">
                      {reports.slice(1).map((r) => (
                        <ManagerReportCard
                          key={r.id}
                          report={r}
                          isLatest={false}
                        />
                      ))}
                    </div>
                  </details>
                </Glass>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
