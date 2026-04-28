"use client";

import { useEffect, useState, useRef } from "react";
import type { AgentCardData } from "./agent-card";
import { AgentStatusPill } from "./agent-status-pill";

type TabId = "chat" | "pending" | "history" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "chat", label: "שיחה" },
  { id: "pending", label: "ממתין לאישור" },
  { id: "history", label: "היסטוריה" },
  { id: "settings", label: "הגדרות" },
];

/** Mock quick replies per agent (UI placeholder until Day 5+ API) */
const QUICK_REPLIES_BY_AGENT: Record<string, string[]> = {
  morning: ["תכין לי דוח עכשיו", "מה הסיכום של אתמול?", "דחה לשעה אחרת"],
  reviews: ["ערוך את הטון להיות יותר חם", "נסח את הראשונה מחדש", "תאשר את כולן"],
  social: ["צור פוסט חדש על מבצע", "השנה את הטון", "פרסם בדיוק ב-12:00"],
  manager: ["הצג סיכום שבועי", "תן לי המלצה אחת מרכזית", "שלח לטלפון"],
  watcher: ["מה הסיכון הגדול ביותר עכשיו?", "השתק התראות לחצי שעה", "הצג את הלוג"],
  cleanup: ["הרץ ניקוי עכשיו", "מה תיקנת בפעם האחרונה?", "תזמן ליום ראשון"],
  sales: ["מי הליד החם ביותר היום?", "תכין follow-up אחד", "מה הסטטוס של דיל X?"],
  inventory: ["מה חסר במלאי?", "מתי להזמין מחדש?", "הצג טרנד שבועי"],
  hot_leads: ["הצג לידים בציון 90+", "תרגם לידים לפי דחיפות", "התחל follow-up"],
};

interface AgentDrawerProps {
  agent: AgentCardData;
  onClose: () => void;
}

