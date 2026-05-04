"use server";

// src/app/dashboard/alerts/actions.ts
//
// Sub-stage 1.10 — server actions for the Alerts page.
//
// All actions are tenant-scoped via getActiveTenant(). Notifications
// can also be user-specific (notifications.user_id) or tenant-wide
// (user_id IS NULL = visible to all tenant members).
//
// Schema (from migration 002):
//   id          uuid primary key
//   tenant_id   uuid not null
//   user_id     uuid (NULL = all members)
//   type        text not null
//   title_he    text not null
//   body_he     text
//   link        text
//   read_at     timestamptz
//   created_at  timestamptz default now()
//
// Index: notifications_user_unread_idx on (user_id, created_at desc)
// where read_at is null — fast for unread queries.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getActiveTenant } from "@/app/dashboard/actions/_shared";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: string;
  title_he: string;
  body_he: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export type AlertTab = "all" | "unread" | "agents" | "costs";

// Type prefixes/exact values used to bucket notifications into tabs.
// Kept as a const so the UI and server action stay in sync.
const TYPE_AGENTS = [
  "agent_succeeded",
  "agent_failed",
  "draft_created",
  "draft_approved",
  "draft_rejected",
  "manager_report_ready",
  "watcher_alert",
  "hot_lead_classified",
];

const TYPE_COST_PREFIX = "cost_";

// ─────────────────────────────────────────────────────────────
// listNotifications
// ─────────────────────────────────────────────────────────────
//
// Returns notifications visible to the current user:
//   - notifications.user_id = current user, OR
//   - notifications.user_id IS NULL (tenant-wide)
//
// Filtered by tab:
//   - all     → no filter
//   - unread  → read_at IS NULL
//   - agents  → type IN (agent-related types)
//   - costs   → type LIKE 'cost_%'
//
// Capped at 100 rows, newest first. Tenants generating more than 100
// notifications between visits are exceedingly rare; if it happens we
// can paginate later.

export async function listNotifications(tab: AlertTab = "all"): Promise<{
  success: boolean;
  notifications?: Notification[];
  unreadCount?: number;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "לא מחובר" };

    const db = createAdminClient();

    // Base query: scoped to tenant + (user-specific OR tenant-wide)
    let query = db
      .from("notifications")
      .select("id, type, title_he, body_he, link, read_at, created_at")
      .eq("tenant_id", tenant.tenantId)
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(100);

    // Tab-specific filtering
    if (tab === "unread") {
      query = query.is("read_at", null);
    } else if (tab === "agents") {
      query = query.in("type", TYPE_AGENTS);
    } else if (tab === "costs") {
      query = query.like("type", `${TYPE_COST_PREFIX}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[listNotifications] DB error:", error);
      return { success: false, error: error.message };
    }

    // Also count unread for the "לא נקראו" tab badge.
    // Separate query — tiny, won't slow us down.
    const { count: unreadCount } = await db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.tenantId)
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .is("read_at", null);

    return {
      success: true,
      notifications: (data as Notification[]) ?? [],
      unreadCount: unreadCount ?? 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────
// markNotificationRead — single notification
// ─────────────────────────────────────────────────────────────
//
// Idempotent: only sets read_at if currently null. Calling on an
// already-read notification is a no-op.
//
// Used when the user clicks a notification card. The UI navigates to
// `link` (if any) AFTER this action settles, so the user sees the
// updated state on return.

export async function markNotificationRead(
  notificationId: string
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
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("tenant_id", tenant.tenantId)
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .is("read_at", null); // idempotency: only update if currently unread

    if (error) {
      console.error("[markNotificationRead] DB error:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/dashboard/alerts");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────
// markAllNotificationsRead
// ─────────────────────────────────────────────────────────────
//
// Bulk mark-all-read for the current user, scoped to tenant.
// Tenant-wide notifications (user_id IS NULL) are ALSO marked read —
// behavior matches user expectation: "סמן הכל כנקרא" should clear
// the inbox visually for THIS user, even though those rows are
// shared across tenant members. This is fine because read_at is
// per-row, not per-user — that's a schema limitation we accept here.

export async function markAllNotificationsRead(): Promise<{
  success: boolean;
  error?: string;
  markedCount?: number;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "לא מחובר" };

    const db = createAdminClient();

    const { data, error } = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("tenant_id", tenant.tenantId)
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .is("read_at", null)
      .select("id");

    if (error) {
      console.error("[markAllNotificationsRead] DB error:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/dashboard/alerts");
    revalidatePath("/dashboard");

    return { success: true, markedCount: data?.length ?? 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}
