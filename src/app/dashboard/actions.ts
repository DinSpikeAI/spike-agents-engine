"use server";

import { createClient } from "@/lib/supabase/server";
import { runMorningAgent } from "@/lib/agents/morning/run";
import { runWatcherAgent } from "@/lib/agents/watcher/run";
import type {
  MorningAgentOutput,
  WatcherAgentOutput,
  RunResult,
} from "@/lib/agents/types";

// ─────────────────────────────────────────────────────────────
// Shared helper: resolve current user's active tenant
// ─────────────────────────────────────────────────────────────

async function getActiveTenant(): Promise<
  { tenantId: string } | { error: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "לא מחובר. אנא התחבר מחדש." };
  }

  const { data: settings, error: settingsError } = await supabase
    .from("user_settings")
    .select("active_tenant_id")
    .eq("user_id", user.id)
    .single();

  if (settingsError || !settings?.active_tenant_id) {
    return { error: "לא נמצא tenant פעיל. צור קשר עם התמיכה." };
  }

  return { tenantId: settings.active_tenant_id };
}

// ─────────────────────────────────────────────────────────────
// Morning Agent trigger
// ─────────────────────────────────────────────────────────────

export async function triggerMorningAgentAction(): Promise<{
  success: boolean;
  result?: RunResult<MorningAgentOutput>;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const result = await runMorningAgent(tenant.tenantId, "manual");
    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[triggerMorningAgentAction] Error:", err);
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────
// Watcher Agent trigger
// ─────────────────────────────────────────────────────────────
//
// TODO Day 8: replace the hardcoded mockRecentEvents with real data
// from connected sources (Google Business Profile, Instagram Graph,
// Calendar, CRM, inventory). Until then, these 4 events let us visually
// verify the Hero+List UI without depending on integrations.

export async function triggerWatcherAgentAction(): Promise<{
  success: boolean;
  result?: RunResult<WatcherAgentOutput>;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    // ⚠️ DEV ONLY — remove when integrations land.
    const mockRecentEvents = [
      {
        source: "Google Reviews",
        summary:
          "ביקורת חדשה: 1★ מיוסי לוי — 'השירות היה איטי, חיכיתי 40 דקות'",
        occurredAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      },
      {
        source: "Instagram DM",
        summary:
          "פנייה מ-@dana_fashion: 'מעוניינת לקנות לחתונה השבוע, מתי הקולקציה הבאה?'",
        occurredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
      {
        source: "יומן",
        summary: "פגישה ב-15:00 עם רחל אברהם — להכין שאלון התאמה",
        occurredAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
      {
        source: "מלאי",
        summary:
          "מוצר #PT-204 (סלמון נורבגי): נשארו 12 יחידות, ממוצע מכירה יומי 18",
        occurredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const result = await runWatcherAgent(tenant.tenantId, "manual", {
      recentEvents: mockRecentEvents,
    });

    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[triggerWatcherAgentAction] Error:", err);
    return { success: false, error: message };
  }
}
