// src/app/auth/callback/route.ts
//
// Auth callback handler. Supports both flows:
//
// 1. Token Hash flow (PRIMARY): ?token_hash=...&type=magiclink
//    - More reliable on mobile, in-app browsers, and email scanners.
//    - Doesn't require a cookie/local-storage from the requesting device.
//
// 2. PKCE flow (FALLBACK): ?code=...
//    - Used when the user clicks the link from the same browser they
//      requested it on (best-case scenario).
//
// We prioritize token_hash because PKCE fails when:
// - User clicks link in email app's in-app browser (Gmail/Outlook on mobile)
// - User requests on phone, clicks on desktop (or vice versa)
// - Email scanner pre-fetches the link
// - User cleared cookies between request and click

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export const runtime = "nodejs"; // CRITICAL: not Edge

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  const supabase = await createClient();

  // ─────────────────────────────────────────────────────────────
  // PRIMARY: Token Hash flow (more reliable across devices/scanners)
  // ─────────────────────────────────────────────────────────────
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback OTP]", error);

    // If OTP fails, redirect to login with helpful message
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "הקישור פג תוקף או כבר נצרך. בקש קישור חדש או הזן את הקוד מהמייל."
      )}`
    );
  }

  // ─────────────────────────────────────────────────────────────
  // FALLBACK: PKCE flow (only works on same-browser clicks)
  // ─────────────────────────────────────────────────────────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback PKCE]", error);

    // PKCE failures are common on mobile — redirect to login with OTP option
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "הקישור לא עובד מהמכשיר הזה. הזן את הקוד מ-6 הספרות שקיבלת במייל."
      )}&fallback=otp`
    );
  }

  // No valid params at all
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("חסר קוד אימות בקישור")}`
  );
}
