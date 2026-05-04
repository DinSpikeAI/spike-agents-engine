"use server";

// src/app/dashboard/actions/agent-triggers.ts
//
// Manual trigger server actions for the 7 non-Manager agents.
// (Manager has its own weekly-lock model — see manager.ts.)
//
// Each trigger function:
//   1. Resolves the active tenant
//   2. Checks rate limit (5 or 30 min cooldown per agent)
//   3. Loads agent-specific context from the DB (Reviews/Hot Leads/Morning)
//   4. Invokes runFooAgent(...) with manual trigger source
//   5. Returns { success, result?, error? }
//
// Internal loaders below convert DB events into the agent's expected
// input shape. They live here (not in _shared.ts) because each is used
// by exactly one trigger.
//
// Exported server actions:
//   - triggerMorningAgentAction()
//   - triggerWatcherAgentAction()  — uses mock recent events for now
//   - triggerReviewsAgentAction()
//   - triggerHotLeadsAgentAction()
//   - triggerSocialAgentAction()
//   - triggerSalesAgentAction()
//   - triggerInventoryAgentAction()

import { runMorningAgent } from "@/lib/agents/morning/run";
import type { MorningPromptContext } from "@/lib/agents/morning/prompt";
import { runWatcherAgent } from "@/lib/agents/watcher/run";
import { runReviewsAgent, type ReviewsRunResult } from "@/lib/agents/reviews/run";
import { runHotLeadsAgent, type HotLeadsRunResult } from "@/lib/agents/hot_leads/run";
import { runSocialAgent, type SocialRunResult } from "@/lib/agents/social/run";
import { runSalesAgent, type SalesRunResult } from "@/lib/agents/sales/run";
import { runInventoryAgent, type InventoryRunResult } from "@/lib/agents/inventory/run";
import type {
  MorningAgentOutput,
  WatcherAgentOutput,
  RunResult,
  MockReview,
  MockLead,
} from "@/lib/agents/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant, checkAgentRateLimit } from "./_shared";

// ═════════════════════════════════════════════════════════════
// INTERNAL LOADERS — convert DB events into agent input shapes
// ═════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// Reviews — load source reviews from public.events
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
// Hot Leads — load source leads from public.events
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
// Morning — load briefing context from real data
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

// ═════════════════════════════════════════════════════════════
// PUBLIC SERVER ACTIONS — agent triggers
// ═════════════════════════════════════════════════════════════

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
//
// NOTE: Watcher trigger currently uses mock recent events. The real
// Watcher pipeline runs via webhook (real-time) and the daily cron
// (safety net). This manual trigger is for the dashboard's "Run Now"
// button and demos — it's intentionally fed mock data so it always
// has something to show.

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
// Reviews Agent trigger
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
// Hot Leads Agent trigger
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
// Social Agent trigger
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
// Sales Agent trigger
// ─────────────────────────────────────────────────────────────
//
// NOTE: This is the BATCH entry point (Path A in §6.8) — runs against
// stuck leads (3+ days old) and produces sales_followup drafts.
// The webhook cascade (Path B, runSalesQuickResponseOnEvent) is
// invoked automatically from Hot Leads and is NOT triggered from here.

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
// Inventory Agent trigger
// ─────────────────────────────────────────────────────────────

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
