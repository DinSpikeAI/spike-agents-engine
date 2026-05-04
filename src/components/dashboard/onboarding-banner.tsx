"use client";

// src/components/dashboard/onboarding-banner.tsx
//
// Sub-stage 1.6 — Onboarding banner.
//
// Shown to users whose tenant has zero non-mock agent_runs. Invites them to
// /dashboard/showcase to see Spike in action with mock data before
// committing to a real run.
//
// Dismissal:
//   - Auto: parent server component hides this when realRunCount > 0
//     (the parent re-renders on every navigation).
//   - Manual: X button stores a localStorage flag per-tenant. The user
//     won't see it again on this browser even if they have 0 real runs.
//
// localStorage key shape:
//   spike.onboardingBannerDismissedAt:<tenantId>  =  ISO timestamp
//
// We key by tenantId so a user with multiple tenants gets independent
// dismissal state.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";

interface OnboardingBannerProps {
  tenantId: string;
}

const STORAGE_KEY_PREFIX = "spike.onboardingBannerDismissedAt:";

export function OnboardingBanner({ tenantId }: OnboardingBannerProps) {
  // Hidden by default to avoid hydration flash. Becomes visible after the
  // useEffect check confirms no localStorage flag exists.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const dismissedAt = window.localStorage.getItem(
        STORAGE_KEY_PREFIX + tenantId
      );
      if (!dismissedAt) {
        setVisible(true);
      }
    } catch {
      // localStorage access can throw in private mode or with strict policies.
      // If we can't read, default to showing the banner (better to be visible
      // than missing — the user can always dismiss it again).
      setVisible(true);
    }
  }, [tenantId]);

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY_PREFIX + tenantId,
        new Date().toISOString()
      );
    } catch {
      // Silent fail — at worst the banner reappears on next render.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="mb-5 flex items-center gap-3 rounded-[16px] px-4 py-3.5 sm:px-5 sm:py-4"
      style={{
        background:
          "linear-gradient(135deg, rgba(232,239,255,0.85), rgba(248,243,255,0.85))",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.7)",
        boxShadow:
          "0 4px 16px rgba(15,20,30,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
      }}
    >
      {/* Icon */}
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11"
        style={{
          background: "linear-gradient(135deg, #0A84FF, #5856D6)",
          boxShadow:
            "0 4px 12px rgba(10,132,255,0.25), inset 0 1px 0 rgba(255,255,255,0.4)",
        }}
      >
        <Sparkles size={18} strokeWidth={2} className="text-white" />
      </div>

      {/* Text + CTA */}
      <div className="min-w-0 flex-1">
        <div
          className="text-[14.5px] font-semibold tracking-tight sm:text-[15px]"
          style={{ color: "var(--color-ink)" }}
        >
          עוד לא הרצת אף סוכן
        </div>
        <div
          className="mt-0.5 text-[12.5px] leading-[1.5] sm:text-[13px]"
          style={{ color: "var(--color-ink-2)" }}
        >
          רוצה לראות איך Spike עובד? צפה ב-Showcase עם דוגמאות חיות.
        </div>
      </div>

      {/* CTA button */}
      <Link
        href="/dashboard/showcase"
        className="shrink-0 rounded-full px-4 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 active:scale-[0.98] sm:text-[13px]"
        style={{
          background: "var(--color-sys-blue)",
          boxShadow: "0 2px 8px rgba(10,132,255,0.25)",
        }}
      >
        צפה ב-Showcase
      </Link>

      {/* Dismiss X */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="סגור"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5 active:scale-95"
        style={{ color: "var(--color-ink-3)" }}
      >
        <X size={15} strokeWidth={1.8} />
      </button>
    </div>
  );
}
