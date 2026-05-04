"use server";

// src/app/dashboard/actions/drafts.ts
//
// Server actions for the Approvals inbox at /dashboard/approvals.
//
// Drafts are the core of "AI מסמן, בעלים מחליט" — every customer-facing
// agent that produces user-visible content writes a `drafts` row, and
// the owner approves or rejects via the inbox.
//
// Status values:
//   - pending   → waiting for owner action (visible in inbox)
//   - approved  → owner clicked Approve (ready to send / already sent)
//   - rejected  → owner clicked Reject (with optional reason)
//   - expired   → cleanup cron set this when expires_at passed
//
// The inbox shows pending AND rejected (rejected stay visible so owner
// can see what was bounced and why; cleanup cron eventually removes
// them when expires_at fires).
//
// Exported:
//   - PendingDraft (interface)
//   - listPendingDrafts()
//   - approveDraft(draftId)
//   - rejectDraft(draftId, reason?)

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./_shared";

export interface PendingDraft {
  id: string;
  agent_id: string;
  type: string;
  content: Record<string, unknown>;
  status: string;
  action_type: string | null;
  defamation_risk: "low" | "medium" | "high" | null;
  defamation_flagged_phrases: string[] | null;
  contains_pii: boolean;
  recipient_label: string | null;
  context: Record<string, unknown> | null;
  external_target: Record<string, unknown> | null;
  rejection_reason: string | null;
  created_at: string;
  expires_at: string;
}

/**
 * List drafts for the active tenant's inbox.
 * Returns up to 50 most-recent pending OR rejected drafts.
 * Ordered desc by created_at so the freshest items are at the top.
 */
export async function listPendingDrafts(): Promise<{
  success: boolean;
  drafts?: PendingDraft[];
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { data, error } = await db
      .from("drafts")
      .select(
        "id, agent_id, type, content, status, action_type, defamation_risk, defamation_flagged_phrases, contains_pii, recipient_label, context, external_target, rejection_reason, created_at, expires_at"
      )
      .eq("tenant_id", tenant.tenantId)
      .in("status", ["pending", "rejected"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[listPendingDrafts] DB error:", error);
      return { success: false, error: error.message };
    }
    return { success: true, drafts: (data as PendingDraft[]) ?? [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

/**
 * Owner approves a draft. Records who approved and when.
 * Tenant scope is enforced via the WHERE clause — no cross-tenant escape.
 */
export async function approveDraft(
  draftId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "לא מחובר" };

    const db = createAdminClient();
    const { error } = await db
      .from("drafts")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .eq("tenant_id", tenant.tenantId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

/**
 * Owner rejects a draft, optionally with a reason.
 * Rejected drafts stay in the inbox until cleanup cron expires them.
 */
export async function rejectDraft(
  draftId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { error } = await db
      .from("drafts")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
        rejection_reason: reason ?? "owner rejected",
      })
      .eq("id", draftId)
      .eq("tenant_id", tenant.tenantId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}
