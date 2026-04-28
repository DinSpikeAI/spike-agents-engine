import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { WhatsAppFab } from "@/components/dashboard/whatsapp-fab";
import { RunMorningButton } from "@/components/dashboard/run-morning-button";

const AGENTS = [
  { id: "morning", emoji: "☀️", name: "סוכן בוקר", description: "דוח יומי עם פעילות אתמול ויעדים להיום", schedule: "07:00 כל יום" },
  { id: "reviews", emoji: "⭐", name: "סוכן ביקורות", description: "תגובות לביקורות Google ו-Instagram", schedule: "כל שעתיים" },
  { id: "social", emoji: "📱", name: "סוכן רשתות", description: "פוסטים מקוריים בעברית לרשתות החברתיות", schedule: "3 פוסטים ביום" },
  { id: "manager", emoji: "🧠", name: "סוכן מנהל", description: "סיכום אסטרטגי יומי - החלטות, סיכונים, הזדמנויות", schedule: "19:00 כל יום" },
  { id: "watcher", emoji: "🎯", name: "סוכן מעקב", description: "התראות בזמן אמת על אירועים חשובים", schedule: "כל 15 דקות" },
  { id: "cleanup", emoji: "🧹", name: "סוכן ניקיון", description: "ניקוי לידים מתים, כפילויות, ופעולות חסרות", schedule: "יום ראשון 09:00" },
  { id: "sales", emoji: "💰", name: "סוכן מכירות", description: "מעקב פולואפים והמשכים בעסקאות", schedule: "א-ה 10:00" },
  { id: "inventory", emoji: "📦", name: "סוכן מלאי", description: "תחזית ביקוש וההזמנות", schedule: "08:00 כל יום" },
  { id: "hot_leads", emoji: "🔥", name: "סוכן לידים חמים", description: "דירוג חכם של לידים לפי בשלות", schedule: "כל 30 דקות" },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userEmail = user.email ?? "";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" dir="rtl">
      <Sidebar userEmail={userEmail} />
      <div className="md:mr-60">
        <DashboardHeader />

        <main className="mx-auto max-w-7xl p-6">
          {/* Day 3 banner */}
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            ⚠️ <strong>Day 3 - Mock mode.</strong> סוכן הבוקר ניתן להפעלה ידנית. שאר הסוכנים יחוברו ב-Day 4-7.
          </div>

          {/* Run Morning Agent CTA */}
          <div className="mb-8 rounded-xl border border-teal-500/30 bg-gradient-to-br from-teal-500/10 to-cyan-500/5 p-6">
            <h2 className="mb-2 text-xl font-bold text-teal-300">☀️ נסו את סוכן הבוקר</h2>
            <p className="mb-4 text-sm text-slate-300">
              לחצו כדי להריץ את הסוכן עכשיו ולקבל briefing מדומה (Day 3 mock data).
            </p>
            <RunMorningButton />
          </div>

          {/* Agents grid */}
          <h2 className="mb-4 text-lg font-semibold text-slate-200">הסוכנים שלך</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {AGENTS.map((agent) => (
              <div
                key={agent.id}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition-all hover:border-slate-700"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{agent.emoji}</span>
                    <h3 className="font-semibold text-slate-100">{agent.name}</h3>
                  </div>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                    מחכה
                  </span>
                </div>
                <p className="mb-3 text-sm text-slate-400">{agent.description}</p>
                <div className="text-xs text-slate-500">⏰ {agent.schedule}</div>
              </div>
            ))}
          </div>
        </main>

        <WhatsAppFab />
      </div>
    </div>
  );
}
