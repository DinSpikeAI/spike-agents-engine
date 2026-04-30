"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMorningAgent } from "@/lib/agents/morning/run";
import { runWatcherAgent } from "@/lib/agents/watcher/run";
import { runReviewsAgent, type ReviewsRunResult } from "@/lib/agents/reviews/run";
import { runHotLeadsAgent, type HotLeadsRunResult } from "@/lib/agents/hot_leads/run";
import { runManagerAgent, type ManagerRunResult } from "@/lib/agents/manager/run";
import { runSocialAgent, type SocialRunResult } from "@/lib/agents/social/run";
import type {
  AgentId,
  MorningAgentOutput,
  WatcherAgentOutput,
  RunResult,
  MockReview,
  MockLead,
  LeadBucket,
} from "@/lib/agents/types";

// ─────────────────────────────────────────────────────────────
// Rate limit configuration (non-Manager agents)
// ─────────────────────────────────────────────────────────────
//
// Manager has its own weekly-lock model below — it does NOT use this.
// These cooldowns apply to: morning, watcher, reviews, hot_leads.

const RATE_LIMIT_MINUTES: Record<AgentId, number> = {
  manager: 240, // not used — see weekly lock logic below
  reviews: 30,
  hot_leads: 30,
  watcher: 5,
  morning: 5,
  social: 30,
  sales: 30,
  cleanup: 30,
  inventory: 30,
};

interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterMinutes?: number;
  message?: string;
}

async function checkAgentRateLimit(
  tenantId: string,
  agentId: AgentId
): Promise<RateLimitCheckResult> {
  const cooldownMinutes = RATE_LIMIT_MINUTES[agentId];
  const cooldownMs = cooldownMinutes * 60 * 1000;
  const cutoff = new Date(Date.now() - cooldownMs).toISOString();

  const db = createAdminClient();

  const { data, error } = await db
    .from("agent_runs")
    .select("started_at, status")
    .eq("tenant_id", tenantId)
    .eq("agent_id", agentId)
    .in("status", ["running", "succeeded"])
    .gte("started_at", cutoff)
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error(`[rateLimit] DB error checking ${agentId}:`, error);
    return { allowed: true };
  }

  if (!data || data.length === 0) return { allowed: true };

  const latestRun = data[0];
  const lastRunTime = new Date(latestRun.started_at as string).getTime();
  const elapsedMs = Date.now() - lastRunTime;
  const remainingMs = cooldownMs - elapsedMs;
  const retryAfterMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));

  if (latestRun.status === "running") {
    return {
      allowed: false,
      retryAfterMinutes,
      message: "הסוכן עדיין רץ. המתן עד שהריצה הקודמת תסתיים.",
    };
  }

  const elapsedMinutes = Math.max(1, Math.floor(elapsedMs / 60_000));
  return {
    allowed: false,
    retryAfterMinutes,
    message: `הסוכן רץ לפני ${elapsedMinutes} דק׳. ניתן להפעיל שוב בעוד ${retryAfterMinutes} דק׳.`,
  };
}

// ─────────────────────────────────────────────────────────────
// Manager Agent — weekly lock state
// ─────────────────────────────────────────────────────────────
//
// State machine:
//   1. No reports exist → canRun=true (first run is free)
//   2. Latest report has read_at IS NULL → canRun=false, owner must
//      view the pending report first. unreadReportId is returned so UI
//      can link directly to it.
//   3. Latest report read_at IS NOT NULL:
//      - If now() < next_eligible_run_at → locked, show days remaining
//      - Else → canRun=true (lock has expired)

export interface ManagerLockState {
  canRun: boolean;
  /** Reason for being unable to run (null if canRun=true). */
  reason: "unread_pending" | "weekly_lock" | null;
  /** When the next run is allowed (ISO). Null if canRun=true. */
  nextEligibleAt: string | null;
  /** Days remaining until next eligible run (rounded up). */
  daysUntilNext: number;
  /** Hours remaining if less than a day. */
  hoursUntilNext: number;
  /** ID of unread report if exists — UI links here. */
  unreadReportId: string | null;
  /** When the latest report was read (for display). */
  lastReadAt: string | null;
}

