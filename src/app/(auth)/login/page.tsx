// src/app/(auth)/login/page.tsx
//
// Hebrew Magic Link login page — Calm Frosted edition.
// AppleBg + Glass card + System Blue CTA (matching dashboard aesthetic).

import { LoginForm } from "./login-form";
import { AppleBg } from "@/components/ui/apple-bg";
import { Glass } from "@/components/ui/glass";

export const metadata = {
  title: "התחבר — Spike",
};

export default function LoginPage() {
  return (
    <div
      className="relative min-h-screen"
      dir="rtl"
      style={{ color: "var(--color-ink)" }}
    >
      <AppleBg />

      <main className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-[420px]">
          {/* Logo + brand */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] text-[20px] font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #0A84FF, #5856D6)",
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.5) inset, 0 8px 22px rgba(10,132,255,0.32)",
              }}
            >
              S
            </div>
            <h1
              className="text-[28px] font-bold tracking-[-0.025em]"
              style={{ color: "var(--color-ink)" }}
            >
              Spike Engine
            </h1>
            <p
              className="mt-1.5 text-[13.5px]"
              style={{ color: "var(--color-ink-3)" }}
            >
              הצוות השקט שעובד מאחורי הקלעים
            </p>
          </div>

          {/* Glass form card */}
          <Glass deep className="p-6">
            <LoginForm />
          </Glass>

          <p
            className="mt-5 text-center text-[11.5px]"
            style={{ color: "var(--color-ink-3)" }}
          >
            כניסה דרך קישור-קסם נשלח למייל. אין סיסמאות.
          </p>
        </div>
      </main>
    </div>
  );
}
