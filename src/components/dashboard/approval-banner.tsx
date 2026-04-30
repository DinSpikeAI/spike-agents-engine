import { Glass } from "@/components/ui/glass";
import { Zap } from "lucide-react";

interface ApprovalBannerProps {
  count: number;
  summary: string;
}

export function ApprovalBanner({ count, summary }: ApprovalBannerProps) {
  return (
    <Glass deep className="mb-[22px] flex items-center gap-3.5 px-[18px] py-3.5">
      <div
        className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[11px] text-white"
        style={{
          background: "linear-gradient(135deg, #FFB47A, #D6336C)",
          boxShadow: "0 4px 14px rgba(214,51,108,0.32)",
        }}
      >
        <Zap size={16} strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-[14px] font-semibold"
          style={{ color: "var(--color-ink)" }}
        >
          {count} {count === 1 ? "פריט מחכה" : "פריטים מחכים"} לאישורך
        </div>
        <div
          className="mt-0.5 text-[12px]"
          style={{ color: "var(--color-ink-2)" }}
        >
          {summary}
        </div>
      </div>
      <button
        className="flex-shrink-0 rounded-[9px] border px-3.5 py-1.5 text-[12.5px] font-medium transition-all hover:bg-white"
        style={{
          background: "rgba(255,255,255,0.85)",
          borderColor: "var(--color-hairline)",
          color: "var(--color-ink)",
        }}
      >
        פתח ←
      </button>
    </Glass>
  );
}
