"use client";

// src/components/dashboard/alerts-list.tsx
//
// Sub-stage 1.10 — Alerts list with tab filtering and click-to-read.
//
// State:
//   - currentTab: which of 4 tabs is active
//   - notifications: list for current tab (refetched when tab changes)
//   - unreadCount: total unread (across all tabs); shown in tab badge
//
// Behavior:
//   - Tab change → refetch via listNotifications(tab)
//   - Click notification → markRead + navigate to link (if any)
//   - "סמן הכל כנקרא" → markAllNotificationsRead + refetch
//
// Visual: Calm Frosted — Glass cards, blue dot for unread, system colors.

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Check, ExternalLink, Loader2 } from "lucide-react";
import { Glass } from "@/components/ui/glass";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
  type AlertTab,
} from "@/app/dashboard/alerts/actions";

interface AlertsListProps {
  initialNotifications: Notification[];
  initialUnreadCount: number;
}

const TABS: { id: AlertTab; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "unread", label: "לא נקראו" },
  { id: "agents", label: "סוכנים" },
  { id: "costs", label: "כספיות" },
];

// Hebrew relative time formatter — same shape as agent-overview-card
function formatTimeAgoHe(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "לא ידוע";

  const diffMs = Date.now() - ts;
  const diffMin = Math.round(diffMs / (60 * 1000));
  const diffHr = Math.round(diffMs / (60 * 60 * 1000));
  const diffDay = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (diffMin < 1) return "ממש עכשיו";
  if (diffMin < 60) return `לפני ${diffMin} דק׳`;
  if (diffHr < 24) return `לפני ${diffHr} ${diffHr === 1 ? "שעה" : "שעות"}`;
  if (diffDay === 1) {
    const time = new Date(ts).toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jerusalem",
    });
    return `אתמול ${time}`;
  }
  if (diffDay < 7) return `לפני ${diffDay} ימים`;
  return new Date(ts).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jerusalem",
  });
}

