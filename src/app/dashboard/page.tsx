import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { ApprovalBanner } from "@/components/dashboard/approval-banner";
import { WhatsAppFab } from "@/components/dashboard/whatsapp-fab";
import { RunMorningButton } from "@/components/dashboard/run-morning-button";
import { AGENT_LIST } from "@/lib/agents/config";

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

      {/* Main content area, offset by sidebar on desktop */}
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

          {/* Day 3 Mock notice */}
          <div
            className="mb-6 rounded-xl px-4 py-3 text-sm"
            style={{
              background: "rgba(252, 211, 77, 0.05)",
              border: "1px solid rgba(252, 211, 77, 0.15)",
              color: "var(--spike-text-dim)",
            }}
          >
            ⚠️ <strong style={{ color: "var(--spike-amber)" }}>Day 3 - Mock mode.</strong>{" "}
            סוכן הבוקר ניתן להפעלה ידנית. שאר הסוכנים יחוברו ב-Day 4-7.
          </div>

          {/* Run Morning Agent CTA */}
          <div
            className="mb-8 rounded-xl px-6 py-5"
            style={{
              background: "linear-gradient(135deg, rgba(34, 211, 176, 0.06), rgba(91, 208, 242, 0.03))",
              border: "1px solid rgba(34, 211, 176, 0.2)",
            }}
          >
            <h2
              className="mb-2 text-xl font-bold"
              style={{ color: "var(--spike-teal-light)" }}
            >
              ☀️ נסו את סוכן הבוקר
            </h2>
            <p
              className="mb-4 text-sm"
              style={{ color: "var(--spike-text-dim)" }}
            >
              לחצו כדי להריץ את הסוכן עכשיו ולקבל briefing מדומה (Day 3 mock data).
            </p>
            <RunMorningButton />
          </div>

          {/* Agents grid - placeholder, will be replaced in Stage 3 */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2.5 text-lg font-semibold text-white">
              הסוכנים שלך
              <span
                className="inline-flex size-6 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  background: "rgba(34, 211, 176, 0.12)",
                  color: "var(--spike-teal-light)",
                }}
              >
                9
              </span>
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {AGENT_LIST.map((agent) => (
              <div
                key={agent.id}
                className="rounded-xl p-5 transition-all hover:-translate-y-0.5"
                style={{
                  background: "linear-gradient(180deg, var(--spike-surface), var(--spike-bg-2))",
                  border: "1px solid var(--spike-border)",
                }}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-11 flex-shrink-0 items-center justify-center rounded-xl text-xl"
                      style={{ background: agent.gradient }}
                    >
                      {agent.emoji}
                    </div>
                    <h3 className="font-bold text-white">{agent.name}</h3>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[10px] font-medium"
                    style={{
                      background: "rgba(148, 163, 184, 0.08)",
                      color: "var(--spike-text-mute)",
                    }}
                  >
                    מחכה
                  </span>
                </div>
                <p
                  className="mb-3 text-sm leading-relaxed"
                  style={{ color: "var(--spike-text-dim)" }}
                >
                  {agent.description}
                </p>
                <div
                  className="text-xs"
                  style={{ color: "var(--spike-text-mute)" }}
                >
                  ⏰ {agent.schedule}
                </div>
              </div>
            ))}
          </div>
        </main>

        <WhatsAppFab />
      </div>
    </div>
  );
}
