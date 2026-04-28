"use server";

import { createClient } from "@/lib/supabase/server";
import { runMorningAgent } from "@/lib/agents/morning/run";
import type { MorningAgentOutput, RunResult } from "@/lib/agents/types";

/**
 * Server Action: trigger morning agent for the current user's active tenant.
 * Called from dashboard "הרץ עכשיו" button.
 */
export async function triggerMorningAgentAction(): Promise<{
  success: boolean;
  result?: RunResult<MorningAgentOutput>;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    // 1. Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "לא מחובר. אנא התחבר מחדש." };
    }

    // 2. Get user's active tenant
    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("active_tenant_id")
      .eq("user_id", user.id)
      .single();

    if (settingsError || !settings?.active_tenant_id) {
      return {
        success: false,
        error: "לא נמצא tenant פעיל. צור קשר עם התמיכה.",
      };
    }

    // 3. Run the morning agent (MOCK in Day 3)
    const result = await runMorningAgent(settings.active_tenant_id, "manual");

    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[triggerMorningAgentAction] Error:", err);
    return { success: false, error: message };
  }
}
