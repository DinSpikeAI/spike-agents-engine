"use server";

// src/app/dashboard/actions/leads.ts
//
// Server actions for the Hot Leads board at /dashboard/leads.
//
// Hot Leads are populated by the Hot Leads agent (real-time webhook +
// daily recovery cron). The board shows leads classified as
// cold/warm/hot/burning, ordered by received_at desc.
//
// Status flow:
//   classified  → just classified by the agent (default state)
//   contacted   → owner clicked "I reached out"
//   dismissed   → owner clicked "not relevant"
//
// We list status='new' OR 'classified' to be tolerant — older rows used
// 'new' before the migration introduced 'classified'.
//
// Exported:
//   - ClassifiedLead (interface)
//   - listClassifiedLeads()
//   - markLeadContacted(leadId)
//   - dismissLead(leadId, reason?)

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadBucket } from "@/lib/agents/types";
import { getActiveTenant } from "./_shared";

export interface ClassifiedLead {
  id: string;
  source: string;
  source_handle: string | null;
  display_name: string | null;
  raw_message: string;
  received_at: string;
  bucket: LeadBucket | null;
  reason: string | null;
  suggested_action: string | null;
  status: string;
  contacted_at: string | null;
  dismissed_at: string | null;
  score_features: Record<string, unknown>;
  created_at: string;
}

/**
 * List leads for the Hot Leads board.
 * Returns up to 100 most-recent leads in status 'new' or 'classified'.
 * Older rows had 'new' before the schema added 'classified'; we accept
 * both for backward compat.
 */
export async function listClassifiedLeads(): Promise<{
  success: boolean;
  leads?: ClassifiedLead[];
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { data, error } = await db
      .from("hot_leads")
      .select(
        "id, source, source_handle, display_name, raw_message, received_at, bucket, reason, suggested_action, status, contacted_at, dismissed_at, score_features, created_at"
      )
      .eq("tenant_id", tenant.tenantId)
      .in("status", ["new", "classified"])
      .order("received_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[listClassifiedLeads] DB error:", error);
      return { success: false, error: error.message };
    }
    return { success: true, leads: (data as ClassifiedLead[]) ?? [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

/**
 * Mark a lead as contacted. Owner has reached out (or sent the
 * approved Sales QR draft). updated_at is bumped so dashboards can
 * sort by recency of state change.
 */
export async function markLeadContacted(
  leadId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "לא מחובר" };

    const db = createAdminClient();
    const { error } = await db
      .from("hot_leads")
      .update({
        status: "contacted",
        contacted_at: new Date().toISOString(),
        contacted_by_user_id: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId)
      .eq("tenant_id", tenant.tenantId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

/**
 * Dismiss a lead as not relevant. Optional reason kept for analytics —
 * later we can use these to tune the Hot Leads classifier.
 */
export async function dismissLead(
  leadId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { error } = await db
      .from("hot_leads")
      .update({
        status: "dismissed",
        dismissed_at: new Date().toISOString(),
        dismissed_reason: reason ?? "owner dismissed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId)
      .eq("tenant_id", tenant.tenantId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}
