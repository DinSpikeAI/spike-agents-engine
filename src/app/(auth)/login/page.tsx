// src/app/(auth)/login/page.tsx
//
// Hebrew Magic Link login page.
// User enters email → Server Action sends Magic Link via Resend → toast confirmation.

import { LoginForm } from "./login-form";

export const metadata = {
  title: "התחבר — Spike",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-3">
            <span className="bg-gradient-to-r from-[#22D3B0] to-[#5BD0F2] bg-clip-text text-transparent">
              Spike Engine
            </span>
          </h1>
          <p className="text-muted-foreground">
            הצוות השקט שעובד מאחורי הקלעים
          </p>
        </div>

        <LoginForm />

        <p className="text-center text-xs text-muted-foreground mt-6">
          כניסה דרך קישור-קסם נשלח למייל. אין סיסמאות.
        </p>
      </div>
    </main>
  );
}