async function getManagerLockStateForTenant(
  tenantId: string
): Promise<ManagerLockState> {
  const db = createAdminClient();

  const { data, error } = await db
    .from("manager_reports")
    .select("id, created_at, read_at, next_eligible_run_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    // No reports yet — owner can run for the first time.
    return {
      canRun: true,
      reason: null,
      nextEligibleAt: null,
      daysUntilNext: 0,
      hoursUntilNext: 0,
      unreadReportId: null,
      lastReadAt: null,
    };
  }

  const latest = data[0];

  // Case: latest report is unread → owner must view it before running again
  if (latest.read_at === null) {
    return {
      canRun: false,
      reason: "unread_pending",
      nextEligibleAt: null,
      daysUntilNext: 0,
      hoursUntilNext: 0,
      unreadReportId: latest.id as string,
      lastReadAt: null,
    };
  }

  // Case: latest report read but lock has not expired
  const nextEligible = latest.next_eligible_run_at as string | null;
  if (nextEligible) {
    const nextMs = new Date(nextEligible).getTime();
    const remainingMs = nextMs - Date.now();
    if (remainingMs > 0) {
      const totalHours = remainingMs / (60 * 60 * 1000);
      const days = Math.floor(totalHours / 24);
      const hoursWithinDay = Math.ceil(totalHours - days * 24);
      return {
        canRun: false,
        reason: "weekly_lock",
        nextEligibleAt: nextEligible,
        daysUntilNext: days,
        hoursUntilNext: hoursWithinDay,
        unreadReportId: null,
        lastReadAt: latest.read_at as string,
      };
    }
  }

  // Lock expired — owner can run again
  return {
    canRun: true,
    reason: null,
    nextEligibleAt: null,
    daysUntilNext: 0,
    hoursUntilNext: 0,
    unreadReportId: null,
    lastReadAt: latest.read_at as string,
  };
}

export async function getManagerLockState(): Promise<{
  success: boolean;
  state?: ManagerLockState;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };
    const state = await getManagerLockStateForTenant(tenant.tenantId);
    return { success: true, state };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

/**
 * Mark a manager report as read by the current user.
 * This is the moment the 7-day lock starts.
 *
 * Idempotent: if already read, this is a no-op (read_at not overwritten).
 */
