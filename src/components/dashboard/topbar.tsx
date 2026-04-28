"use client";

interface TopbarProps {
  greeting: string;
  userName: string;
  activeAgents?: number;
  pendingApprovals?: number;
  lastUpdate?: string;
}

const SearchIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const BellIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export function Topbar({
  greeting,
  userName,
  activeAgents = 9,
  pendingApprovals = 4,
  lastUpdate = "לפני 12 דק׳",
}: TopbarProps) {
  return (
    <div className="mb-7 flex flex-wrap items-center justify-between gap-6">
      {/* Greeting + status */}
      <div>
        <h1
          className="mb-1 text-[30px] font-extrabold leading-[1.15] text-white"
          style={{ letterSpacing: "-0.025em" }}
        >
          {greeting}, <span style={{ color: "var(--spike-teal)" }}>{userName}</span>{" "}
          <span className="inline-block">👋</span>
        </h1>
        <div
          className="flex flex-wrap items-center gap-2 text-sm"
          style={{ color: "var(--spike-text-dim)" }}
        >
          <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: "var(--spike-teal-light)" }}>
            <span
              className="spike-pulse-dot block size-[7px] rounded-full"
              style={{ background: "var(--spike-teal)" }}
            />
            {activeAgents} סוכנים פעילים
          </span>
          <span style={{ color: "var(--spike-text-mute)" }}>·</span>
          <span>{pendingApprovals} פריטים מחכים</span>
          <span style={{ color: "var(--spike-text-mute)" }}>·</span>
          <span style={{ color: "var(--spike-text-mute)" }}>עדכון אחרון {lastUpdate}</span>
        </div>
      </div>

      {/* Actions: search + bell */}
      <div className="flex items-center gap-2.5">
        <div className="relative">
          <input
            type="text"
            placeholder="חפש סוכן, פעולה, או היסטוריה..."
            className="w-[280px] rounded-[11px] py-2.5 text-[13px] outline-none transition-all"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--spike-border-strong)",
              color: "var(--spike-text)",
              paddingInlineStart: "38px",
              paddingInlineEnd: "44px",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(34, 211, 176, 0.4)";
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--spike-border-strong)";
              e.currentTarget.style.background = "rgba(255,255,255,0.03)";
            }}
          />
          <span
            className="pointer-events-none absolute top-1/2 -translate-y-1/2"
            style={{ insetInlineEnd: 12, color: "var(--spike-text-mute)" }}
          >
            {SearchIcon}
          </span>
          <kbd
            className="absolute top-1/2 -translate-y-1/2 rounded border px-1.5 py-0.5 text-[10px]"
            style={{
              insetInlineStart: 8,
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--spike-text-mute)",
              background: "rgba(255,255,255,0.04)",
              borderColor: "var(--spike-border)",
            }}
          >
            ⌘K
          </kbd>
        </div>

        <button
          className="relative flex size-[38px] items-center justify-center rounded-[11px] transition-colors"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--spike-border-strong)",
            color: "var(--spike-text-dim)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            e.currentTarget.style.color = "var(--spike-text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.03)";
            e.currentTarget.style.color = "var(--spike-text-dim)";
          }}
          title="התראות"
        >
          {BellIcon}
          {pendingApprovals > 0 && (
            <span
              className="absolute size-[7px] rounded-full"
              style={{
                top: 8,
                right: 8,
                background: "var(--spike-amber)",
                border: "2px solid var(--spike-bg)",
              }}
            />
          )}
        </button>
      </div>
    </div>
  );
}
