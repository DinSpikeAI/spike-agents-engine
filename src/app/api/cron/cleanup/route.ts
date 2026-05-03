/**
 * Cleanup Cron — Sub-stage 1.5.4
 *
 * The 9th agent ("cleanup") finally implemented. Internal-only — never
 * appears in user UI, never creates drafts, never calls LLM.
 *
 * Pipeline (3 best-effort cleanup tasks, each in its own try/catch):
 *   1. Expire pending drafts: UPDATE drafts SET status='expired'
 *      WHERE status='pending' AND expires_at < NOW().
 *      Affects all tenants in one pass.
 *   2. Count agent_runs older than 90 days (count-only — no archive yet).
 *      Future sub-stage may add archival.
 *   3. Delete idempotency_keys past their own expires_at column.
 *
 * Each task runs independently — failure in one does not stop the others.
 * Returns HTTP 200 with detailed JSON breakdown so Vercel doesn't retry
 * (cleanup is daily; missing one day is fine).
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}. Open in dev (unset).
 *
 * Schedule: 0 0 * * * UTC (~03:00 IL summer / ~02:00 IL winter).
 * Pre-business-hours so any temporarily-incorrect 'expired' status
 * doesn't hide drafts owners are actively working on.
 *
 * NOTE: drafts.status='expired' assumes the column accepts that value.
 *  - If status is text → works immediately.
 *  - If status is an enum → requires migration 021_drafts_expired_status.sql first.
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CleanupResult {
  drafts_expired: number;
  agent_runs_old_count: number;
  idempotency_keys_deleted: number;
  errors: string[];
}

export async function GET(req: NextRequest) {
  // ─── Auth ──────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = createAdminClient();
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const result: CleanupResult = {
    drafts_expired: 0,
    agent_runs_old_count: 0,
    idempotency_keys_deleted: 0,
    errors: [],
  };

  // ─── Task 1: Expire pending drafts past their expires_at ──
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await db
      .from("drafts")
      .update({ status: "expired" })
      .eq("status", "pending")
      .lt("expires_at", nowIso)
      .select("id");

    if (error) throw error;
    result.drafts_expired = data?.length ?? 0;
    console.log(`[cleanup] Expired ${result.drafts_expired} drafts`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`drafts: ${msg}`);
    console.error("[cleanup] drafts expiration failed:", err);
  }

  // ─── Task 2: Count agent_runs older than 90 days ──────────
  // Count-only in 1.5.4. Future sub-stage may add archival/deletion.
  try {
    const ninetyDaysAgo = new Date(
      Date.now() - 90 * 24 * 60 * 60 * 1000
    ).toISOString();
    const { count, error } = await db
      .from("agent_runs")
      .select("*", { count: "exact", head: true })
      .lt("finished_at", ninetyDaysAgo);

    if (error) throw error;
    result.agent_runs_old_count = count ?? 0;
    console.log(
      `[cleanup] Found ${result.agent_runs_old_count} agent_runs older than 90 days (no action taken)`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`agent_runs: ${msg}`);
    console.error("[cleanup] agent_runs count failed:", err);
  }

  // ─── Task 3: Delete expired idempotency_keys ──────────────
  // Uses the table's own expires_at column (timestamp with time zone)
  // — not an arbitrary 7-day window. The webhook handlers set
  // expires_at when inserting; we just honor it here.
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await db
      .from("idempotency_keys")
      .delete()
      .lt("expires_at", nowIso)
      .select("key");

    if (error) throw error;
    result.idempotency_keys_deleted = data?.length ?? 0;
    console.log(
      `[cleanup] Deleted ${result.idempotency_keys_deleted} expired idempotency_keys`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`idempotency_keys: ${msg}`);
    console.error("[cleanup] idempotency_keys deletion failed:", err);
  }

  // ─── Best-effort log to agent_runs ────────────────────────
  // tenant_id=null because cleanup is platform-wide, not tenant-scoped.
  // If schema requires NOT NULL, this insert fails silently and the
  // cron still returns 200 with the cleanup counts in the body.
  const finishedAt = new Date().toISOString();
  const overallStatus = result.errors.length === 3 ? "failed" : "succeeded";

  try {
    const { error } = await db.from("agent_runs").insert({
      id: runId,
      tenant_id: null,
      agent_id: "cleanup",
      status: overallStatus,
      started_at: startedAt,
      finished_at: finishedAt,
      trigger_source: "scheduled",
      model_used: null,
      thinking_used: false,
      cost_estimate_ils: 0,
      cost_actual_ils: 0,
      output: result as object,
      error_message:
        result.errors.length > 0 ? result.errors.join("; ") : null,
      is_mocked: false,
    });

    if (error) {
      console.warn(
        "[cleanup] Could not log to agent_runs (likely tenant_id NOT NULL constraint or RLS):",
        error.message
      );
    }
  } catch (err) {
    console.warn("[cleanup] agent_runs insert exception:", err);
  }

  // Always return 200 — partial failures are acceptable for cleanup.
  // Non-200 would trigger Vercel cron retry, which we don't want.
  return NextResponse.json({
    ok: true,
    runId,
    startedAt,
    finishedAt,
    ...result,
  });
}
