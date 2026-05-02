// src/app/(auth)/login/actions.ts
//
// Server Action: sends a Magic Link + 6-digit OTP code via Supabase Auth.
// The user can either click the link OR copy the 6-digit code.
// This dual-mode handles email scanners, mobile in-app browsers, and
// cross-device flows (request on desktop, click on phone).

"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export async function sendMagicLink(email: string) {
  if (!email || !email.includes("@") || email.length < 5) {
    return { error: "כתובת מייל לא תקינה" };
  }

  const headersList = await headers();
  const origin =
    headersList.get("origin") ||
    headersList.get("x-forwarded-host") ||
    "http://localhost:3000";

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("[sendMagicLink]", error);

    if (error.message.includes("rate limit")) {
      return { error: "שלחת יותר מדי בקשות. נסה שוב בעוד דקה." };
    }
    if (error.message.includes("Invalid email")) {
      return { error: "כתובת מייל לא תקינה" };
    }

    return { error: "שגיאה בשליחת המייל. נסה שוב." };
  }

  return { success: true };
}

/**
 * Verifies a 6-digit OTP code that the user copied from their email.
 *
 * KNOWN SUPABASE BUG: For first-time users, the type "magiclink" returns
 * "Token has expired or is invalid" even with a fresh, valid token.
 * The workaround is a fallback chain: try "email" first (modern, works for
 * existing users), then "magiclink" (legacy), then "signup" (first-time).
 *
 * See: https://github.com/supabase/gotrue/issues/876
 */
export async function verifyOtpCode(email: string, token: string) {
  if (!email || !email.includes("@")) {
    return { error: "כתובת מייל לא תקינה" };
  }

  const cleanToken = token.replace(/\D/g, "");
  if (cleanToken.length !== 6) {
    return { error: "הקוד חייב להיות 6 ספרות" };
  }

  const cleanEmail = email.trim().toLowerCase();
  const supabase = await createClient();

  // Fallback chain — Supabase's auth API is inconsistent for first-time users.
  // We try the modern "email" type first; if that fails with token-related
  // errors, fall through to "magiclink" (legacy alias) and "signup" (new user).
  const types: Array<"email" | "magiclink" | "signup"> = [
    "email",
    "magiclink",
    "signup",
  ];

  let lastError: { message: string } | null = null;

  for (const type of types) {
    const { error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type,
    });

    if (!error) {
      return { success: true };
    }

    lastError = error;

    // If error is rate limit or "user not found" — bail out, don't retry
    const isFatalError =
      error.message.includes("rate limit") ||
      error.message.includes("not found") ||
      error.message.includes("invalid email");

    if (isFatalError) break;

    // Otherwise, log and try the next type
    console.warn(
      `[verifyOtpCode] type "${type}" failed: ${error.message}, trying next…`
    );
  }

  // All types failed — return friendly error based on last failure
  console.error("[verifyOtpCode] all types failed", lastError);

  if (lastError?.message.includes("expired")) {
    return { error: "הקוד פג תוקף. בקש קוד חדש." };
  }
  if (
    lastError?.message.toLowerCase().includes("invalid") ||
    lastError?.message.toLowerCase().includes("token")
  ) {
    return { error: "קוד שגוי. בדוק את המייל ונסה שוב." };
  }

  return { error: "שגיאה באימות הקוד. נסה שוב." };
}
