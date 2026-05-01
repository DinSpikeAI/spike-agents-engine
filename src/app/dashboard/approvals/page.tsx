import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { listPendingDrafts } from "@/app/dashboard/actions";
import { ApprovalsList } from "@/components/dashboard/approvals-list";
import { AppleBg } from "@/components/ui/apple-bg";
import { Glass } from "@/components/ui/glass";
import { ArrowRight, Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userEmail = user.email ?? "";
  const result = await listPendingDrafts();
  const drafts = result.success ? result.drafts ?? [] : [];
  const pendingCount = drafts.filter((d) => d.status === "pending").length;

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
          <div className="mb-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-[12.5px] transition-colors"
              style={{ color: "var(--color-ink-3)" }}
            >
              <ArrowRight size={12} strokeWidth={1.75} />
              חזרה לסקירה
            </Link>
            <h1
              className="mt-3 text-[32px] font-bold leading-tight tracking-[-0.025em]"
              style={{ color: "var(--color-ink)" }}
            >
              תיבת אישורים
            </h1>
            <p
              className="mt-1.5 text-[13.5px] leading-relaxed"
              style={{ color: "var(--color-ink-2)" }}
            >
              כל טיוטה שהסוכנים הכינו מחכה כאן לאישורך לפני שתישלח. שום פעולה
              חיצונית לא יוצאת בלי לחיצה שלך.
            </p>
          </div>

          {/* Content */}
          {!result.success ? (
            <Glass className="p-5">
              <div
                className="text-[13px]"
                style={{ color: "var(--color-sys-pink)" }}
              >
                ⚠️ שגיאה בטעינת הטיוטות: {result.error}
              </div>
            </Glass>
          ) : drafts.length === 0 ? (
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
                <Inbox
                  size={24}
                  strokeWidth={1.5}
                  style={{ color: "var(--color-ink-3)" }}
                />
              </div>
              <h2
                className="text-[18px] font-semibold tracking-tight"
                style={{ color: "var(--color-ink)" }}
              >
                אין טיוטות מחכות לאישור
              </h2>
              <p
                className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed"
                style={{ color: "var(--color-ink-2)" }}
              >
                הרץ סוכן (כמו סוכן ביקורות, סוכן רשתות או סוכן מכירות) מהדשבורד
                כדי לראות טיוטות כאן.
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
            <ApprovalsList drafts={drafts} />
          )}
        </main>
      </div>
    </div>
  );
}
