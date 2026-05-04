"use server";

// src/app/dashboard/actions/manager.ts
//
// Manager agent — server actions and weekly-lock state machine.
//
// The Manager agent is unique among the 8 customer-facing agents:
// instead of a simple cooldown timer, it has a "weekly lock" model
// that ties cadence to user behavior, not just elapsed time.
//
// Lock state machine:
//   1. No reports exist → canRun=true (first run is free)
//   2. Latest report has read_at IS NULL → canRun=false, owner must
//      view the pending report first. unreadReportId is returned so UI
//      can link directly to it.
//   3. Latest report read_at IS NOT NULL:
//      - If now() < next_eligible_run_at → locked, show days remaining
//      - Else → canRun=true (lock has expired)
//
// The 7-day clock starts WHEN THE OWNER READS THE REPORT, not when it's
// created. This forces the loop "AI flags → owner reads → owner acts →
// AI runs again" instead of letting reports pile up unread.
//
// Exported:
//   - ManagerLockState  (interface)
//   - getManagerLockState()      — read current state
//   - markManagerReportRead()    — owner viewed report; lock starts now
//   - triggerManagerAgentAction() — run the agent (lock-aware)

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runManagerAgent, type ManagerRunResult } from "@/lib/agents/manager/run";
import { getActiveTenant } from "./_shared";

// ─────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────

export interface ManagerLockState {
  canRun: boolean;
  /** Reason for being unable to run (null if canRun=true). */
  reason: "unread_pending" | "weekly_lock" | null;
  /** When the next run is allowed (ISO). Null if canRun=true. */
  nextEligibleAt: string | null;
  /** Days remaining until next eligible run (rounded up). */
  daysUntilNext: number;
  /** Hours remaining if less than a day. */
  hoursUntilNext: number;
  /** ID of unread report if exists — UI links here. */
  unreadReportId: string | null;
  /** When the latest report was read (for display). */
  lastReadAt: string | null;
}

// ─────────────────────────────────────────────────────────────
// Internal: lock state computation
// ─────────────────────────────────────────────────────────────
//
// Kept as an internal helper (not exported) because callers should use
// either getManagerLockState() (for UI display) or
// triggerManagerAgentAction() (which already calls this internally).

async function getManagerLockStateForTenant(
  tenantId: string
): Promise<ManagerLockState> {
  const db = createAdminClient();

  const { data, error } = await db
    .from("manager_reports")
    .select("id, created_at, read_at, next_eligible_run_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    // No reports yet — owner can run for the first time.
    return {
      canRun: true,
      reason: null,
      nextEligibleAt: null,
      daysUntilNext: 0,
      hoursUntilNext: 0,
      unreadReportId: null,
      lastReadAt: null,
    };
  }

  const latest = data[0];

  // Case: latest report is unread → owner must view it before running again
  if (latest.read_at === null) {
    return {
      canRun: false,
      reason: "unread_pending",
      nextEligibleAt: null,
      daysUntilNext: 0,
      hoursUntilNext: 0,
      unreadReportId: latest.id as string,
      lastReadAt: null,
    };
  }

  // Case: latest report read but lock has not expired
  const nextEligible = latest.next_eligible_run_at as string | null;
  if (nextEligible) {
    const nextMs = new Date(nextEligible).getTime();
    const remainingMs = nextMs - Date.now();
    if (remainingMs > 0) {
      const totalHours = remainingMs / (60 * 60 * 1000);
      const days = Math.floor(totalHours / 24);
      const hoursWithinDay = Math.ceil(totalHours - days * 24);
      return {
        canRun: false,
        reason: "weekly_lock",
        nextEligibleAt: nextEligible,
        daysUntilNext: days,
        hoursUntilNext: hoursWithinDay,
        unreadReportId: null,
        lastReadAt: latest.read_at as string,
      };
    }
  }

  // Lock expired — owner can run again
  return {
    canRun: true,
    reason: null,
    nextEligibleAt: null,
    daysUntilNext: 0,
    hoursUntilNext: 0,
    unreadReportId: null,
    lastReadAt: latest.read_at as string,
  };
}

// ─────────────────────────────────────────────────────────────
// Public server actions
// ─────────────────────────────────────────────────────────────

/**
 * Get the current Manager lock state for the active tenant.
 * Used by the dashboard to render the Manager card with the right
 * disabled / button-text / link-to-unread state.
 */
export async function getManagerLockState(): Promise<{
  success: boolean;
  state?: ManagerLockState;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };
    const state = await getManagerLockStateForTenant(tenant.tenantId);
    return { success: true, state };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

/**
 * Mark a manager report as read by the current user.
 * This is the moment the 7-day lock starts.
 *
 * Idempotent: if already read, this is a no-op (read_at not overwritten,
 * see the .is("read_at", null) filter).
 */
export async function markManagerReportRead(
  reportId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "לא מחובר" };

    const db = createAdminClient();

    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { error } = await db
      .from("manager_reports")
      .update({
        read_at: now.toISOString(),
        read_by_user_id: user.id,
        next_eligible_run_at: sevenDaysLater.toISOString(),
      })
      .eq("id", reportId)
      .eq("tenant_id", tenant.tenantId)
      .is("read_at", null); // critical: only if currently unread (idempotency)

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

/**
 * Run the Manager agent for the current tenant.
 * Uses the WEEKLY-LOCK model, NOT the per-agent cooldown.
 * State checked via getManagerLockStateForTenant() before invoking.
 */
export async function triggerManagerAgentAction(
  windowDays = 7
): Promise<{
  success: boolean;
  result?: ManagerRunResult;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const lockState = await getManagerLockStateForTenant(tenant.tenantId);
    if (!lockState.canRun) {
      let msg: string;
      if (lockState.reason === "unread_pending") {
        msg = "יש דוח מנהל שממתין לקריאה. אנא קרא אותו לפני שמייצר חדש.";
      } else if (lockState.reason === "weekly_lock") {
        if (lockState.daysUntilNext > 0) {
          msg = `הדוח הבא יהיה זמין בעוד ${lockState.daysUntilNext} ימים.`;
        } else {
          msg = `הדוח הבא יהיה זמין בעוד ${lockState.hoursUntilNext} שעות.`;
        }
      } else {
        msg = "סוכן המנהל אינו זמין כרגע.";
      }
      return { success: false, error: msg };
    }

    const result = await runManagerAgent(tenant.tenantId, "manual", windowDays);
    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[triggerManagerAgentAction] Error:", err);
    return { success: false, error: message };
  }
}
