import { createAdminClient } from "@/lib/supabase/admin";
import { runSalesAgent } from "@/lib/agents/sales/run";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes (Pro plan limit)

/**
 * Sales Agent daily cron — Day 15
 *
 * Scheduled: 30 7 * * 0-4  (07:30 UTC, Sun-Thu only)
 * Israel local time: 09:30 IST winter / 10:30 IST summer
 * Skip Friday + Saturday (Israeli weekend)
 *
 * For each active tenant:
 *   - Run sales agent
 *   - Persist follow-up drafts to drafts table
 *   - Continue on individual tenant failures
 *
 * Idempotency: agent_runs uniqueness prevents double execution
 * if Vercel double-delivers the cron.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[cron/sales] Unauthorized call — bad or missing CRON_SECRET");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const results = {
    totalTenants: 0,
    succeeded: 0,
    failed: 0,
    noOp: 0,
    totalFollowUps: 0,
    failures: [] as Array<{ tenantId: string; error: string }>,
  };

  try {
    const db = createAdminClient();

    const { data: tenants, error: tenantsError } = await db
      .from("tenants")
      .select("id, name")
      .eq("is_active", true);

    if (tenantsError) {
      console.error("[cron/sales] Failed to query tenants:", tenantsError);
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

    for (const tenant of tenants) {
      try {
        const result = await runSalesAgent(tenant.id, "scheduled");

        if (result.status === "succeeded") {
          results.succeeded++;
          results.totalFollowUps += result.draftIds.length;
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
          `[cron/sales] Tenant ${tenant.id} (${tenant.name}) failed:`,
          err
        );
      }
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[cron/sales] Done in ${elapsedMs}ms. ` +
        `Total=${results.totalTenants}, ` +
        `Succeeded=${results.succeeded}, ` +
        `NoOp=${results.noOp}, ` +
        `Failed=${results.failed}, ` +
        `FollowUps=${results.totalFollowUps}`
    );

    return NextResponse.json({
      ok: true,
      elapsedMs,
      ...results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/sales] Exception:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
