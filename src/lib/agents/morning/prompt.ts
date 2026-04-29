// src/lib/agents/morning/prompt.ts
import "server-only";

export interface MorningPromptContext {
  ownerName: string;
  businessName: string;
  todaysEvents: Array<{
    time: string;
    title: string;
    type?: "meeting" | "deadline" | "reminder";
  }>;
  yesterdayMetrics: {
    revenue?: number;
    orders?: number;
    visitors?: number;
    leads?: number;
  };
  pendingTasks: Array<{
    title: string;
    priority: "high" | "medium" | "low";
    dueDate?: string;
  }>;
  recentUpdates: string[];
}

export const MORNING_AGENT_SYSTEM_PROMPT = `אתה סוכן הבוקר של Spike Engine.
התפקיד שלך: ליצור בריפינג בוקר קצר וממוקד לבעל עסק.
טון: מקצועי, חם, ישיר. עברית טבעית.
ענה רק ב-JSON תקני. אל תוסיף טקסט מחוץ ל-JSON.`;

export function buildMorningUserMessage(context: MorningPromptContext): string {
  const today = new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : "ערב טוב";

  const events =
    context.todaysEvents.length > 0
      ? context.todaysEvents.map((e) => `- ${e.time}: ${e.title}`).join("\n")
      : "אין פגישות מתוכננות";

  const metrics = Object.entries(context.yesterdayMetrics)
    .filter(([, v]) => v != null)
    .map(([k, v]) => {
      const labels: Record<string, string> = {
        revenue: "הכנסות",
        orders: "הזמנות",
        visitors: "מבקרים",
        leads: "לידים",
      };
      return `- ${labels[k] ?? k}: ${v}`;
    })
    .join("\n") || "אין נתונים מאתמול";

  const tasks =
    context.pendingTasks.length > 0
      ? context.pendingTasks
          .slice(0, 5)
          .map((t) => `- ${t.title}`)
          .join("\n")
      : "אין משימות פתוחות";

  return `${greeting}! היום ${today}.

עסק: ${context.businessName}
בעלים: ${context.ownerName}

לוז היום:
${events}

נתוני אתמול:
${metrics}

משימות פתוחות:
${tasks}

צור בריפינג בוקר קצר ומועיל.`;
}