// src/app/dashboard/page.tsx
//
// v0.5 Dashboard - app shell layout (sidebar + header + content).
// Server Component: fetches user, redirects to login if no session.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { WhatsAppFab } from "@/components/dashboard/whatsapp-fab";
import { signOut } from "./actions";

export const metadata = {
  title: "סקירה - Spike",
};

const AGENTS = [
  { id: "morning", emoji: "☀️", name: "סוכן בוקר", schedule: "07:00 כל יום", description: "דוח יומי עם פעילות אתמול ויעדים להיום" },
  { id: "reviews", emoji: "⭐", name: "סוכן ביקורות", schedule: "כל שעתיים", description: "תגובות לביקורות Google ו-Instagram" },
  { id: "social", emoji: "📱", name: "סוכן רשתות", schedule: "3 פוסטים ביום", description: "פוסטים מקוריים בעברית לרשתות החברתיות" },
  { id: "manager", emoji: "🧠", name: "סוכן מנהל", schedule: "19:00 כל יום", description: "סיכום אסטרטגי יומי - החלטות, סיכונים, הזדמנויות" },
  { id: "watcher", emoji: "🎯", name: "סוכן מעקב", schedule: "כל 15 דקות", description: "התראות בזמן אמת על אירועים חשובים" },
  { id: "cleanup", emoji: "🧹", name: "סוכן ניקיון", schedule: "יום ראשון 09:00", description: "ניקוי לידים מתים, כפילויות, ופעולות חסרות" },
  { id: "sales", emoji: "💰", name: "סוכן מכירות", schedule: "א-ה 10:00", description: "מעקב פולואפים והמשכים בעסקאות" },
  { id: "inventory", emoji: "📦", name: "סוכן מלאי", schedule: "08:00 כל יום", description: "תחזית ביקוש וההזמנות" },
  { id: "hot_leads", emoji: "🔥", name: "סוכן לידים חמים", schedule: "כל 30 דקות", description: "דירוג חכם של לידים לפי בשלות" },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "בוקר טוב";
  if (hour >= 11 && hour < 16) return "צהריים טובים";
  if (hour >= 16 && hour < 19) return "אחר צהריים טובים";
  return "ערב טוב";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userName = user.email?.split("@")[0] || "אורח";
  const greeting = getGreeting();

  return (
    <div className="min-h-screen">
      {/* Sidebar */}
      <Sidebar userEmail={user.email || ""} />

      {/* Main content - margin to account for fixed sidebar on desktop */}
      <main className="lg:me-64">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {/* Mobile header bar */}
          <div className="lg:hidden flex items-center justify-between mb-6">
            <Sidebar userEmail={user.email || ""} />
            <span className="text-lg font-bold bg-gradient-to-r from-[#22D3B0] to-[#5BD0F2] bg-clip-text text-transparent">
              Spike Engine
            </span>
          </div>

          {/* Greeting */}
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl font-bold mb-1">
              {greeting},{" "}
              <span className="bg-gradient-to-r from-[#22D3B0] to-[#5BD0F2] bg-clip-text text-transparent">
                {userName}
              </span>
            </h1>
            <p className="text-sm text-muted-foreground">
              הסוכנים שלך עובדים מאחורי הקלעים
            </p>
          </div>

          {/* KPI Header */}
          <DashboardHeader />

          {/* Day 2.5 banner */}
          <div className="mb-6 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <p className="text-sm text-amber-200">
              ⚠️ <strong>Day 2.5 - בפיתוח.</strong> הסוכנים עוד לא רצים. הדאשבורד placeholder. נחבר אותם החל מ-Day 3.
            </p>
          </div>

          {/* Agent grid */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4">הסוכנים שלך</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {AGENTS.map((agent) => (
                <Card
                  key={agent.id}
                  className="hover:border-primary/40 transition-all hover:shadow-lg hover:-translate-y-0.5"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="flex items-center gap-3 text-base">
                        <span className="text-3xl">{agent.emoji}</span>
                        <span>{agent.name}</span>
                      </CardTitle>
                      <Badge
                        variant="outline"
                        className="text-xs border-slate-500/30 text-slate-300"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 me-1.5"></span>
                        מחכה
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                      {agent.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ⏰ {agent.schedule}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Sign out at bottom */}
          <div className="mt-12 pt-6 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground" dir="ltr">
              app.spikeai.co.il · Day 2.5 of 14
            </p>
            <form action={signOut}>
              <Button variant="ghost" size="sm" type="submit">התנתק</Button>
            </form>
          </div>
        </div>
      </main>

      {/* WhatsApp FAB */}
      <WhatsAppFab />
    </div>
  );
}