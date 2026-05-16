/**
 * Cleanup Cron — Sub-stage 1.5.4 + Sprint 3W cleanup fix
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
 *
 * Sprint 3W (2026-05-15): the previous version of this file appended a
 * "best-effort" insert to agent_runs with tenant_id=null. That insert
 * always failed (agent_runs.tenant_id is NOT NULL) and produced a daily
 * warning in Vercel logs. The insert is removed entirely because cleanup
 * is platform-level, not tenant-scoped — there is no meaningful tenant_id
 * to put on the row. The cleanup results live in:
 *   (a) the JSON response body (returned to the caller and visible in
 *       Vercel function logs), and
 *   (b) per-task console.log lines (also visible in Vercel logs).
 * If we later want persistent cleanup telemetry, the right move is a
 * dedicated `system_runs` table — not relaxing agent_runs constraints.
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
  // runId is used for log correlation across the 3 task console.logs and
  // is returned in the response body. Kept even after the agent_runs
  // insert removal (Sprint 3W) because it still aids debugging.
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
    console.log(
      `[cleanup ${runId.slice(0, 8)}] Expired ${result.drafts_expired} drafts`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`drafts: ${msg}`);
    console.error(`[cleanup ${runId.slice(0, 8)}] drafts expiration failed:`, err);
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
      `[cleanup ${runId.slice(0, 8)}] Found ${result.agent_runs_old_count} agent_runs older than 90 days (no action taken)`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`agent_runs: ${msg}`);
    console.error(`[cleanup ${runId.slice(0, 8)}] agent_runs count failed:`, err);
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
      `[cleanup ${runId.slice(0, 8)}] Deleted ${result.idempotency_keys_deleted} expired idempotency_keys`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`idempotency_keys: ${msg}`);
    console.error(
      `[cleanup ${runId.slice(0, 8)}] idempotency_keys deletion failed:`,
      err
    );
  }

  // Sprint 3W: previously this block tried to insert into agent_runs with
  // tenant_id=null and always failed silently (NOT NULL constraint). The
  // insert was removed because cleanup is internal/platform-scope, not
  // tenant-scope. Results are returned in the response body + console.log
  // above. If durable cleanup telemetry is needed later, build a separate
  // system_runs table rather than relaxing agent_runs constraints.

  const finishedAt = new Date().toISOString();

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