export function AlertsList({
  initialNotifications,
  initialUnreadCount,
}: AlertsListProps) {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState<AlertTab>("all");
  const [notifications, setNotifications] =
    useState<Notification[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState<number>(initialUnreadCount);
  const [isPending, startTransition] = useTransition();
  const [isMarkingAll, startMarkingAll] = useTransition();

  // Refetch notifications whenever tab changes (skip initial mount —
  // initialNotifications is already 'all').
  useEffect(() => {
    if (currentTab === "all" && notifications === initialNotifications) {
      return; // first render, server already loaded 'all'
    }

    startTransition(async () => {
      const result = await listNotifications(currentTab);
      if (result.success) {
        setNotifications(result.notifications ?? []);
        setUnreadCount(result.unreadCount ?? 0);
      } else {
        toast.error(result.error ?? "שגיאה בטעינת התראות");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab]);

  const handleNotificationClick = (n: Notification) => {
    // Optimistic: mark read locally for instant feedback
    if (!n.read_at) {
      setNotifications((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }

    // Server-side mark-read (fire-and-forget — UI already updated)
    void markNotificationRead(n.id);

    // Navigate if link exists
    if (n.link) {
      router.push(n.link);
    }
  };

  const handleMarkAllRead = () => {
    startMarkingAll(async () => {
      const result = await markAllNotificationsRead();
      if (result.success) {
        // Mark all current notifications as read locally
        const now = new Date().toISOString();
        setNotifications((prev) =>
          prev.map((n) => (n.read_at ? n : { ...n, read_at: now }))
        );
        setUnreadCount(0);
        toast.success(
          result.markedCount && result.markedCount > 0
            ? `סומנו ${result.markedCount} התראות כנקראו`
            : "אין התראות לא נקראות"
        );
      } else {
        toast.error(result.error ?? "השמירה נכשלה");
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* ─── Tab bar + mark-all button ─── */}
      <div className="flex items-center justify-between gap-3">
        <div
          className="flex flex-1 gap-1 overflow-x-auto rounded-[12px] p-1"
          style={{
            background: "rgba(255,255,255,0.5)",
            border: "1px solid var(--color-hairline)",
          }}
        >
          {TABS.map((t) => {
            const isActive = currentTab === t.id;
            const showBadge = t.id === "unread" && unreadCount > 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setCurrentTab(t.id)}
                disabled={isPending}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 py-1.5 text-[12.5px] font-medium transition-all disabled:opacity-60"
                style={{
                  background: isActive ? "white" : "transparent",
                  color: isActive
                    ? "var(--color-ink)"
                    : "var(--color-ink-3)",
                  boxShadow: isActive ? "0 1px 2px rgba(15,20,30,0.05)" : "none",
                }}
              >
                {t.label}
                {showBadge && (
                  <span
                    className="flex h-[16px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                    style={{ background: "var(--color-sys-blue)" }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={isMarkingAll}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-medium transition-all disabled:opacity-60"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid var(--color-hairline)",
              color: "var(--color-ink-2)",
            }}
          >
            {isMarkingAll ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Check size={12} strokeWidth={2.2} />
            )}
            סמן הכל כנקרא
          </button>
        )}
      </div>

      {/* ─── List ─── */}
      {isPending ? (
        <Glass className="flex items-center justify-center gap-2 p-8">
          <Loader2
            size={16}
            className="animate-spin"
            style={{ color: "var(--color-ink-3)" }}
          />
          <span
            className="text-[13px]"
            style={{ color: "var(--color-ink-3)" }}
          >
            טוען...
          </span>
        </Glass>
      ) : notifications.length === 0 ? (
        <EmptyState tab={currentTab} />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <NotificationCard
              key={n.id}
              notification={n}
              onClick={() => handleNotificationClick(n)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Single notification card
// ─────────────────────────────────────────────────────────────

function NotificationCard({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const isUnread = notification.read_at === null;
  const hasLink = !!notification.link;

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-right transition-opacity hover:opacity-90 active:scale-[0.998]"
    >
      <Glass
        className="flex items-start gap-3 p-[14px] sm:p-[16px]"
        style={{
          background: isUnread ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)",
          borderColor: isUnread
            ? "rgba(10,132,255,0.20)"
            : "var(--color-hairline)",
        }}
      >
        {/* Unread indicator (blue dot) — fills its slot when read for layout consistency */}
        <div className="mt-1.5 flex w-2 shrink-0 items-center justify-center">
          {isUnread && (
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background: "var(--color-sys-blue)",
                boxShadow: "0 0 0 2px rgba(10,132,255,0.15)",
              }}
              aria-label="לא נקרא"
            />
          )}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3
              className="text-[14px] font-semibold leading-tight tracking-tight sm:text-[14.5px]"
              style={{
                color: isUnread ? "var(--color-ink)" : "var(--color-ink-2)",
              }}
            >
              {notification.title_he}
            </h3>
            <span
              className="shrink-0 text-[11px]"
              style={{ color: "var(--color-ink-3)" }}
            >
              {formatTimeAgoHe(notification.created_at)}
            </span>
          </div>

          {notification.body_he && (
            <p
              className="text-[12.5px] leading-[1.5]"
              style={{ color: "var(--color-ink-2)" }}
            >
              {notification.body_he}
            </p>
          )}

          {hasLink && (
            <div
              className="flex items-center gap-1 pt-0.5 text-[11.5px] font-medium"
              style={{ color: "var(--color-sys-blue)" }}
            >
              <span>לפרטים</span>
              <ExternalLink size={11} strokeWidth={2} />
            </div>
          )}
        </div>
      </Glass>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Empty state per tab
// ─────────────────────────────────────────────────────────────
//
// Decision: messaging is professional-but-warm. For 'all' (no notifications
// at all yet), we explain the mechanism: notifications appear when agents run.
// For other tabs, we use a tighter message — the user IS aware of the system,
// they're just on a tab with no items.

function EmptyState({ tab }: { tab: AlertTab }) {
  const messages: Record<AlertTab, { title: string; body: string }> = {
    all: {
      title: "אין התראות כרגע",
      body: "כשתפעיל סוכנים, התראות יופיעו כאן עם דיווחים על לידים, טיוטות וחריגות.",
    },
    unread: {
      title: "הכל נקרא",
      body: "אין התראות שלא נקראו. תוכל לעבור לטאב 'הכל' לראות את כל ההיסטוריה.",
    },
    agents: {
      title: "אין דיווחים מהסוכנים",
      body: "התראות מהסוכנים על ריצות מוצלחות, לידים חדשים וטיוטות יופיעו כאן.",
    },
    costs: {
      title: "אין התראות כספיות",
      body: "התראות על הוצאות, מגבלות תקציב ושימוש חריג ב-AI יופיעו כאן.",
    },
  };

  const { title, body } = messages[tab];

  return (
    <Glass
      className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center sm:py-20"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{
          background:
            "linear-gradient(135deg, rgba(232,239,255,0.95), rgba(225,234,250,0.7))",
          border: "1px solid rgba(255,255,255,0.9)",
          boxShadow:
            "0 4px 12px rgba(15,20,30,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
        }}
      >
        <Bell
          size={20}
          strokeWidth={1.5}
          style={{ color: "var(--color-ink-3)" }}
        />
      </div>
      <div className="space-y-1">
        <h3
          className="text-[15px] font-semibold tracking-tight"
          style={{ color: "var(--color-ink)" }}
        >
          {title}
        </h3>
        <p
          className="max-w-[420px] text-[12.5px] leading-[1.55]"
          style={{ color: "var(--color-ink-3)" }}
        >
          {body}
        </p>
      </div>
    </Glass>
  );
}
