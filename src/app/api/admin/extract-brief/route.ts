// src/app/api/admin/extract-brief/route.ts
//
// Sprint 3G Phase 1a (2026-05-16) — testing endpoint for brief extraction.
//
// Auth: Authorization: Bearer ${CRON_SECRET}
//
// Phase 1a goal: validate the extractor against real Israeli SMB websites
// before exposing it via UI. Once Phase 1b ships the Settings page button,
// this endpoint can be deleted (or tightened to per-tenant auth + spend
// cap + agent_runs logging — currently has none of that for test simplicity).
//
// Usage from PowerShell:
//   $env:CRON_SECRET = "<secret>"  # already in Vercel env, not local
//   $body = @{ websiteUrl = "https://example.co.il" } | ConvertTo-Json
//   Invoke-RestMethod -Uri "https://app.spikeai.co.il/api/admin/extract-brief" `
//     -Method POST `
//     -Headers @{ Authorization = "Bearer $env:CRON_SECRET" } `
//     -ContentType "application/json" `
//     -Body $body
//
// Usage from curl:
//   curl -X POST https://app.spikeai.co.il/api/admin/extract-brief \
//     -H "Authorization: Bearer $CRON_SECRET" \
//     -H "Content-Type: application/json" \
//     -d '{"websiteUrl":"https://example.co.il"}'

import { NextResponse } from "next/server";
import { extractBriefFromWebsite } from "@/lib/agents/brief-extractor/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Haiku is fast — ~5-10s total including fetch — but allow margin.
export const maxDuration = 30;

interface RequestBody {
  websiteUrl?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  // Auth
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Parse body
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const websiteUrl = (body.websiteUrl ?? "").trim();
  if (!websiteUrl) {
    return NextResponse.json(
      { error: "missing websiteUrl in body" },
      { status: 400 }
    );
  }

  const result = await extractBriefFromWebsite(websiteUrl);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 422,
  });
}
