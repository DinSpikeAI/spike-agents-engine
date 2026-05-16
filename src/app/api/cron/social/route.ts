import { createAdminClient } from "@/lib/supabase/admin";
import { runSocialAgent } from "@/lib/agents/social/run";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Hobby plan caps at 60s regardless

/**
 * Social Agent daily cron — Day 14 (schedule corrected Day 17)
 *
 * Scheduled: 30 5 * * 0-4  (05:30 UTC, Sun-Thu only)
 * Israel local time: 07:30 IST winter / 08:30 IST summer
 * Skip Friday + Saturday (Israeli weekend) — most retail / beauty /
 * dental businesses are closed on Saturday, so a "we're open" post
 * would land wrong. Emergency-service verticals will get an opt-in
 * flag in tenant.config in a later iteration.
 *
 * For each active tenant with social agent enabled:
 *   - Run social agent
 *   - Persist 3 post drafts to drafts table
 *   - Continue on individual tenant failures (don't fail batch)
 *
 * Idempotency: agent_runs uniqueness prevents double execution
 * if Vercel double-delivers the cron.
 *
 * ─────────────────────────────────────────────────────────────
 * Sprint 3α Phase A (2026-05-16) — METHOD FIX: POST → GET
 *
 * Vercel cron sends HTTP GET, not POST. This route had been exporting
 * POST since Day 14, so every scheduled invocation hit a silent 405 and
 * the function body never ran. Same root cause as Inventory cron
 * (commit 1f4f1fd) and Sales cron (same commit as this).
 * ─────────────────────────────────────────────────────────────
 */
export async function GET(request: Request): Promise<NextResponse> {
  // ── Security: verify this came from Vercel Cron ──────────
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[cron/social] Unauthorized call — bad or missing CRON_SECRET");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const results = {
    totalTenants: 0,
    succeeded: 0,
    failed: 0,
    noOp: 0,
    failures: [] as Array<{ tenantId: string; error: string }>,
  };

  try {
    const db = createAdminClient();

    // ── Find all active tenants ───────────────────────────────
    const { data: tenants, error: tenantsError } = await db
      .from("tenants")
      .select("id, name")
      .eq("is_active", true);

    if (tenantsError) {
      console.error("[cron/social] Failed to query tenants:", tenantsError);
      return NextResponse.json(
        { error: tenantsError.message },
        { status: 500 }
      );
    }

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No active tenants",
        ...results,
      });
    }

    results.totalTenants = tenants.length;

    // ── Run agent for each tenant sequentially ────────────────
    // Sequential (not parallel) to keep things simple at low scale
    // and avoid hammering Anthropic with concurrent requests.
    // At 50+ tenants, switch to Anthropic Batch API or Inngest fan-out
    // (same pattern as Manager Sprint 3Z).
    for (const tenant of tenants) {
      try {
        const result = await runSocialAgent(tenant.id, "scheduled");

        if (result.status === "succeeded") {
          results.succeeded++;
        } else if (result.status === "no_op") {
          results.noOp++;
        } else {
          results.failed++;
          results.failures.push({
            tenantId: tenant.id,
            error: result.error ?? "unknown",
          });
        }
      } catch (err) {
        results.failed++;
        const message = err instanceof Error ? err.message : "unknown";
        results.failures.push({
          tenantId: tenant.id,
          error: message,
        });
        console.error(
          `[cron/social] Tenant ${tenant.id} (${tenant.name}) failed:`,
          err
        );
      }
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[cron/social] Done in ${elapsedMs}ms. ` +
        `Total=${results.totalTenants}, ` +
        `Succeeded=${results.succeeded}, ` +
        `NoOp=${results.noOp}, ` +
        `Failed=${results.failed}`
    );

    return NextResponse.json({
      ok: true,
      elapsedMs,
      ...results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/social] Exception:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
