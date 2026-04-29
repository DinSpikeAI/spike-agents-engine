import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { ApprovalBanner } from "@/components/dashboard/approval-banner";
import { WhatsAppFab } from "@/components/dashboard/whatsapp-fab";
import { RunMorningButton } from "@/components/dashboard/run-morning-button";
import { RunWatcherButton } from "@/components/dashboard/run-watcher-button";
import { AgentGrid } from "@/components/dashboard/agent-grid";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "בוקר טוב";
  if (hour >= 11 && hour < 16) return "אחר צהריים טובים";
  if (hour >= 16 && hour < 19) return "ערב טוב";
  return "ערב טוב";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userEmail = user.email ?? "";
  const userName = userEmail.split("@")[0] || "Din";
  const greeting = getGreeting();

  return (
    <div
      className="relative min-h-screen"
      dir="rtl"
      style={{ background: "var(--spike-bg)", color: "var(--spike-text)" }}
    >
      <Sidebar userEmail={userEmail} />

      <div className="md:mr-[248px]">
        <main
          className="spike-scroll mx-auto max-w-[1400px] px-6 pb-20 pt-8 md:px-10"
          style={{ position: "relative", zIndex: 1 }}
        >
          <Topbar
            greeting={greeting}
            userName={userName}
            activeAgents={9}
            pendingApprovals={4}
            lastUpdate="לפני 12 דק׳"
          />

          <KpiStrip
            pendingApprovals={4}
            todaysActions={23}
            todaysActionsDelta="▲ 8% מאתמול"
            todaysActionsUp={true}
            todaysActionsSparkline={[15, 12, 14, 8, 10, 4, 6]}
            weeklySavings={1840}
            monthlySpend={0}
            monthlyCap={50}
          />

          <ApprovalBanner
            count={4}
            summary="3 תגובות לביקורות, 1 פוסט אינסטגרם · בדיקה של 30 שניות"
          />

          {/* Morning Agent CTA — Day 5 (real Anthropic) */}
          <div
            className="mb-4 rounded-xl px-6 py-5"
            style={{
              background:
                "linear-gradient(135deg, rgba(34, 211, 176, 0.06), rgba(91, 208, 242, 0.03))",
              border: "1px solid rgba(34, 211, 176, 0.2)",
            }}
          >
            <h2
              className="mb-2 text-xl font-bold"
              style={{ color: "var(--spike-teal-light)" }}
            >
              ☀️ סוכן הבוקר
            </h2>
            <p
              className="mb-4 text-sm"
              style={{ color: "var(--spike-text-dim)" }}
            >
              לחצו כדי לקבל briefing יומי בעברית עם תובנות, לוז ויעדים.
            </p>
            <RunMorningButton />
          </div>

          {/* Watcher Agent CTA — Day 6 */}
          <div
            className="mb-8 rounded-xl px-6 py-5"
            style={{
              background:
                "linear-gradient(135deg, rgba(91, 208, 242, 0.06), rgba(34, 211, 176, 0.03))",
              border: "1px solid rgba(91, 208, 242, 0.2)",
            }}
          >
            <h2
              className="mb-2 text-xl font-bold"
              style={{ color: "var(--spike-cyan)" }}
            >
              🎯 סוכן מעקב
            </h2>
            <p
              className="mb-4 text-sm"
              style={{ color: "var(--spike-text-dim)" }}
            >
              סורק את כל מקורות הנתונים ומחזיר התראות ממוינות לפי דחיפות.
            </p>
            <RunWatcherButton />
          </div>

          {/* Agents grid with filters + drawer */}
          <AgentGrid />
        </main>

        <WhatsAppFab />
      </div>
    </div>
  );
}
