// src/app/(auth)/login/page.tsx
//
// Hebrew Magic Link login page — Calm Frosted edition.
// AppleBg + Glass card + System Blue CTA + Spike mascot hero.
//
// Responsive behavior:
//   - Mobile (< md): mascot appears compact above the form
//   - Desktop (md+): mascot is the hero on the left side
//
// LoginForm is wrapped in Suspense because it uses useSearchParams(),
// which requires a Suspense boundary in Next.js 16 static rendering.

import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { AppleBg } from "@/components/ui/apple-bg";
import { Glass } from "@/components/ui/glass";
import { Mascot } from "@/components/ui/mascot";

export const metadata = {
  title: "התחבר — Spike",
};

// Skeleton shown while LoginForm hydrates with searchParams
function LoginFormSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <div
          className="h-[18px] w-20 rounded"
          style={{ background: "rgba(15,20,30,0.06)" }}
        />
        <div
          className="mt-2 h-[12px] w-48 rounded"
          style={{ background: "rgba(15,20,30,0.04)" }}
        />
      </div>
      <div>
        <div
          className="mb-1.5 h-[12px] w-16 rounded"
          style={{ background: "rgba(15,20,30,0.04)" }}
        />
        <div
          className="h-[42px] w-full rounded-[10px]"
          style={{ background: "rgba(255,255,255,0.6)" }}
        />
      </div>
      <div
        className="h-[42px] w-full rounded-[10px]"
        style={{ background: "var(--color-sys-blue)", opacity: 0.5 }}
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div
      className="relative min-h-screen overflow-hidden"
      dir="rtl"
      style={{ color: "var(--color-ink)" }}
    >
      <AppleBg />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-[1100px] items-center justify-center gap-12 p-4 md:p-8">
        {/* Desktop hero — Spike mascot with laptop (lg+) */}
        <div className="hidden flex-1 items-center justify-center md:flex">
          <div className="relative">
            <Mascot pose="laptop" size={360} float priority />

            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(184,206,255,0.55), rgba(184,206,255,0) 70%)",
                transform: "scale(1.4)",
              }}
            />

            <div
              className="mt-3 text-center text-[13px] leading-relaxed"
              style={{ color: "var(--color-ink-3)" }}
            >
              <div
                className="text-[15px] font-semibold"
                style={{ color: "var(--color-ink)" }}
              >
                שמונה סוכנים. שקט אחד.
              </div>
              <div className="mt-1">
                הצוות השקט שעובד מאחורי הקלעים על העסק שלך.
              </div>
            </div>
          </div>
        </div>

        {/* Login form — full width on mobile, half on desktop */}
        <div className="w-full max-w-[420px]">
          {/* Mobile-only mascot — compact, above the form */}
          <div className="mb-3 flex justify-center md:hidden">
            <div className="relative">
              <Mascot pose="phone-right" size={140} priority />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(184,206,255,0.5), rgba(184,206,255,0) 70%)",
                  transform: "scale(1.4)",
                }}
              />
            </div>
          </div>

          {/* Brand block */}
          <div className="mb-6 flex flex-col items-center text-center md:mb-7 md:items-start md:text-right">
            {/* Logo "S" pill — desktop only (mascot replaces it on mobile) */}
            <div
              className="mb-4 hidden h-11 w-11 items-center justify-center rounded-[12px] text-[18px] font-bold text-white md:flex"
              style={{
                background: "linear-gradient(135deg, #0A84FF, #5856D6)",
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.5) inset, 0 8px 22px rgba(10,132,255,0.32)",
              }}
            >
              S
            </div>
            <h1
              className="text-[22px] font-bold tracking-[-0.025em] sm:text-[26px]"
              style={{ color: "var(--color-ink)" }}
            >
              ברוך הבא ל-Spike Engine
            </h1>
            <p
              className="mt-1.5 text-[13px] sm:text-[13.5px]"
              style={{ color: "var(--color-ink-3)" }}
            >
              הזן את האימייל שלך ונשלח לך קוד אימות
            </p>
          </div>

          {/* Glass form card */}
          <Glass deep className="p-5 sm:p-6">
            <Suspense fallback={<LoginFormSkeleton />}>
              <LoginForm />
            </Suspense>
          </Glass>

          <p
            className="mt-5 text-center text-[11.5px] md:text-right"
            style={{ color: "var(--color-ink-3)" }}
          >
            כניסה דרך קוד אימות שנשלח למייל. אין סיסמאות.
          </p>
        </div>
      </main>
    </div>
  );
}
