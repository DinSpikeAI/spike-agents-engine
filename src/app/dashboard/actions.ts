"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMorningAgent } from "@/lib/agents/morning/run";
import { runWatcherAgent } from "@/lib/agents/watcher/run";
import { runReviewsAgent, type ReviewsRunResult } from "@/lib/agents/reviews/run";
import type {
  MorningAgentOutput,
  WatcherAgentOutput,
  RunResult,
  MockReview,
} from "@/lib/agents/types";

// ─────────────────────────────────────────────────────────────
// Shared: resolve current user's active tenant
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

export async function triggerWatcherAgentAction(): Promise<{
  success: boolean;
  result?: RunResult<WatcherAgentOutput>;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    // ⚠️ DEV ONLY — Day 8: replace with real Google Business / Insta / etc.
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

// ─────────────────────────────────────────────────────────────
// Reviews Agent trigger — Day 8
// ─────────────────────────────────────────────────────────────
//
// 3 mock reviews stress-test the defamation guard:
//   1. 5★ — clear praise → expected: defamation_risk = low
//   2. 3★ — minor complaint → expected: low (factual reply, no defamation)
//   3. 1★ — abusive against the business → tests whether Sonnet falls into
//      the trap of defending too aggressively. Expected: low (because the
//      prompt explicitly forbids characterizing the reviewer), but if it
//      slips, defamation guard catches it.
//
// TODO Day 11: replace with real Google Business Profile API fetch.

export async function triggerReviewsAgentAction(): Promise<{
  success: boolean;
  result?: ReviewsRunResult;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const mockReviews: MockReview[] = [
      {
        id: "mock-google-001",
        reviewerName: "רחלי כהן",
        rating: 5,
        text:
          "חוויה מצוינת! הצוות היה אדיב מאוד, השירות מהיר, והמוצר בדיוק כמו שתואר באתר. בהחלט אחזור ואמליץ לחברות.",
        occurredAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "mock-google-002",
        reviewerName: "אורי פרידמן",
        rating: 3,
        text:
          "המוצר היה בסדר אבל המשלוח התעכב ביומיים יותר ממה שהוצג. הצוות לא יידע אותי מראש על העיכוב — זה היה מאכזב. השירות עצמו היה אדיב.",
        occurredAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "mock-google-003",
        reviewerName: "Anonymous Customer",
        rating: 1,
        text:
          "בזבוז כסף! המוצר הגיע פגום והצוות לא רצה לקבל אותו בחזרה. הם פשוט גנבו לי את הכסף. אנשים, אל תקנו פה!!!",
        occurredAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const result = await runReviewsAgent(
      tenant.tenantId,
      mockReviews,
      "manual"
    );

    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[triggerReviewsAgentAction] Error:", err);
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────
// Approval Inbox queries
// ─────────────────────────────────────────────────────────────

export interface PendingDraft {
  id: string;
  agent_id: string;
  type: string;
  content: Record<string, unknown>;
  status: string;
  action_type: string | null;
  defamation_risk: "low" | "medium" | "high" | null;
  defamation_flagged_phrases: string[] | null;
  contains_pii: boolean;
  recipient_label: string | null;
  context: Record<string, unknown> | null;
  external_target: Record<string, unknown> | null;
  rejection_reason: string | null;
  created_at: string;
  expires_at: string;
}

export async function listPendingDrafts(): Promise<{
  success: boolean;
  drafts?: PendingDraft[];
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { data, error } = await db
      .from("drafts")
      .select(
        "id, agent_id, type, content, status, action_type, defamation_risk, defamation_flagged_phrases, contains_pii, recipient_label, context, external_target, rejection_reason, created_at, expires_at"
      )
      .eq("tenant_id", tenant.tenantId)
      .in("status", ["pending", "rejected"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[listPendingDrafts] DB error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, drafts: (data as PendingDraft[]) ?? [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

export async function approveDraft(
  draftId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "לא מחובר" };

    const db = createAdminClient();
    const { error } = await db
      .from("drafts")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .eq("tenant_id", tenant.tenantId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

export async function rejectDraft(
  draftId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { error } = await db
      .from("drafts")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
        rejection_reason: reason ?? "owner rejected",
      })
      .eq("id", draftId)
      .eq("tenant_id", tenant.tenantId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}
