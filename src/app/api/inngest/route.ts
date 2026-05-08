// src/app/api/inngest/route.ts
//
// Inngest webhook endpoint.
//
// Inngest Cloud calls this endpoint to:
//   1. Discover registered functions (GET request on first deploy)
//   2. Invoke a specific function (POST request, signed)
//   3. Health-check (PUT request)
//
// All three verbs are exported from `serve()`.
//
// Runtime: Node.js (NOT Edge). Reasons:
//   - The Growth Agent run takes 15-35s for 15 drafts. Edge max is 30s
//     on Hobby, 60s on Node — we need the headroom.
//   - The runGrowthAgent function path uses the Anthropic SDK + Supabase
//     admin client. Both work on Edge, but Inngest's signature
//     verification path historically prefers Node.
//
// maxDuration is set to 60s — the absolute ceiling on Hobby.
// On Vercel Pro this can go up to 800s if needed.

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { inngestFunctions } from "@/lib/inngest/functions";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