export async function markManagerReportRead(
  reportId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "לא מחובר" };

    const db = createAdminClient();

    // Only mark read if currently unread (idempotency).
    // The 7-day lock starts NOW, not at report creation.
    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { error } = await db
      .from("manager_reports")
      .update({
        read_at: now.toISOString(),
        read_by_user_id: user.id,
        next_eligible_run_at: sevenDaysLater.toISOString(),
      })
      .eq("id", reportId)
      .eq("tenant_id", tenant.tenantId)
      .is("read_at", null); // critical: only if currently unread

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

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

    const limit = await checkAgentRateLimit(tenant.tenantId, "morning");
    if (!limit.allowed) {
      return { success: false, error: limit.message ?? "הסוכן רץ לאחרונה." };
    }

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

    const limit = await checkAgentRateLimit(tenant.tenantId, "watcher");
    if (!limit.allowed) {
      return { success: false, error: limit.message ?? "הסוכן רץ לאחרונה." };
    }

    const mockRecentEvents = [
      {
        source: "Google Reviews",
        summary: "ביקורת חדשה: 1★ מיוסי לוי — 'השירות היה איטי, חיכיתי 40 דקות'",
        occurredAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      },
      {
        source: "Instagram DM",
        summary: "פנייה מ-@dana_fashion: 'מעוניינת לקנות לחתונה השבוע, מתי הקולקציה הבאה?'",
        occurredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
      {
        source: "יומן",
        summary: "פגישה ב-15:00 עם רחל אברהם — להכין שאלון התאמה",
        occurredAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
      {
        source: "מלאי",
        summary: "מוצר #PT-204 (סלמון נורבגי): נשארו 12 יחידות, ממוצע מכירה יומי 18",
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

export async function triggerReviewsAgentAction(): Promise<{
  success: boolean;
  result?: ReviewsRunResult;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const limit = await checkAgentRateLimit(tenant.tenantId, "reviews");
    if (!limit.allowed) {
      return { success: false, error: limit.message ?? "הסוכן רץ לאחרונה." };
    }

    const mockReviews: MockReview[] = [
      {
        id: "mock-google-001",
        reviewerName: "רחלי כהן",
        rating: 5,
        text: "חוויה מצוינת! הצוות היה אדיב מאוד, השירות מהיר, והמוצר בדיוק כמו שתואר באתר. בהחלט אחזור ואמליץ לחברות.",
        occurredAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "mock-google-002",
        reviewerName: "אורי פרידמן",
        rating: 3,
        text: "המוצר היה בסדר אבל המשלוח התעכב ביומיים יותר ממה שהוצג. הצוות לא יידע אותי מראש על העיכוב — זה היה מאכזב. השירות עצמו היה אדיב.",
        occurredAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "mock-google-003",
        reviewerName: "Anonymous Customer",
        rating: 1,
        text: "בזבוז כסף! המוצר הגיע פגום והצוות לא רצה לקבל אותו בחזרה. הם פשוט גנבו לי את הכסף. אנשים, אל תקנו פה!!!",
        occurredAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const result = await runReviewsAgent(tenant.tenantId, mockReviews, "manual");
    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[triggerReviewsAgentAction] Error:", err);
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────
// Hot Leads Agent trigger — Day 9
// ─────────────────────────────────────────────────────────────

export async function triggerHotLeadsAgentAction(): Promise<{
  success: boolean;
  result?: HotLeadsRunResult;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const limit = await checkAgentRateLimit(tenant.tenantId, "hot_leads");
    if (!limit.allowed) {
      return { success: false, error: limit.message ?? "הסוכן רץ לאחרונה." };
    }

    const mockLeads: MockLead[] = [
      {
        id: "mock-lead-001",
        source: "whatsapp",
        displayName: "דנה כהן",
        sourceHandle: "+972501234567",
        rawMessage: "שלום, אני מחפשת לקנות סלמון נורבגי טרי, 2 ק'ג, היום. תקציב עד ₪450. אפשר?",
        receivedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      },
      {
        id: "mock-lead-002",
        source: "instagram_dm",
        displayName: "Mohammed Khalil",
        sourceHandle: "@mhd_khalil",
        rawMessage: "היי, ראיתי את הדגם XYZ-44 בעמוד שלכם. מעוניין להזמין שניים. תקציב 1500 שקל. כמה זמן משלוח?",
        receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "mock-lead-003",
        source: "website_form",
        displayName: "תמר שמעוני",
        sourceHandle: "tamar.sh@gmail.com",
        rawMessage: "שלום, מעוניינת לקבל מידע על השירותים שלכם. תוכלו לשלוח לי קטלוג?",
        receivedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "mock-lead-004",
        source: "instagram_dm",
        displayName: "Ivan Petrov",
        sourceHandle: "@ivan_p_il",
        rawMessage: "Hi, where are you located? what hours?",
        receivedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "mock-lead-005",
        source: "email",
        displayName: "Marketing Pro Ltd",
        sourceHandle: "ceo@marketingpro-deals.biz",
        rawMessage:
          "Dear Business Owner, We can boost your Google ranking to #1 for only $99/month. Limited time offer! Click here: bit.ly/seo-boost-now. Reply STOP to unsubscribe.",
        receivedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
    ];

    const result = await runHotLeadsAgent(tenant.tenantId, mockLeads, "manual");
    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[triggerHotLeadsAgentAction] Error:", err);
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────
// Manager Agent trigger — Day 10
// ─────────────────────────────────────────────────────────────
//
// Uses the WEEKLY-LOCK model, NOT the 4h cooldown.
// State checked via getManagerLockStateForTenant().

export async function triggerManagerAgentAction(
  windowDays = 7
): Promise<{
  success: boolean;
  result?: ManagerRunResult;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const lockState = await getManagerLockStateForTenant(tenant.tenantId);
    if (!lockState.canRun) {
      let msg: string;
      if (lockState.reason === "unread_pending") {
        msg = "יש דוח מנהל שממתין לקריאה. אנא קרא אותו לפני שמייצר חדש.";
      } else if (lockState.reason === "weekly_lock") {
        if (lockState.daysUntilNext > 0) {
          msg = `הדוח הבא יהיה זמין בעוד ${lockState.daysUntilNext} ימים.`;
        } else {
          msg = `הדוח הבא יהיה זמין בעוד ${lockState.hoursUntilNext} שעות.`;
        }
      } else {
        msg = "סוכן המנהל אינו זמין כרגע.";
      }
      return { success: false, error: msg };
    }

    const result = await runManagerAgent(tenant.tenantId, "manual", windowDays);
    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[triggerManagerAgentAction] Error:", err);
    return { success: false, error: message };
  }
}
// ─────────────────────────────────────────────────────────────
// Social Agent trigger — Day 14
// ─────────────────────────────────────────────────────────────

export async function triggerSocialAgentAction(): Promise<{
  success: boolean;
  result?: SocialRunResult;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const limit = await checkAgentRateLimit(tenant.tenantId, "social");
    if (!limit.allowed) {
      return { success: false, error: limit.message ?? "הסוכן רץ לאחרונה." };
    }

    const result = await runSocialAgent(tenant.tenantId, "manual");
    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[triggerSocialAgentAction] Error:", err);
    return { success: false, error: message };
  }
}
// ─────────────────────────────────────────────────────────────
// Approval Inbox queries (Day 8)
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
    const { data: { user } } = await supabase.auth.getUser();
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

// ─────────────────────────────────────────────────────────────
// Hot Leads board queries — Day 9
// ─────────────────────────────────────────────────────────────

export interface ClassifiedLead {
  id: string;
  source: string;
  source_handle: string | null;
  display_name: string | null;
  raw_message: string;
  received_at: string;
  bucket: LeadBucket | null;
  reason: string | null;
  suggested_action: string | null;
  status: string;
  contacted_at: string | null;
  dismissed_at: string | null;
  score_features: Record<string, unknown>;
  created_at: string;
}

export async function listClassifiedLeads(): Promise<{
  success: boolean;
  leads?: ClassifiedLead[];
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { data, error } = await db
      .from("hot_leads")
      .select(
        "id, source, source_handle, display_name, raw_message, received_at, bucket, reason, suggested_action, status, contacted_at, dismissed_at, score_features, created_at"
      )
      .eq("tenant_id", tenant.tenantId)
      .in("status", ["new", "classified"])
      .order("received_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[listClassifiedLeads] DB error:", error);
      return { success: false, error: error.message };
    }
    return { success: true, leads: (data as ClassifiedLead[]) ?? [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

export async function markLeadContacted(
  leadId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "לא מחובר" };

    const db = createAdminClient();
    const { error } = await db
      .from("hot_leads")
      .update({
        status: "contacted",
        contacted_at: new Date().toISOString(),
        contacted_by_user_id: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId)
      .eq("tenant_id", tenant.tenantId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

export async function dismissLead(
  leadId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { error } = await db
      .from("hot_leads")
      .update({
        status: "dismissed",
        dismissed_at: new Date().toISOString(),
        dismissed_reason: reason ?? "owner dismissed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId)
      .eq("tenant_id", tenant.tenantId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────
// Manager reports queries — Day 10
// ─────────────────────────────────────────────────────────────

export interface ManagerReportRow {
  id: string;
  agent_run_id: string | null;
  window_start: string;
  window_end: string;
  agents_succeeded: number;
  agents_failed: number;
  drafts_sampled: number;
  drafts_flagged: number;
  has_critical_issues: boolean;
  cost_window_ils: number | null;
  cost_anomaly: boolean;
  recommendation_type: string | null;
  recommendation_target_agent: string | null;
  report: Record<string, unknown>;
  read_at: string | null;
  next_eligible_run_at: string | null;
  created_at: string;
}

export async function listManagerReports(
  limit = 10
): Promise<{
  success: boolean;
  reports?: ManagerReportRow[];
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { data, error } = await db
      .from("manager_reports")
      .select(
        "id, agent_run_id, window_start, window_end, agents_succeeded, agents_failed, drafts_sampled, drafts_flagged, has_critical_issues, cost_window_ils, cost_anomaly, recommendation_type, recommendation_target_agent, report, read_at, next_eligible_run_at, created_at"
      )
      .eq("tenant_id", tenant.tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[listManagerReports] DB error:", error);
      return { success: false, error: error.message };
    }
    return { success: true, reports: (data as ManagerReportRow[]) ?? [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}
