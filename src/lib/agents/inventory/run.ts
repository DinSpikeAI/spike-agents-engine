/**
 * Spike Engine — Inventory Agent (Day 18)
 *
 * Pipeline:
 *   1. Fetch the latest active inventory snapshot for the tenant
 *   2. Run code-side analysis (daysOfCoverage, status per product)
 *   3. Send analyzed products to Sonnet 4.6 with thinking 2K
 *   4. Parse insights + priorities + Hebrew summaries
 *   5. Update the snapshot's last_analyzed_at and last_agent_run_id
 *   6. Return InventoryAgentOutput via runAgent wrapper
 *
 * Cost: ~₪0.22/run (~3K input + 2K thinking + ~1.5K output on Sonnet 4.6)
 *
 * Status code → no_op handling:
 *   - If no snapshot exists → returns failed with Hebrew message
 *   - If snapshot has 0 products → returns no_op (clean halt)
 *   - Otherwise → succeeded
 */

import { runAgent } from "../run-agent";
import { anthropic } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { INVENTORY_AGENT_OUTPUT_SCHEMA } from "./schema";
import {
  INVENTORY_AGENT_SYSTEM_PROMPT,
  buildInventoryUserMessage,
} from "./prompt";
import { analyzeAll, type InventoryProduct } from "./csv-parser";
import type {
  InventoryAgentOutput,
  RunResult,
} from "../types";

const MODEL = "claude-sonnet-4-6" as const;
const THINKING_BUDGET = 2000;
const MAX_TOKENS = 6000; // 2K thinking + 4K output

export interface InventoryRunResult extends RunResult<InventoryAgentOutput> {
  snapshotId: string | null;
  productCount: number;
}

interface TenantContext {
  ownerName: string;
  businessName: string;
  vertical: string;
}

async function loadTenantContext(tenantId: string): Promise<TenantContext> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("tenants")
    .select("name, vertical, config")
    .eq("id", tenantId)
    .single();

  if (error || !data) {
    throw new Error(`Tenant ${tenantId} not found: ${error?.message}`);
  }

  const config = (data.config ?? {}) as Record<string, unknown>;
  const ownerName = (config.owner_name as string) ?? "בעל העסק";

  return {
    ownerName,
    businessName: (data.name as string) ?? "העסק שלי",
    vertical: (data.vertical as string) ?? "general",
  };
}

interface LatestSnapshot {
  id: string;
  uploadedAt: string;
  products: InventoryProduct[];
}

async function loadLatestSnapshot(
  tenantId: string
): Promise<LatestSnapshot | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("inventory_snapshots")
    .select("id, uploaded_at, products")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[inventory] loadLatestSnapshot error:", error);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id as string,
    uploadedAt: data.uploaded_at as string,
    products: (data.products as InventoryProduct[]) ?? [],
  };
}

export async function runInventoryAgent(
  tenantId: string,
  triggerSource: "manual" | "scheduled" | "webhook" | "admin_manual" = "manual"
): Promise<InventoryRunResult> {
  const db = createAdminClient();

  // ─── Step 1: Find the latest snapshot ─────────────────────
  const snapshot = await loadLatestSnapshot(tenantId);

  if (!snapshot) {
    // No CSV uploaded yet — can't run.
    return {
      runId: "",
      status: "failed",
      output: null,
      error:
        "אין קובץ מלאי. העלה CSV מהקופה או ממערכת המלאי שלך כדי שהסוכן יוכל לנתח.",
      costEstimateIls: 0,
      costActualIls: 0,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      isMocked: false,
      snapshotId: null,
      productCount: 0,
    };
  }

  // ─── Step 2: Code-side analysis ──────────────────────────
  const analyzed = analyzeAll(snapshot.products);

  if (analyzed.length === 0) {
    // Snapshot exists but has 0 products — clean halt
    return {
      runId: "",
      status: "no_op",
      output: null,
      error: undefined,
      costEstimateIls: 0,
      costActualIls: 0,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      isMocked: false,
      snapshotId: snapshot.id,
      productCount: 0,
    };
  }

  // ─── Step 3: Load tenant context and build prompt ────────
  const tenantCtx = await loadTenantContext(tenantId);

  const executor = async () => {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: {
        type: "enabled",
        budget_tokens: THINKING_BUDGET,
      },
      system: [
        {
          type: "text",
          text: INVENTORY_AGENT_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: [
        {
          role: "user",
          content: buildInventoryUserMessage({
            ownerName: tenantCtx.ownerName,
            businessName: tenantCtx.businessName,
            vertical: tenantCtx.vertical,
            products: analyzed,
            snapshotUploadedAt: snapshot.uploadedAt,
          }),
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: INVENTORY_AGENT_OUTPUT_SCHEMA,
        },
      },
    });

    // Extract JSON from text blocks (thinking comes first, then text)
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    const output = JSON.parse(text) as InventoryAgentOutput;

    return {
      output,
      status: "succeeded" as const,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_input_tokens:
          (response.usage as { cache_read_input_tokens?: number })
            .cache_read_input_tokens ?? 0,
        cache_creation_input_tokens:
          (response.usage as { cache_creation_input_tokens?: number })
            .cache_creation_input_tokens ?? 0,
      },
    };
  };

  // ─── Step 4: Run via runAgent (handles spend cap + telemetry) ─
  const baseResult = await runAgent<InventoryAgentOutput>(
    { tenantId, agentId: "inventory", triggerSource, model: MODEL },
    undefined,
    executor
  );

  // ─── Step 5: If success, update snapshot's last_analyzed_at ──
  if (baseResult.status === "succeeded" && baseResult.runId) {
    await db
      .from("inventory_snapshots")
      .update({
        last_analyzed_at: new Date().toISOString(),
        last_agent_run_id: baseResult.runId,
      })
      .eq("id", snapshot.id);
  }

  return {
    ...baseResult,
    snapshotId: snapshot.id,
    productCount: analyzed.length,
  };
}
