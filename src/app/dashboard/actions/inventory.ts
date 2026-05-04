"use server";

// src/app/dashboard/actions/inventory.ts
//
// Inventory-specific server actions. Distinct from agent-triggers.ts
// because Inventory has a richer surface than the other agents:
//
//   - uploadInventoryCsv()         — parse + store a CSV (no LLM)
//   - getLatestInventorySnapshot() — read latest uploaded snapshot
//   - getLatestInventoryAnalysis() — read latest agent_runs.output for inventory
//
// The agent trigger (triggerInventoryAgentAction) lives in
// agent-triggers.ts alongside the other 7 trigger functions for symmetry.
//
// Workflow:
//   1. Owner uploads CSV → uploadInventoryCsv() saves a new snapshot row
//   2. Owner clicks "Analyze" → triggerInventoryAgentAction() runs the
//      agent against the latest active snapshot
//   3. Inventory page reads getLatestInventorySnapshot() (the file) and
//      getLatestInventoryAnalysis() (the agent's output) to render

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseInventoryCsv,
  InventoryParseError,
  type InventoryProduct,
} from "@/lib/agents/inventory/csv-parser";
import { getActiveTenant } from "./_shared";

// ═════════════════════════════════════════════════════════════
// CSV upload
// ═════════════════════════════════════════════════════════════

export interface UploadInventoryResult {
  success: boolean;
  snapshotId?: string;
  productCount?: number;
  warnings?: string[];
  error?: string;
}

/**
 * Upload + parse a CSV file. Saves the parsed products as a new
 * inventory_snapshots row. Does NOT run the agent — call
 * triggerInventoryAgentAction() afterward to analyze.
 *
 * @param csvText  — raw CSV text content
 * @param filename — original filename (for display)
 */
export async function uploadInventoryCsv(
  csvText: string,
  filename: string
): Promise<UploadInventoryResult> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "לא מחובר" };

    // Parse the CSV
    let parsed;
    try {
      parsed = parseInventoryCsv(csvText);
    } catch (err) {
      if (err instanceof InventoryParseError) {
        return { success: false, error: err.messageHe };
      }
      throw err;
    }

    // Persist as a new snapshot
    const db = createAdminClient();
    const { data, error } = await db
      .from("inventory_snapshots")
      .insert({
        tenant_id: tenant.tenantId,
        uploaded_by: user.id,
        source_filename: filename,
        source_format: "csv",
        row_count: parsed.rowCount,
        column_mapping: parsed.columnMapping,
        products: parsed.products,
        parse_warnings:
          parsed.warnings.length > 0 ? parsed.warnings : null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[uploadInventoryCsv] DB error:", error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      snapshotId: data.id as string,
      productCount: parsed.rowCount,
      warnings: parsed.warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    console.error("[uploadInventoryCsv] Error:", err);
    return { success: false, error: message };
  }
}

// ═════════════════════════════════════════════════════════════
// Snapshot + analysis queries
// ═════════════════════════════════════════════════════════════

export interface InventorySnapshotRow {
  id: string;
  source_filename: string;
  row_count: number;
  uploaded_at: string;
  last_analyzed_at: string | null;
  last_agent_run_id: string | null;
  products: InventoryProduct[];
  parse_warnings: string[] | null;
}

/**
 * Get the most recent active snapshot for the current tenant.
 * Returns null if no upload has been made yet.
 *
 * "Active" means is_active=true. When a new CSV is uploaded, the
 * previous snapshot stays in the table for history but its is_active
 * flag flips to false (handled by an Inventory upload trigger / the
 * agent run that analyzes the new one — depends on schema version).
 */
export async function getLatestInventorySnapshot(): Promise<{
  success: boolean;
  snapshot?: InventorySnapshotRow | null;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { data, error } = await db
      .from("inventory_snapshots")
      .select(
        "id, source_filename, row_count, uploaded_at, last_analyzed_at, last_agent_run_id, products, parse_warnings"
      )
      .eq("tenant_id", tenant.tenantId)
      .eq("is_active", true)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[getLatestInventorySnapshot] DB error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, snapshot: (data as InventorySnapshotRow) ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}

/**
 * Get the latest agent_runs row for the current tenant's inventory agent.
 * Returns the output (the analyzed inventory) if it exists.
 *
 * This is intentionally separate from getLatestInventorySnapshot because
 * a tenant can upload a snapshot but not yet have run the agent on it
 * — in which case the snapshot exists but the analysis does not.
 */
export async function getLatestInventoryAnalysis(): Promise<{
  success: boolean;
  analysis?: Record<string, unknown> | null;
  analyzedAt?: string | null;
  isMocked?: boolean;
  error?: string;
}> {
  try {
    const tenant = await getActiveTenant();
    if ("error" in tenant) return { success: false, error: tenant.error };

    const db = createAdminClient();
    const { data, error } = await db
      .from("agent_runs")
      .select("output, finished_at, is_mocked")
      .eq("tenant_id", tenant.tenantId)
      .eq("agent_id", "inventory")
      .eq("status", "succeeded")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[getLatestInventoryAnalysis] DB error:", error);
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: true, analysis: null, analyzedAt: null };
    }

    return {
      success: true,
      analysis: data.output as Record<string, unknown>,
      analyzedAt: data.finished_at as string,
      isMocked: data.is_mocked as boolean,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return { success: false, error: message };
  }
}
