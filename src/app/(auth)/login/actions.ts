// src/app/(auth)/login/actions.ts
//
// Server Action: sends a Magic Link via Supabase Auth.
// The Magic Link → Supabase → Resend SMTP → user's inbox.
// User clicks link → /auth/callback → /dashboard.

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

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: true, // create user on first login
    },
  });

  if (error) {
    console.error("[sendMagicLink]", error);

    // Friendly Hebrew error messages
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