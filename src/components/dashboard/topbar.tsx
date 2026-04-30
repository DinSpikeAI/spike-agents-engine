import { Search, Bell } from "lucide-react";

interface TopbarProps {
  greeting: string;
  userName: string;
  activeAgents: number;
  pendingApprovals: number;
  lastUpdate: string;
}

export function Topbar({
  greeting,
  userName,
  activeAgents,
  pendingApprovals,
  lastUpdate,
}: TopbarProps) {
  const today = new Date();
  const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const monthNames = [
    "ינואר",
    "פברואר",
    "מרץ",
    "אפריל",
    "מאי",
    "יוני",
    "יולי",
    "אוגוסט",
    "ספטמבר",
    "אוקטובר",
    "נובמבר",
    "דצמבר",
  ];
  const dayName = dayNames[today.getDay()];
  const monthName = monthNames[today.getMonth()];
  const date = today.getDate();
  const time = today.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const dateString = `יום ${dayName}, ${date} ב${monthName} · ${time}`;

  return (
    <>
      {/* Top utility bar */}
      <header
        className="sticky top-0 z-10 mb-6 -mx-6 flex h-14 items-center gap-3.5 px-6 md:-mx-10 md:px-10"
        style={{
          background: "var(--color-glass-soft)",
          backdropFilter: "blur(30px) saturate(180%)",
          WebkitBackdropFilter: "blur(30px) saturate(180%)",
          borderBlockEnd: "1px solid var(--color-hairline)",
        }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--color-ink-3)" }}>
          סקירה
        </div>
        <div className="flex-1" />
        <div
          className="hidden min-w-[260px] items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] sm:flex"
          style={{
            background: "rgba(255,255,255,0.7)",
            borderColor: "var(--color-hairline)",
            color: "var(--color-ink-3)",
          }}
        >
          <Search size={13} strokeWidth={1.5} />
          חפש סוכן או פעולה
        </div>
        <button
          aria-label="התראות"
          className="flex h-8 w-8 items-center justify-center rounded-full border transition-colors hover:bg-white/90"
          style={{
            background: "rgba(255,255,255,0.7)",
            borderColor: "var(--color-hairline)",
          }}
        >
          <Bell size={14} strokeWidth={1.5} style={{ color: "var(--color-ink-2)" }} />
        </button>
      </header>

      {/* Greeting hero */}
      <section className="mb-[22px]">
        <div
          className="text-[12px] font-medium"
          style={{ color: "var(--color-ink-3)" }}
        >
          {dateString}
        </div>
        <h1
          className="my-1 text-[36px] font-bold leading-tight tracking-[-0.03em]"
          style={{ color: "var(--color-ink)" }}
        >
          {greeting}, {userName}.
        </h1>
        <div
          className="text-[13.5px]"
          style={{ color: "var(--color-ink-2)" }}
        >
          {activeAgents} סוכנים פעילים · {pendingApprovals}{" "}
          {pendingApprovals === 1 ? "פריט מחכה" : "פריטים מחכים"} לאישורך
        </div>
      </section>
    </>
  );
}
