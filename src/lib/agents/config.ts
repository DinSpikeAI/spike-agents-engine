/**
 * Spike Engine — Agents Configuration
 *
 * Static metadata for all 9 agents: visual styling, schedules, descriptions.
 * Used by dashboard cards and drawer header.
 */

import type { AgentId } from "./types";

export interface AgentConfig {
  id: AgentId;
  emoji: string;
  name: string;
  /** CSS gradient for icon-box (linear-gradient string) */
  gradient: string;
  schedule: string;
  description: string;
}

export const AGENTS: Record<AgentId, AgentConfig> = {
  morning: {
    id: "morning",
    emoji: "☀️",
    name: "סוכן בוקר",
    gradient: "linear-gradient(135deg, #FCD34D, #F59E0B)",
    schedule: "דוח יומי 07:00",
    description: "דוח יומי עם פעילות אתמול ויעדים להיום",
  },
  reviews: {
    id: "reviews",
    emoji: "⭐",
    name: "סוכן ביקורות",
    gradient: "linear-gradient(135deg, #FB7185, #F43F5E)",
    schedule: "בדיקה כל שעתיים",
    description: "תגובות לביקורות Google ו-Instagram",
  },
  social: {
    id: "social",
    emoji: "📱",
    name: "סוכן רשתות",
    gradient: "linear-gradient(135deg, #A78BFA, #8B5CF6)",
    schedule: "3 פוסטים יומיים",
    description: "פוסטים מקוריים בעברית לרשתות החברתיות",
  },
  manager: {
    id: "manager",
    emoji: "🧠",
    name: "סוכן מנהל",
    gradient: "linear-gradient(135deg, #F0ABFC, #E879F9)",
    schedule: "סיכום אסטרטגי 19:00",
    description: "סיכום אסטרטגי יומי — תלונות, מילות מפתח, הזדמנויות",
  },
  watcher: {
    id: "watcher",
    emoji: "🎯",
    name: "סוכן מעקב",
    gradient: "linear-gradient(135deg, #5BD0F2, #06B6D4)",
    schedule: "התראות real-time",
    description: "התראות בזמן אמת על אירועים חשובים",
  },
  cleanup: {
    id: "cleanup",
    emoji: "🧹",
    name: "סוכן ניקיון",
    gradient: "linear-gradient(135deg, #34D399, #10B981)",
    schedule: "יום ראשון 09:00",
    description: "ניקוי לידים מתים, כפילויות, ופעולות חסרות",
  },
  sales: {
    id: "sales",
    emoji: "💰",
    name: "סוכן מכירות",
    gradient: "linear-gradient(135deg, #FBBF24, #D97706)",
    schedule: "א-ה 10:00",
    description: "מעקב פולואפים והמשכים בעסקאות",
  },
  inventory: {
    id: "inventory",
    emoji: "📦",
    name: "סוכן מלאי",
    gradient: "linear-gradient(135deg, #94A3B8, #64748B)",
    schedule: "08:00 כל יום",
    description: "תחזית ביקוש וההזמנות",
  },
  hot_leads: {
    id: "hot_leads",
    emoji: "🔥",
    name: "סוכן לידים חמים",
    gradient: "linear-gradient(135deg, #FB923C, #EA580C)",
    schedule: "כל 30 דקות",
    description: "דירוג חכם של לידים לפי בשלות",
  },
};

export const AGENT_LIST: AgentConfig[] = [
  AGENTS.morning,
  AGENTS.reviews,
  AGENTS.social,
  AGENTS.manager,
  AGENTS.watcher,
  AGENTS.cleanup,
  AGENTS.sales,
  AGENTS.inventory,
  AGENTS.hot_leads,
];
