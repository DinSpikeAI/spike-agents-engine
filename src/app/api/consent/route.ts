// src/app/api/consent/route.ts
//
// API endpoint לתיעוד הסכמות משפטיות
//
// POST /api/consent
// Body: { documentType, documentVersion, consented, consentMethod }
//
// תיעוד מלא: timestamp, IP, user-agent — נדרש לראיה במקרה של מחלוקת
// או חקירה רגולטורית (תיקון 13 + סעיף 30א).
//
// כל הסכמות נשמרות במסד הנתונים ל-7 שנים מינימום (תקופת התיישנות
// תיקון 13 לתביעות אזרחיות).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ConsentDocumentType =
  | "terms_of_service"
  | "privacy_policy"
  | "acceptable_use_policy"
  | "data_processing_agreement"
  | "cookie_policy"
  | "marketing_consent";

type ConsentMethod =
  | "checkbox_signup"
  | "checkbox_settings_update"
  | "cookie_banner"
  | "tos_update_modal"
  | "api_acceptance";

type ConsentRequest = {
  documentType: ConsentDocumentType;
  documentVersion: string;
  consented: boolean;
  consentMethod: ConsentMethod;
};

const VALID_DOCUMENT_TYPES: ConsentDocumentType[] = [
  "terms_of_service",
  "privacy_policy",
  "acceptable_use_policy",
  "data_processing_agreement",
  "cookie_policy",
  "marketing_consent",
];

const VALID_METHODS: ConsentMethod[] = [
  "checkbox_signup",
  "checkbox_settings_update",
  "cookie_banner",
  "tos_update_modal",
  "api_acceptance",
];

function getClientIp(req: NextRequest): string {
  // Vercel sets x-forwarded-for; first IP in the chain is the client
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ConsentRequest;

    // Validate
    if (!VALID_DOCUMENT_TYPES.includes(body.documentType)) {
      return NextResponse.json(
        { error: "Invalid documentType" },
        { status: 400 }
      );
    }
    if (!VALID_METHODS.includes(body.consentMethod)) {
      return NextResponse.json(
        { error: "Invalid consentMethod" },
        { status: 400 }
      );
    }
    if (!body.documentVersion || body.documentVersion.length > 20) {
      return NextResponse.json(
        { error: "Invalid documentVersion" },
        { status: 400 }
      );
    }
    if (typeof body.consented !== "boolean") {
      return NextResponse.json(
        { error: "consented must be boolean" },
        { status: 400 }
      );
    }

    // Get authenticated user (or null for anonymous cookie consent)
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Capture evidence
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    // Insert into consent_log table
    const { error } = await supabase.from("consent_log").insert({
      user_id: user?.id ?? null,
      document_type: body.documentType,
      document_version: body.documentVersion,
      consented: body.consented,
      consent_method: body.consentMethod,
      ip_address: ip,
      user_agent: userAgent.slice(0, 500), // truncate to prevent abuse
      // consented_at default = now() in DB schema
    });

    if (error) {
      console.error("[consent] insert failed", error);
      return NextResponse.json(
        { error: "Failed to log consent" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("[consent] request failed", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/consent - retrieve user's consent history (for DSAR / settings)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("consent_log")
      .select(
        "document_type, document_version, consented, consent_method, consented_at"
      )
      .eq("user_id", user.id)
      .order("consented_at", { ascending: false });

    if (error) {
      console.error("[consent] fetch failed", error);
      return NextResponse.json(
        { error: "Failed to fetch consent history" },
        { status: 500 }
      );
    }

    return NextResponse.json({ consents: data ?? [] }, { status: 200 });
  } catch (e) {
    console.error("[consent] GET failed", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
