// src/app/admin/actions.ts
//
// Day 11C — Admin server actions.
//
// Two actions, both gated by requireAdmin():
//
//   1. triggerManagerForTenantAsAdmin(tenantId)
//      Run the Manager Agent for ANY tenant, bypassing the 7-day lock.
//      Used when Dean wants to debug a customer or generate a fresh
//      report on demand. The spend cap STILL applies — admins cannot
//      blow up a tenant's budget. trigger_source is recorded as
//      'admin_manual' for audit.
//
//   2. setTenantActive(tenantId, isActive)
//      Flip the tenants.is_active flag. When FALSE, ALL agent runs for
//      that tenant are blocked at the assertWithinSpendCap layer with
//      a Hebrew "החשבון מושהה" message. Used to halt abusive or
//      bug-prone tenants instantly without touching their data.
//
// Both actions revalidate /admin so the UI reflects the new state.

"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  runManagerAgent,
  type ManagerRunResult,
} from "@/lib/agents/manager/run";

// ─────────────────────────────────────────────────────────────
// 1. Trigger Manager for tenant (bypass weekly lock)
// ─────────────────────────────────────────────────────────────

export async function triggerManagerForTenantAsAdmin(
  tenantId: string,
  windowDays = 7
): Promise<{
  success: boolean;
  result?: ManagerRunResult;
  error?: string;
}> {
  // Auth: non-admin gets redirected, returns User if admin
  await requireAdmin();

  if (!tenantId || typeof tenantId !== "string") {
    return { success: false, error: "tenant_id חסר או לא תקין" };
  }

  try {
    // NOTE: We deliberately skip getManagerLockStateForTenant().
    // The whole point of admin trigger is to bypass the 7-day lock
    // for support / debugging purposes.
    //
    // The spend cap inside runManagerAgent itself still applies, so
    // an admin trigger CANNOT blow up the tenant's budget.
    const result = await runManagerAgent(tenantId, "admin_manual", windowDays);

    // Refresh the admin dashboard so audit log + health score update
    revalidatePath("/admin");

    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error(
      `[admin/actions] triggerManagerForTenantAsAdmin failed for ${tenantId.slice(0, 8)}:`,
      err
    );
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────
// 2. Toggle tenant active state
// ─────────────────────────────────────────────────────────────

export async function setTenantActive(
  tenantId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

  if (!tenantId || typeof tenantId !== "string") {
    return { success: false, error: "tenant_id חסר או לא תקין" };
  }

  if (typeof isActive !== "boolean") {
    return { success: false, error: "is_active חייב להיות true או false" };
  }

  try {
    const db = createAdminClient();
    const { error } = await db
      .from("tenants")
      .update({ is_active: isActive })
      .eq("id", tenantId);

    if (error) {
      console.error(
        `[admin/actions] setTenantActive failed for ${tenantId.slice(0, 8)}:`,
        error
      );
      return { success: false, error: error.message };
    }

    revalidatePath("/admin");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error(
      `[admin/actions] setTenantActive exception for ${tenantId.slice(0, 8)}:`,
      err
    );
    return { success: false, error: message };
  }
}
