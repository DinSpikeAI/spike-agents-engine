"use client";

// src/components/dashboard/growth/OnDemandTriggerButton.tsx
//
// Sub-stage 1.15 — Sprint 2 Batch 2B
// Header CTA that fires a manual Growth Agent run via Inngest.
//
// Tier gate is enforced server-side in triggerGrowthOnDemand
// (Pro/Chain only) but we mirror it here to disable the button
// up-front for Solo. The 60-minute cooldown is also enforced
// server-side and surfaced via the action's { ok: false, message }
// response — we just toast it.
//
// Important: this only TRIGGERS a run (Inngest event). Drafts will
// land in growth_candidates after the run finishes (a few minutes).
// The button doesn't block-and-wait — toast says "תוצאות יופיעו
// תוך כמה דקות" and the page revalidates on next navigation.

import { useTransition } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { triggerGrowthOnDemand } from "@/app/dashboard/actions/growth";

interface OnDemandTriggerButtonProps {
  /** "solo" | "pro" | "chain" — Solo sees a disabled button with hint */
  tier: string;
}

export function OnDemandTriggerButton({ tier }: OnDemandTriggerButtonProps) {
  const [isPending, startTransition] = useTransition();
  const isUnlocked = tier === "pro" || tier === "chain";

  function handleClick() {
    if (!isUnlocked || isPending) return;
    startTransition(async () => {
      const result = await triggerGrowthOnDemand();
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isUnlocked || isPending}
      title={
        isUnlocked
          ? "הפעלה ידנית של הסוכן (60 דקות cooldown)"
          : "הפעלה ידנית זמינה במסלול Pro ומעלה"
      }
      className="inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-55"
      style={{
        background: isUnlocked
          ? "var(--color-sys-blue)"
          : "rgba(255,255,255,0.6)",
        color: isUnlocked ? "white" : "var(--color-ink-3)",
        border: isUnlocked
          ? "1px solid transparent"
          : "1px solid var(--color-hairline)",
        boxShadow: isUnlocked && !isPending ? "var(--shadow-cta)" : "none",
      }}
    >
      <Sparkles size={13} strokeWidth={1.75} />
      {isPending ? "מפעיל..." : "הפעל סוכן ידנית"}
    </button>
  );
}
