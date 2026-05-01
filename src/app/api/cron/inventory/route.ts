import { createAdminClient } from "@/lib/supabase/admin";
import { runInventoryAgent } from "@/lib/agents/inventory/run";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * Inventory Agent twice-weekly cron — Day 18
 *
 * Scheduled: 30 5 * * 0,3  (05:30 UTC, Sunday + Wednesday only)
 * Israel local time: 07:30 IST winter / 08:30 IST summer
 *
 * Runs only for tenants that have an active inventory_snapshots row
 * uploaded within the last 30 days. Older uploads are stale enough
 * that the analysis would mislead, so we skip them quietly.
 *
 * For each eligible tenant:
 *   - Run the inventory agent against the latest snapshot
 *   - Continue on individual failures (don't fail the batch)
 *
 * Idempotency: agent_runs uniqueness prevents double execution
 * if Vercel double-delivers the cron.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[cron/inventory] Unauthorized — bad or missing CRON_SECRET");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const results = {
    totalEligible: 0,
    succeeded: 0,
    failed: 0,
    noOp: 0,
    failures: [] as Array<{ tenantId: string; error: string }>,
  };

  try {
    const db = createAdminClient();

    // Find tenants with an inventory snapshot from the last 30 days
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: snapshots, error: snapshotsError } = await db
      .from("inventory_snapshots")
      .select("tenant_id")
      .eq("is_active", true)
      .gte("uploaded_at", thirtyDaysAgo);

    if (snapshotsError) {
      console.error(
        "[cron/inventory] Failed to query snapshots:",
        snapshotsError
      );
      return NextResponse.json(
        { error: snapshotsError.message },
        { status: 500 }
      );
    }

    if (!snapshots || snapshots.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No tenants with recent inventory snapshots",
        ...results,
      });
    }

    // Dedup tenant IDs (one tenant might have multiple snapshots in window)
    const uniqueTenantIds = Array.from(
      new Set(snapshots.map((s) => s.tenant_id as string))
    );

    // Filter to only active tenants
    const { data: activeTenants, error: tenantsError } = await db
      .from("tenants")
      .select("id, name")
      .in("id", uniqueTenantIds)
      .eq("is_active", true);

    if (tenantsError) {
      console.error("[cron/inventory] Failed to filter tenants:", tenantsError);
      return NextResponse.json(
        { error: tenantsError.message },
        { status: 500 }
      );
    }

    if (!activeTenants || activeTenants.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No active tenants",
        ...results,
      });
    }

    results.totalEligible = activeTenants.length;

    // Sequential processing
    for (const tenant of activeTenants) {
      try {
        const result = await runInventoryAgent(tenant.id, "scheduled");

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
          `[cron/inventory] Tenant ${tenant.id} (${tenant.name}) failed:`,
          err
        );
      }
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[cron/inventory] Done in ${elapsedMs}ms. ` +
        `Eligible=${results.totalEligible}, ` +
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
    console.error("[cron/inventory] Exception:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
