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
  // Validation
  if (!email || !email.includes("@") || email.length < 5) {
    return { error: "כתובת מייל לא תקינה" };
  }

  const headersList = await headers();
  const origin =
    headersList.get("origin") ||
    headersList.get("x-forwarded-host") ||
    "http://localhost:3000";

  const supabase = await createClient();

  // Send magic link + OTP code.
  // Supabase email template should include both {{ .ConfirmationURL }} and
  // {{ .Token }}. The user can use whichever works (link OR 6-digit code).
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
 * This is the fallback when the magic link doesn't work
 * (e.g., on mobile, in-app browsers, or after email scanner consumed the link).
 */
export async function verifyOtpCode(email: string, token: string) {
  if (!email || !email.includes("@")) {
    return { error: "כתובת מייל לא תקינה" };
  }

  // Sanitize the OTP — strip non-digits, must be exactly 6 chars
  const cleanToken = token.replace(/\D/g, "");
  if (cleanToken.length !== 6) {
    return { error: "הקוד חייב להיות 6 ספרות" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: cleanToken,
    type: "email",
  });

  if (error) {
    console.error("[verifyOtpCode]", error);

    if (error.message.includes("expired")) {
      return { error: "הקוד פג תוקף. בקש קוד חדש." };
    }
    if (error.message.includes("invalid") || error.message.includes("Token")) {
      return { error: "קוד שגוי. בדוק את המייל ונסה שוב." };
    }

    return { error: "שגיאה באימות הקוד. נסה שוב." };
  }

  return { success: true };
}
