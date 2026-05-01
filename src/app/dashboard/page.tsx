import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { ApprovalBanner } from "@/components/dashboard/approval-banner";
import { WhatsAppFab } from "@/components/dashboard/whatsapp-fab";
import { AppleBg } from "@/components/ui/apple-bg";
import { Glass } from "@/components/ui/glass";
import { RunMorningButton } from "@/components/dashboard/run-morning-button";
import { RunWatcherButton } from "@/components/dashboard/run-watcher-button";
import { RunReviewsButton } from "@/components/dashboard/run-reviews-button";
import { RunHotLeadsButton } from "@/components/dashboard/run-hot-leads-button";
import { RunManagerButton } from "@/components/dashboard/run-manager-button";
import { RunSocialButton } from "@/components/dashboard/run-social-button";
import { RunSalesButton } from "@/components/dashboard/run-sales-button";
import {
  listPendingDrafts,
  getManagerLockState,
  getDashboardKpis,
} from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "בוקר טוב";
  if (hour >= 12 && hour < 17) return "צהריים טובים";
  if (hour >= 17 && hour < 21) return "ערב טוב";
  return "לילה טוב";
}

// Agent metadata — desc + role + status from research handoff
const AGENTS = [
  {
    id: "manager",
    emoji: "🧠",
    name: "סוכן מנהל",
    role: "דוח שבועי",
    desc: "סוקר את כל הסוכנים שלך בשבוע האחרון, מזהה חריגות איכות, חישוב מדדי צמיחה והמלצה אחת לפעולה.",
    button: "manager",
  },
  {
    id: "morning",
    emoji: "☀️",
    name: "סוכן הבוקר",
    role: "תדריך יומי",
    desc: "תדריך בוקר עם 3 פעולות לעדיפות ראשונה, על בסיס הלידים והפניות מאתמול.",
    button: "morning",
  },
  {
    id: "watcher",
    emoji: "🎯",
    name: "סוכן מעקב",
    role: "התראות בזמן אמת",
    desc: "מסמן לידים תקועים, פניות שלא נענו ושיחות שמצריכות תגובה היום.",
    button: "watcher",
  },
  {
    id: "reviews",
    emoji: "⭐",
    name: "סוכן ביקורות",
    role: "טיוטות תגובה",
    desc: "מנסח תגובות לביקורות בגוגל ופייסבוק, בודק טון ומחכה לאישורך לפני שליחה.",
    button: "reviews",
  },
  {
    id: "leads",
    emoji: "🔥",
    name: "סוכן לידים חמים",
    role: "סיווג לידים",
    desc: "מסווג לידים נכנסים ל־Cold / Warm / Hot / Burning לפי התנהגות בפועל.",
    button: "leads",
  },
  {
    id: "social",
    emoji: "📱",
    name: "סוכן רשתות",
    role: "פוסטים יומיים",
    desc: "מכין 3 טיוטות פוסטים יומיים בעברית לאינסטגרם ופייסבוק. אתה מאשר ושולח בעצמך.",
    button: "social",
  },
  {
    id: "sales",
    emoji: "💰",
    name: "סוכן מכירות",
    role: "פולואו־אפ",
    desc: "מאתר לידים שתקועים יותר מ־3 ימים ומכין follow-up עם קישור ישיר ל-WhatsApp.",
    button: "sales",
  },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userEmail = user.email ?? "";
  const userName = userEmail.split("@")[0] || "din";
  const greeting = getGreeting();

  const [draftsResult, managerLockResult, kpiResult] = await Promise.all([
    listPendingDrafts(),
    getManagerLockState(),
    getDashboardKpis(),
  ]);

  const pendingCount = draftsResult.success
    ? draftsResult.drafts?.filter((d) => d.status === "pending").length ?? 0
    : 0;

  // KPIs — real numbers from DB. Falls back to safe zeros if query failed.
  const kpis = kpiResult.success && kpiResult.kpis
    ? kpiResult.kpis
    : {
        pendingApprovals: pendingCount,
        todaysActions: 0,
        monthlySpend: 0,
        monthlyCap: 0,
      };

  // Build pending summary string
  const pendingSummary = (() => {
    if (!draftsResult.success || !draftsResult.drafts) return "אין טיוטות מחכות";
    const pending = draftsResult.drafts.filter((d) => d.status === "pending");
    if (pending.length === 0) return "אין טיוטות מחכות";

    const counts = {
      sales_followup: 0,
      social_post: 0,
      review_reply: 0,
    };
    for (const d of pending) {
      if (d.type === "sales_followup") counts.sales_followup++;
      else if (d.type === "social_post") counts.social_post++;
      else if (d.type === "review_reply") counts.review_reply++;
    }

    const parts = [];
    if (counts.sales_followup > 0)
      parts.push(`${counts.sales_followup} טיוטות מכירה`);
    if (counts.social_post > 0) parts.push(`${counts.social_post} פוסטים`);
    if (counts.review_reply > 0)
      parts.push(`${counts.review_reply} תגובות לביקורות`);
    return parts.join(" · ");
  })();

  const managerLockState =
    managerLockResult.success && managerLockResult.state
      ? managerLockResult.state
      : {
          canRun: true,
          reason: null,
          nextEligibleAt: null,
          daysUntilNext: 0,
          hoursUntilNext: 0,
          unreadReportId: null,
          lastReadAt: null,
        };

  // Render the right button per agent
  const renderButton = (buttonType: string) => {
    switch (buttonType) {
      case "manager":
        return <RunManagerButton lockState={managerLockState} />;
      case "morning":
        return <RunMorningButton />;
      case "watcher":
        return <RunWatcherButton />;
      case "reviews":
        return <RunReviewsButton />;
      case "leads":
        return <RunHotLeadsButton />;
      case "social":
        return <RunSocialButton />;
      case "sales":
        return <RunSalesButton />;
      default:
        return null;
    }
  };

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
        <main className="spike-scroll mx-auto max-w-[1280px] px-6 pb-20 pt-2 md:px-10">
          <Topbar
            greeting={greeting}
            userName={userName}
            pendingApprovals={pendingCount}
            lastUpdate="לפני 12 דק׳"
          />

          <KpiStrip
            pendingApprovals={kpis.pendingApprovals}
            todaysActions={kpis.todaysActions}
            monthlySpend={kpis.monthlySpend}
            monthlyCap={kpis.monthlyCap}
          />

          {pendingCount > 0 && (
            <Link
              href="/dashboard/approvals"
              className="block transition-opacity hover:opacity-90"
            >
              <ApprovalBanner count={pendingCount} summary={pendingSummary} />
            </Link>
          )}

          {/* Section header */}
          <div className="mb-3 flex items-center pt-2">
            <h2
              className="text-[19px] font-semibold tracking-[-0.01em]"
              style={{ color: "var(--color-ink)" }}
            >
              הסוכנים שלך
            </h2>
          </div>

          {/* Agent grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {AGENTS.map((agent) => (
              <Glass
                key={agent.id}
                className="flex flex-col gap-2.5 p-[18px]"
              >
                <div className="flex items-start justify-between">
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
                    {agent.emoji}
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                    style={{
                      background: "rgba(224, 169, 61, 0.12)",
                      color: "var(--color-sys-amber)",
                    }}
                    title="הסוכן רץ עם נתוני הדגמה. אינטגרציות אמיתיות יחוברו בהמשך."
                  >
                    הדגמה
                  </span>
                </div>
                <div>
                  <div
                    className="text-[15.5px] font-semibold tracking-tight"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {agent.name}
                  </div>
                  <div
                    className="mt-0.5 text-[11.5px]"
                    style={{ color: "var(--color-ink-3)" }}
                  >
                    {agent.role}
                  </div>
                </div>
                <div
                  className="text-[12.5px] leading-[1.55]"
                  style={{ color: "var(--color-ink-2)" }}
                >
                  {agent.desc}
                </div>
                <div className="mt-auto pt-2.5">
                  {renderButton(agent.button)}
                </div>
              </Glass>
            ))}
          </div>
        </main>

        <WhatsAppFab />
      </div>
    </div>
  );
}
