import { Search, Bell, FlaskConical } from "lucide-react";

interface TopbarProps {
  greeting: string;
  userName: string;
  pendingApprovals: number;
  lastUpdate: string;
}

export function Topbar({
  greeting,
  userName,
  pendingApprovals,
  lastUpdate: _lastUpdate,
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
      {/* Desktop-only utility bar (hidden on mobile — replaced by MobileHeader) */}
      <header
        className="sticky top-0 z-10 mb-6 -mx-6 hidden h-14 items-center gap-3.5 px-6 md:-mx-10 md:flex md:px-10"
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
          <Bell
            size={14}
            strokeWidth={1.5}
            style={{ color: "var(--color-ink-2)" }}
          />
        </button>
      </header>

      {/* Demo mode banner — compact on mobile */}
      <div
        className="mb-4 flex items-start gap-3 rounded-[14px] px-3.5 py-2.5 sm:mb-5 sm:px-4 sm:py-3"
        style={{
          background: "rgba(224, 169, 61, 0.08)",
          border: "1px solid rgba(224, 169, 61, 0.22)",
        }}
      >
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
          style={{
            background: "rgba(224, 169, 61, 0.15)",
            color: "var(--color-sys-amber)",
          }}
        >
          <FlaskConical size={14} strokeWidth={2} />
        </div>
        <div className="flex-1">
          <div
            className="text-[13px] font-semibold"
            style={{ color: "var(--color-ink)" }}
          >
            חשבון הדגמה
          </div>
          <div
            className="mt-0.5 text-[12px] leading-relaxed"
            style={{ color: "var(--color-ink-2)" }}
          >
            הסוכנים מציגים תוצאות עם נתוני הדגמה. אינטגרציות אמיתיות (Google
            Reviews, WhatsApp, Instagram) יחוברו בהמשך.
          </div>
        </div>
      </div>

      {/* Greeting hero — responsive sizing */}
      <section className="mb-5 sm:mb-[22px]">
        <div
          className="text-[11.5px] font-medium sm:text-[12px]"
          style={{ color: "var(--color-ink-3)" }}
        >
          {dateString}
        </div>
        <h1
          className="my-1 text-[26px] font-bold leading-[1.15] tracking-[-0.025em] sm:text-[36px] sm:leading-tight sm:tracking-[-0.03em]"
          style={{ color: "var(--color-ink)" }}
        >
          {greeting}, {userName}.
        </h1>
        <div
          className="text-[12.5px] sm:text-[13.5px]"
          style={{ color: "var(--color-ink-2)" }}
        >
          {pendingApprovals > 0
            ? `${pendingApprovals} ${
                pendingApprovals === 1 ? "פריט מחכה" : "פריטים מחכים"
              } לאישורך`
            : "אין פריטים שמחכים לאישורך"}
        </div>
      </section>
    </>
  );
}
