"use client";

import { useState, useTransition } from "react";
import { sendMagicLink } from "./actions";
import { Mail, ArrowLeft } from "lucide-react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!email || !email.includes("@")) {
      setError("נא להזין כתובת מייל תקינה");
      return;
    }

    startTransition(async () => {
      const res = await sendMagicLink(email);
      if (res.success) {
        setSuccess(true);
      } else {
        setError(res.error ?? "משהו השתבש. נסה שוב.");
      }
    });
  };

  // Success state
  if (success) {
    return (
      <div className="text-center">
        <div
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
          style={{
            background: "var(--color-sys-green-soft)",
            color: "var(--color-sys-green)",
          }}
        >
          <Mail size={20} strokeWidth={1.75} />
        </div>
        <h2
          className="text-[16px] font-semibold"
          style={{ color: "var(--color-ink)" }}
        >
          בדוק את המייל שלך
        </h2>
        <p
          className="mt-2 text-[13px] leading-relaxed"
          style={{ color: "var(--color-ink-2)" }}
        >
          שלחנו קישור התחברות ל-
          <span className="font-semibold" style={{ color: "var(--color-ink)" }}>
            {email}
          </span>
        </p>
        <p
          className="mt-1 text-[11.5px]"
          style={{ color: "var(--color-ink-3)" }}
        >
          אם לא רואה תוך כמה דקות, בדוק בתיקיית ה-Spam או נסה שוב
        </p>
        <button
          type="button"
          onClick={() => {
            setSuccess(false);
            setEmail("");
          }}
          className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors"
          style={{ color: "var(--color-sys-blue)" }}
        >
          <ArrowLeft size={11} strokeWidth={2} />
          חזרה
        </button>
      </div>
    );
  }

  // Default form
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2
          className="text-[18px] font-semibold tracking-tight"
          style={{ color: "var(--color-ink)" }}
        >
          התחבר
        </h2>
        <p
          className="mt-1 text-[12.5px]"
          style={{ color: "var(--color-ink-3)" }}
        >
          הזן את המייל שלך ונשלח לך קישור-קסם
        </p>
      </div>

      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-[12px] font-medium"
          style={{ color: "var(--color-ink-2)" }}
        >
          כתובת מייל
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          dir="ltr"
          autoComplete="email"
          autoFocus
          disabled={isPending}
          className="w-full rounded-[10px] border px-3.5 py-2.5 text-[14px] transition-all focus:outline-none focus:ring-2 disabled:opacity-50"
          style={{
            background: "rgba(255,255,255,0.9)",
            borderColor: "var(--color-hairline-s)",
            color: "var(--color-ink)",
          }}
        />
      </div>

      {error && (
        <div
          className="rounded-[8px] px-3 py-2 text-[12px]"
          style={{
            background: "rgba(214, 51, 108, 0.08)",
            color: "var(--color-sys-pink)",
            border: "1px solid rgba(214, 51, 108, 0.2)",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-medium text-white transition-all disabled:opacity-50"
        style={{
          background: "var(--color-sys-blue)",
          boxShadow: "var(--shadow-cta)",
        }}
      >
        {isPending ? (
          <>
            <span
              className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent"
              style={{ animation: "spin 0.8s linear infinite" }}
              aria-hidden="true"
            />
            <span>שולח...</span>
          </>
        ) : (
          <>
            <Mail size={13} strokeWidth={1.75} />
            שלח לי קישור
          </>
        )}
      </button>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </form>
  );
}
