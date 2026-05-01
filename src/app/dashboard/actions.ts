"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMorningAgent } from "@/lib/agents/morning/run";
import type { MorningPromptContext } from "@/lib/agents/morning/prompt";
import { runWatcherAgent } from "@/lib/agents/watcher/run";
import { runReviewsAgent, type ReviewsRunResult } from "@/lib/agents/reviews/run";
import { runHotLeadsAgent, type HotLeadsRunResult } from "@/lib/agents/hot_leads/run";
import { runManagerAgent, type ManagerRunResult } from "@/lib/agents/manager/run";
import { runSocialAgent, type SocialRunResult } from "@/lib/agents/social/run";
import { runSalesAgent, type SalesRunResult } from "@/lib/agents/sales/run";
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
  inventory: 5,
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
// Reviews — load source reviews from public.events (Day 19)
// ─────────────────────────────────────────────────────────────
//
// Reads recent google_business / review_received events for the tenant
// and adapts them into the MockReview[] shape the Reviews agent expects.
// Falls back to an empty array on any error so the trigger can return
// a clean no-op instead of a crash.

async function loadReviewEventsAsReviews(
  tenantId: string,
  lookbackHours = 72,
  maxRows = 20
): Promise<MockReview[]> {
  const db = createAdminClient();

  const since = new Date(
    Date.now() - lookbackHours * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await db
    .from("events")
    .select("id, payload, received_at")
    .eq("tenant_id", tenantId)
    .eq("provider", "google_business")
    .eq("event_type", "review_received")
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(maxRows);

  if (error) {
    console.error("[loadReviewEventsAsReviews] DB error:", error);
    return [];
  }

  type ReviewRow = {
    id: string;
    payload: Record<string, unknown> | null;
    received_at: string;
  };

  const rows = (data ?? []) as ReviewRow[];

  return rows
    .map((row) => {
      const p = row.payload ?? {};
      const reviewerName =
        typeof p.reviewerName === "string" ? p.reviewerName : null;
      const rating = typeof p.rating === "number" ? p.rating : null;
      const text = typeof p.reviewText === "string" ? p.reviewText : null;

      // Drop rows missing any required field — silent skip is correct here
      // because the Reviews agent's prompt cannot work with partial data.
      if (!reviewerName || rating === null || !text) return null;

      return {
        id: row.id,
        reviewerName,
        rating,
        text,
        occurredAt: row.received_at,
      };
    })
    .filter((r): r is MockReview => r !== null);
}

// ─────────────────────────────────────────────────────────────
// Hot Leads — load source leads from public.events (Day 19)
// ─────────────────────────────────────────────────────────────
//
// Reads recent lead_received events for the tenant and adapts them into
// the MockLead[] shape the Hot Leads agent expects. Sources include
// whatsapp, instagram_dm, website_form, email — anything that wrote a
// lead-style event. Falls back to an empty array on any error.

async function loadLeadEventsAsLeads(
  tenantId: string,
  lookbackHours = 72,
  maxRows = 30
): Promise<MockLead[]> {
  const db = createAdminClient();

  const since = new Date(
    Date.now() - lookbackHours * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await db
    .from("events")
    .select("id, provider, payload, received_at")
    .eq("tenant_id", tenantId)
    .eq("event_type", "lead_received")
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(maxRows);

  if (error) {
    console.error("[loadLeadEventsAsLeads] DB error:", error);
    return [];
  }

  type LeadRow = {
    id: string;
    provider: string | null;
    payload: Record<string, unknown> | null;
    received_at: string;
  };

  // Map common provider names to the MockLead source enum.
  // Anything unrecognized falls through to "website_form" as the safe default.
  const sourceMap: Record<string, MockLead["source"]> = {
    whatsapp: "whatsapp",
    instagram: "instagram_dm",
    instagram_dm: "instagram_dm",
    website_form: "website_form",
    website: "website_form",
    email: "email",
  };

  const rows = (data ?? []) as LeadRow[];

  return rows
    .map((row) => {
      const p = row.payload ?? {};
      const displayName =
        typeof p.name === "string"
          ? p.name
          : typeof p.sender === "string"
            ? p.sender
            : null;
      const rawMessage =
        typeof p.summary === "string"
          ? p.summary
          : typeof p.message === "string"
            ? p.message
            : null;
      const sourceHandle =
        typeof p.phone === "string"
          ? p.phone
          : typeof p.email === "string"
            ? p.email
            : typeof p.handle === "string"
              ? p.handle
              : "";

      // Required: a name and a message. Anything else can be defaulted.
      if (!displayName || !rawMessage) return null;

      const source: MockLead["source"] =
        sourceMap[row.provider ?? ""] ?? "website_form";

      return {
        id: row.id,
        source,
        displayName,
        sourceHandle,
        rawMessage,
        receivedAt: row.received_at,
      };
    })
    .filter((l): l is MockLead => l !== null);
}

// ─────────────────────────────────────────────────────────────
// Morning — load briefing context from real data (Day 19)
// ─────────────────────────────────────────────────────────────
//
// The Morning agent's prompt expects a structured context object
// describing yesterday's metrics, today's schedule, pending tasks,
// and recent updates. We populate as much as we can from the DB:
//
//   - yesterdayMetrics.leads ← count of lead_received events in last 24h
//   - pendingTasks            ← rows from drafts where status='pending'
//   - recentUpdates           ← short Hebrew bullets of notable events
//                               (negative reviews, hot leads, urgent msgs)
//
// Fields with no data source today (todaysEvents, revenue, orders,
// visitors) are returned empty so the prompt knows to skip them.
// When integrations land (Google Calendar, Cardcom, Analytics), those
// fields wire in here without touching anything else.

async function loadMorningContext(
  tenantId: string
): Promise<Partial<MorningPromptContext>> {
  const db = createAdminClient();

  // Load tenant identity for greeting.
  const { data: tenant } = await db
    .from("tenants")
    .select("name, config")
    .eq("id", tenantId)
    .maybeSingle();

  const config = (tenant?.config ?? {}) as Record<string, unknown>;
  const ownerName =
    typeof config.owner_name === "string" ? config.owner_name : "בעל העסק";
  const businessName =
    typeof tenant?.name === "string" ? tenant.name : "העסק שלי";

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ─── Yesterday metrics: leads in last 24h ──────────────────
  const { count: leadsCount } = await db
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("event_type", "lead_received")
    .gte("received_at", since24h);

  // ─── Pending tasks: drafts awaiting approval ───────────────
  const { data: pendingDrafts } = await db
    .from("drafts")
    .select("type, content")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);

  const pendingTasks = (pendingDrafts ?? []).map((d) => {
    const content = (d.content ?? {}) as Record<string, unknown>;
    const recipientName =
      typeof content.reviewerName === "string"
        ? content.reviewerName
        : typeof content.leadDisplayName === "string"
          ? content.leadDisplayName
          : null;

    let title: string;
    if (d.type === "review_reply") {
      title = recipientName
        ? `תגובה לביקורת של ${recipientName}`
        : "תגובה לביקורת ממתינה לאישור";
    } else if (d.type === "sales_followup") {
      title = recipientName
        ? `פולואו-אפ למכירה: ${recipientName}`
        : "פולואו-אפ מכירה ממתין לאישור";
    } else if (d.type === "social_post") {
      title = "פוסט לרשתות חברתיות ממתין לאישור";
    } else {
      title = "טיוטה ממתינה לאישור";
    }

    return {
      title,
      priority: "medium" as const,
    };
  });

  // ─── Recent updates: notable events from last 24h ──────────
  // We grab a small sample of high-signal events and turn each into a
  // one-line Hebrew bullet. The Morning prompt summarizes them further.
  const { data: notableEvents } = await db
    .from("events")
    .select("provider, event_type, payload")
    .eq("tenant_id", tenantId)
    .gte("received_at", since24h)
    .order("received_at", { ascending: false })
    .limit(8);

  const recentUpdates: string[] = [];
  for (const ev of notableEvents ?? []) {
    const p = (ev.payload ?? {}) as Record<string, unknown>;
    const summary = typeof p.summary === "string" ? p.summary : null;
    if (!summary) continue;
    // Truncate so the prompt stays compact
    const trimmed = summary.length > 140 ? summary.slice(0, 137) + "..." : summary;
    recentUpdates.push(trimmed);
    if (recentUpdates.length >= 5) break;
  }

  return {
    ownerName,
    businessName,
    todaysEvents: [], // No calendar integration yet
    yesterdayMetrics: {
      leads: leadsCount ?? 0,
      // revenue / orders / visitors left undefined — no data source yet
    },
    pendingTasks,
    recentUpdates,
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

    // Load real context for the morning briefing (Day 19).
    const context = await loadMorningContext(tenant.tenantId);

    const result = await runMorningAgent(tenant.tenantId, "manual", context);
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

    // Load real review events from public.events (Day 19).
    const reviews = await loadReviewEventsAsReviews(tenant.tenantId);

    if (reviews.length === 0) {
      return {
        success: false,
        error:
          "אין ביקורות חדשות לטיפול. ביקורות חדשות מ-Google Business יוזנו אוטומטית כשתחבר את האינטגרציה.",
      };
    }

    const result = await runReviewsAgent(tenant.tenantId, reviews, "manual");
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

    // Load real lead events from public.events (Day 19).
    const leads = await loadLeadEventsAsLeads(tenant.tenantId);

    if (leads.length === 0) {
      return {
        success: false,
        error:
          "אין לידים חדשים לסיווג. לידים יוזנו אוטומטית כשתחבר אינטגרציה (וואטסאפ, אינסטגרם, טופס באתר).",
      };
    }

    const result = await runHotLeadsAgent(tenant.tenantId, leads, "manual");
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
}// ─────────────────────────────────────────────────────────────
// Sales Agent trigger — Day 15
// ─────────────────────────────────────────────────────────────

export async function triggerSalesAgentAction(): Promise<{
  success: boolean;
  result?: SalesRunResult;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const limit = await checkAgentRateLimit(tenant.tenantId, "sales");
    if (!limit.allowed) {
      return { success: false, error: limit.message ?? "הסוכן רץ לאחרונה." };
    }

    const result = await runSalesAgent(tenant.tenantId, "manual");
    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[triggerSalesAgentAction] Error:", err);
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

// ─────────────────────────────────────────────────────────────
// Dashboard KPIs (Day 17 audit — replaces hardcoded values)
// ─────────────────────────────────────────────────────────────
//
// Returns 3 real KPIs sourced from the database:
//   1. pendingApprovals — drafts WHERE status='pending'
//   2. todaysActions    — drafts WHERE created_at >= today_start (Israel TZ)
//   3. monthlySpend     — tenants.spend_used_ils + spend_reserved_ils
//   4. monthlyCap       — tenants.spend_cap_ils
//
// Computed in a single round-trip to keep the dashboard fast.

export interface DashboardKpis {
  pendingApprovals: number;
  todaysActions: number;
  monthlySpend: number;
  monthlyCap: number;
}

export async function getDashboardKpis(): Promise<{
  success: boolean;
  kpis?: DashboardKpis;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();

    // Israel TZ midnight today (UTC+2/+3 with DST). We use a stable boundary:
    // local-day-start in Asia/Jerusalem expressed as UTC ISO.
    const now = new Date();
    const israelNow = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })
    );
    const israelMidnight = new Date(
      israelNow.getFullYear(),
      israelNow.getMonth(),
      israelNow.getDate(),
      0,
      0,
      0,
      0
    );
    // Convert local-Israel midnight back to UTC ISO. The trick: get the
    // diff between machine clock and Israel clock, apply it.
    const tzOffsetMs = now.getTime() - israelNow.getTime();
    const israelMidnightUtc = new Date(israelMidnight.getTime() + tzOffsetMs);

    const [pendingResult, todayResult, tenantResult] = await Promise.all([
      // 1. Pending drafts count
      db
        .from("drafts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.tenantId)
        .eq("status", "pending"),

      // 2. Drafts created since Israel midnight
      db
        .from("drafts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.tenantId)
        .gte("created_at", israelMidnightUtc.toISOString()),

      // 3. Spend snapshot
      db
        .from("tenants")
        .select("spend_cap_ils, spend_used_ils, spend_reserved_ils")
        .eq("id", tenant.tenantId)
        .single(),
    ]);

    if (pendingResult.error || todayResult.error || tenantResult.error) {
      const err =
        pendingResult.error?.message ??
        todayResult.error?.message ??
        tenantResult.error?.message ??
        "DB error";
      console.error("[getDashboardKpis] DB error:", err);
      return { success: false, error: err };
    }

    const usedIls = Number(tenantResult.data?.spend_used_ils ?? 0);
    const reservedIls = Number(tenantResult.data?.spend_reserved_ils ?? 0);
    const capIls = Number(tenantResult.data?.spend_cap_ils ?? 0);

    return {
      success: true,
      kpis: {
        pendingApprovals: pendingResult.count ?? 0,
        todaysActions: todayResult.count ?? 0,
        monthlySpend: usedIls + reservedIls,
        monthlyCap: capIls,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[getDashboardKpis] Error:", err);
    return { success: false, error: message };
  }
}




// ═══════════════════════════════════════════════════════════════
// APPEND THIS BLOCK TO THE END OF src/app/dashboard/actions.ts
// (after the getDashboardKpis function from Day 17 audit fix #2)
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// Inventory Agent — Day 18
// ─────────────────────────────────────────────────────────────
//
// Three actions:
//   1. uploadInventoryCsv  — parses + stores a CSV upload
//   2. triggerInventoryAgentAction — runs the Inventory agent on the latest snapshot
//   3. getLatestInventorySnapshot  — for the dashboard / inventory page

import { runInventoryAgent, type InventoryRunResult } from "@/lib/agents/inventory/run";
import {
  parseInventoryCsv,
  InventoryParseError,
  type InventoryProduct,
} from "@/lib/agents/inventory/csv-parser";

export interface UploadInventoryResult {
  success: boolean;
  snapshotId?: string;
  productCount?: number;
  warnings?: string[];
  error?: string;
}

/**
 * Upload + parse a CSV file. Saves the parsed products as a new
 * inventory_snapshots row. Does NOT run the agent — call
 * triggerInventoryAgentAction() afterward to analyze.
 *
 * @param csvText  — raw CSV text content
 * @param filename — original filename (for display)
 */
export async function uploadInventoryCsv(
  csvText: string,
  filename: string
): Promise<UploadInventoryResult> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "לא מחובר" };

    // Parse the CSV
    let parsed;
    try {
      parsed = parseInventoryCsv(csvText);
    } catch (err) {
      if (err instanceof InventoryParseError) {
        return { success: false, error: err.messageHe };
      }
      throw err;
    }

    // Persist as a new snapshot
    const db = createAdminClient();
    const { data, error } = await db
      .from("inventory_snapshots")
      .insert({
        tenant_id: tenant.tenantId,
        uploaded_by: user.id,
        source_filename: filename,
        source_format: "csv",
        row_count: parsed.rowCount,
        column_mapping: parsed.columnMapping,
        products: parsed.products,
        parse_warnings:
          parsed.warnings.length > 0 ? parsed.warnings : null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[uploadInventoryCsv] DB error:", error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      snapshotId: data.id as string,
      productCount: parsed.rowCount,
      warnings: parsed.warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[uploadInventoryCsv] Error:", err);
    return { success: false, error: message };
  }
}

/**
 * Run the Inventory Agent on the tenant's latest snapshot.
 * Returns the analysis result.
 */
export async function triggerInventoryAgentAction(): Promise<{
  success: boolean;
  result?: InventoryRunResult;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const limit = await checkAgentRateLimit(tenant.tenantId, "inventory");
    if (!limit.allowed) {
      return { success: false, error: limit.message ?? "הסוכן רץ לאחרונה." };
    }

    const result = await runInventoryAgent(tenant.tenantId, "manual");
    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[triggerInventoryAgentAction] Error:", err);
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────
// Inventory snapshot queries
// ─────────────────────────────────────────────────────────────

export interface InventorySnapshotRow {
  id: string;
  source_filename: string;
  row_count: number;
  uploaded_at: string;
  last_analyzed_at: string | null;
  last_agent_run_id: string | null;
  products: InventoryProduct[];
  parse_warnings: string[] | null;
}

/**
 * Get the most recent active snapshot for the current tenant.
 * Returns null if no upload has been made yet.
 */
export async function getLatestInventorySnapshot(): Promise<{
  success: boolean;
  snapshot?: InventorySnapshotRow | null;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { data, error } = await db
      .from("inventory_snapshots")
      .select(
        "id, source_filename, row_count, uploaded_at, last_analyzed_at, last_agent_run_id, products, parse_warnings"
      )
      .eq("tenant_id", tenant.tenantId)
      .eq("is_active", true)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[getLatestInventorySnapshot] DB error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, snapshot: (data as InventorySnapshotRow) ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

/**
 * Get the latest agent_runs row for the current tenant's inventory agent.
 * Returns the output (the analyzed inventory) if it exists.
 */
export async function getLatestInventoryAnalysis(): Promise<{
  success: boolean;
  analysis?: Record<string, unknown> | null;
  analyzedAt?: string | null;
  isMocked?: boolean;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { data, error } = await db
      .from("agent_runs")
      .select("output, finished_at, is_mocked")
      .eq("tenant_id", tenant.tenantId)
      .eq("agent_id", "inventory")
      .eq("status", "succeeded")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[getLatestInventoryAnalysis] DB error:", error);
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: true, analysis: null, analyzedAt: null };
    }

    return {
      success: true,
      analysis: data.output as Record<string, unknown>,
      analyzedAt: data.finished_at as string,
      isMocked: data.is_mocked as boolean,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}




// ═══════════════════════════════════════════════════════════════