export function AgentDrawer({ agent, onClose }: AgentDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabId>("chat");
  const [inputValue, setInputValue] = useState("");

  // ESC closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const { config, status, pendingCount } = agent;
  const quickReplies = QUICK_REPLIES_BY_AGENT[config.id] ?? [];

  const handleSend = () => {
    if (!inputValue.trim()) return;
    // TODO Day 5: send to Anthropic, append to conversation in DB
    console.log("[chat] User sent:", inputValue);
    setInputValue("");
  };

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40"
        style={{
          background: "rgba(0, 0, 0, 0.55)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          animation: "drawerFadeIn 220ms ease-out",
        }}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed bottom-0 top-0 z-50 flex w-full max-w-[540px] flex-col"
        style={{
          right: "248px",
          background: "var(--spike-bg-2)",
          borderInlineEnd: "1px solid var(--spike-border-strong)",
          boxShadow: "-12px 0 50px rgba(0, 0, 0, 0.5)",
          animation: "drawerSlideIn 280ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        {/* HEAD */}
        <div
          className="flex items-start gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--spike-border)" }}
        >
          <div
            className="flex size-12 flex-shrink-0 items-center justify-center rounded-xl text-2xl"
            style={{ background: config.gradient }}
          >
            {config.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="drawer-title"
              className="flex items-center gap-2.5 text-lg font-bold text-white"
            >
              {config.name}
              <AgentStatusPill status={status} pendingCount={pendingCount} showDot={false} />
            </h3>
            <div
              className="mt-1 text-xs truncate"
              style={{ color: "var(--spike-text-dim)" }}
            >
              {config.schedule} · {config.description}
            </div>
          </div>

          <button
            className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:brightness-110"
            style={{
              background: "rgba(34, 211, 176, 0.12)",
              color: "var(--spike-teal)",
            }}
            title="הרץ עכשיו"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>

          <button
            onClick={onClose}
            className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:brightness-110"
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              color: "var(--spike-text-mute)",
            }}
            title="סגור"
            aria-label="סגור"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* TABS */}
        <div className="flex" style={{ borderBottom: "1px solid var(--spike-border)" }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            const showBadge = tab.id === "pending" && pendingCount > 0;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors"
                style={{
                  color: active ? "var(--spike-teal-light)" : "var(--spike-text-dim)",
                }}
              >
                {tab.label}
                {showBadge && (
                  <span
                    className="text-[10px] font-bold"
                    style={{
                      background: "var(--spike-amber)",
                      color: "#07111A",
                      padding: "1px 6px",
                      borderRadius: "999px",
                      minWidth: 16,
                      textAlign: "center",
                    }}
                  >
                    {pendingCount}
                  </span>
                )}
                {active && (
                  <span
                    className="absolute bottom-0 left-1/2 h-0.5 -translate-x-1/2"
                    style={{ width: "60%", background: "var(--spike-teal)" }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* BODY */}
        <div className="spike-scroll flex-1 overflow-y-auto">
          {activeTab === "chat" && (
            <ChatTab agentId={config.id} agentEmoji={config.emoji} agentName={config.name} />
          )}
          {activeTab === "pending" && (
            <DrawerEmptyState
              emoji="📩"
              title={pendingCount > 0 ? `${pendingCount} פריטים מחכים לאישורך` : "אין פריטים מחכים"}
              description={
                pendingCount > 0
                  ? "תיבת האישורים תופעל ב-Day 6 עם 4 פעולות: אשר ושלח / ערוך / נסח מחדש / דחה."
                  : "כל מה שהסוכן הציע אושר כבר. נחזור אליך כשיהיה משהו חדש."
              }
            />
          )}
          {activeTab === "history" && (
            <DrawerEmptyState
              emoji="📜"
              title="היסטוריית ריצות"
              description="ריצות עבר של הסוכן ייכנסו כאן ב-Day 5 (קוראים מטבלת agent_runs)."
              hint="כרגע יש 0 ריצות אמיתיות — Day 4 כולו mock data."
            />
          )}
          {activeTab === "settings" && (
            <DrawerEmptyState
              emoji="⚙️"
              title="הגדרות סוכן"
              description="ב-Day 7+ תוכלו לקבוע: מצב אוטונומיה (טיוטה / הצעה / אוטומטי), שעות פעילות, התראות, ודריסות לתזמון."
            />
          )}
        </div>

        {/* FOOTER — only on chat tab */}
        {activeTab === "chat" && (
          <div
            className="flex flex-col gap-2 px-4 py-3.5"
            style={{
              borderTop: "1px solid var(--spike-border)",
              background: "var(--spike-bg-2)",
            }}
          >
            {/* Quick replies */}
            {quickReplies.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {quickReplies.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => setInputValue(reply)}
                    className="rounded-full px-3 py-1 text-xs font-medium transition-all"
                    style={{
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid var(--spike-border-strong)",
                      color: "var(--spike-text-dim)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--spike-teal-light)";
                      e.currentTarget.style.borderColor = "rgba(34, 211, 176, 0.3)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--spike-text-dim)";
                      e.currentTarget.style.borderColor = "var(--spike-border-strong)";
                    }}
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}

            {/* Input row */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="כתוב הודעה לסוכן..."
                className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid var(--spike-border-strong)",
                  color: "var(--spike-text)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(34, 211, 176, 0.4)";
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--spike-border-strong)";
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                }}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="flex size-10 flex-shrink-0 items-center justify-center rounded-xl transition-all disabled:opacity-40"
                style={{
                  background: "var(--spike-teal)",
                  color: "#06141d",
                }}
                aria-label="שלח"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transform: "scaleX(-1)" }}
                >
                  <path d="M22 2L11 13" />
                  <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Animations */}
      <style jsx>{`
        @keyframes drawerSlideIn {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(0);
          }
        }
        @keyframes drawerFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Chat Tab — empty state for now, structured for Day 5 messages
// ─────────────────────────────────────────────────────────────

interface ChatTabProps {
  agentId: string;
  agentEmoji: string;
  agentName: string;
}

function ChatTab({ agentEmoji, agentName }: ChatTabProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <div
        className="flex size-16 items-center justify-center rounded-2xl text-3xl"
        style={{
          background: "rgba(34, 211, 176, 0.08)",
          border: "1px solid rgba(34, 211, 176, 0.15)",
        }}
      >
        {agentEmoji}
      </div>
      <h4 className="mt-5 text-lg font-bold text-white">
        השיחה עם {agentName} עוד לא התחילה
      </h4>
      <p
        className="mt-2 max-w-xs text-sm leading-relaxed"
        style={{ color: "var(--spike-text-dim)" }}
      >
        הריצו את הסוכן או שלחו הודעה למטה — והשיחה תתחיל. הסוכן יסביר מה הוא עושה,
        יציע טיוטות, ויחכה לאישור שלכם.
      </p>
      <div
        className="mt-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
        style={{
          background: "rgba(252, 211, 77, 0.08)",
          color: "var(--spike-amber)",
          border: "1px solid rgba(252, 211, 77, 0.2)",
        }}
      >
        🧪 שיחות אינטראקטיביות יוצאות ב-Day 5
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Generic empty state for non-chat tabs
// ─────────────────────────────────────────────────────────────

interface DrawerEmptyStateProps {
  emoji: string;
  title: string;
  description: string;
  hint?: string;
}

function DrawerEmptyState({ emoji, title, description, hint }: DrawerEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="text-5xl">{emoji}</div>
      <h4 className="mt-4 text-base font-bold text-white">{title}</h4>
      <p
        className="mt-2 max-w-xs text-sm leading-relaxed"
        style={{ color: "var(--spike-text-dim)" }}
      >
        {description}
      </p>
      {hint && (
        <p
          className="mt-4 text-xs italic"
          style={{ color: "var(--spike-text-mute)" }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
