// src/app/(auth)/login/actions.ts
//
// Server Action: sends a 6-digit OTP code via Supabase Auth.
// User enters the code on the login page to authenticate.

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
 * IMPORTANT: As of Supabase 2024+, the only valid type for email OTP is "email".
 * Old types ("magiclink", "signup") are deprecated and will fail.
 * See: https://supabase.com/docs/reference/javascript/auth-verifyotp
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

  const { error } = await supabase.auth.verifyOtp({
    email: cleanEmail,
    token: cleanToken,
    type: "email",
  });

  if (!error) {
    return { success: true };
  }

  console.error("[verifyOtpCode] failed", error);

  // Friendly Hebrew errors
  const msg = error.message.toLowerCase();

  if (msg.includes("expired") || msg.includes("invalid")) {
    return {
      error:
        "קוד שגוי או פג תוקף. ודא שהזנת את הקוד האחרון שקיבלת, או בקש קוד חדש.",
    };
  }
  if (msg.includes("rate limit")) {
    return { error: "יותר מדי ניסיונות. נסה שוב בעוד דקה." };
  }
  if (msg.includes("token")) {
    return { error: "קוד לא תקין. בדוק את הספרות ונסה שוב." };
  }

  return { error: "שגיאה באימות הקוד. נסה שוב." };
}