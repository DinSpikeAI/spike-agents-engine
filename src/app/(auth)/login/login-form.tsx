"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sendMagicLink, verifyOtpCode } from "./actions";
import { Mail, ArrowLeft, KeyRound } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOtpInput, setShowOtpInput] = useState(false);

  // Read error from URL query (e.g. after callback failure)
  useEffect(() => {
    const urlError = searchParams.get("error");
    const fallback = searchParams.get("fallback");

    if (urlError) {
      setError(urlError);
    }

    // If callback redirected with ?fallback=otp, prep the OTP UI
    if (fallback === "otp") {
      setShowOtpInput(true);
    }
  }, [searchParams]);

  const handleSendLink = (e: React.FormEvent) => {
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
        setShowOtpInput(true); // auto-show OTP entry once link is sent
      } else {
        setError(res.error ?? "משהו השתבש. נסה שוב.");
      }
    });
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError("הזן קודם את כתובת המייל");
      return;
    }

    const cleanCode = otpCode.replace(/\D/g, "");
    if (cleanCode.length !== 6) {
      setError("הקוד חייב להיות 6 ספרות");
      return;
    }

    startTransition(async () => {
      const res = await verifyOtpCode(email, cleanCode);
      if (res.success) {
        // Force client refresh — pulls the new session cookies
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(res.error ?? "קוד שגוי. נסה שוב.");
      }
    });
  };

  // ─────────────────────────────────────────────────────────────
  // Success state — show "check your email" + OTP code input
  // ─────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div>
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
            שלחנו קישור התחברות + קוד אימות ל-
            <br />
            <span
              className="font-semibold"
              style={{ color: "var(--color-ink)" }}
              dir="ltr"
            >
              {email}
            </span>
          </p>
          <p
            className="mt-1 text-[11.5px] leading-relaxed"
            style={{ color: "var(--color-ink-3)" }}
          >
            לחץ על הקישור או הזן את הקוד מ-6 הספרות למטה
          </p>
        </div>

        {/* OTP code input — primary fallback to magic link */}
        <form onSubmit={handleVerifyOtp} className="mt-6 space-y-3">
          <div>
            <label
              htmlFor="otp"
              className="mb-1.5 block text-[12px] font-medium"
              style={{ color: "var(--color-ink-2)" }}
            >
              קוד אימות (6 ספרות)
            </label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              dir="ltr"
              autoFocus
              disabled={isPending}
              className="w-full rounded-[10px] border px-3.5 py-2.5 text-center text-[18px] font-mono tracking-[0.4em] transition-all focus:outline-none focus:ring-2 disabled:opacity-50"
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
            disabled={isPending || otpCode.length !== 6}
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
                <span>מאמת...</span>
              </>
            ) : (
              <>
                <KeyRound size={13} strokeWidth={1.75} />
                אמת קוד והתחבר
              </>
            )}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setSuccess(false);
            setShowOtpInput(false);
            setEmail("");
            setOtpCode("");
            setError(null);
          }}
          className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors"
          style={{ color: "var(--color-sys-blue)" }}
        >
          <ArrowLeft size={11} strokeWidth={2} />
          חזרה
        </button>

        <style jsx>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Default form — request magic link
  // (Also shows OTP input if redirected back with ?fallback=otp)
  // ─────────────────────────────────────────────────────────────
  return (
    <div>
      <form onSubmit={handleSendLink} className="space-y-4">
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
            הזן את המייל שלך ונשלח לך קישור־קסם וקוד אימות
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

        {error && !showOtpInput && (
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
              שלח לי קישור וקוד
            </>
          )}
        </button>
      </form>

      {/* OTP fallback section — shown when redirected from a failed callback */}
      {showOtpInput && (
        <div
          className="mt-6 border-t pt-5"
          style={{ borderColor: "var(--color-hairline)" }}
        >
          <h3
            className="mb-2 text-[14px] font-semibold"
            style={{ color: "var(--color-ink)" }}
          >
            יש לך כבר קוד מהמייל?
          </h3>
          <p
            className="mb-3 text-[12px] leading-relaxed"
            style={{ color: "var(--color-ink-3)" }}
          >
            הזן את הכתובת שלך למעלה ואת קוד 6 הספרות מהמייל למטה
          </p>

          <form onSubmit={handleVerifyOtp} className="space-y-3">
            <div>
              <label
                htmlFor="otp-fallback"
                className="mb-1.5 block text-[12px] font-medium"
                style={{ color: "var(--color-ink-2)" }}
              >
                קוד אימות
              </label>
              <input
                id="otp-fallback"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                dir="ltr"
                disabled={isPending}
                className="w-full rounded-[10px] border px-3.5 py-2.5 text-center text-[18px] font-mono tracking-[0.4em] transition-all focus:outline-none focus:ring-2 disabled:opacity-50"
                style={{
                  background: "rgba(255,255,255,0.9)",
                  borderColor: "var(--color-hairline-s)",
                  color: "var(--color-ink)",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isPending || otpCode.length !== 6 || !email}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border px-4 py-2.5 text-[13.5px] font-medium transition-all disabled:opacity-50"
              style={{
                background: "rgba(255,255,255,0.9)",
                borderColor: "var(--color-sys-blue)",
                color: "var(--color-sys-blue)",
              }}
            >
              <KeyRound size={13} strokeWidth={1.75} />
              אמת קוד והתחבר
            </button>
          </form>
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
