// src/lib/inngest/functions.ts
//
// Inngest function definitions for Spike Engine.
//
// Two functions for the Growth Agent:
//
//   1. weeklyGrowthCron — fires every Sunday 07:00 IST. Lists active
//      tenants and fans out one event per tenant.
//
//   2. runGrowthForTenant — listens for "growth/run.tenant" events.
//      Each event triggers ONE Growth run for ONE tenant. Concurrency
//      is capped at 5 to match the Inngest Hobby tier limit and to
//      stay within Anthropic rate limits.
//
// API SHAPE (Inngest SDK v4):
//   createFunction takes 2 args. The trigger lives INSIDE the config
//   object as `triggers: [...]` (array, even for a single trigger).
//   This is a breaking change from v3 where the trigger was the 2nd
//   positional argument. See:
//   https://www.inngest.com/docs/reference/typescript/v4/migrations/v3-to-v4
//
// Why fan-out instead of a single big function?
//   - Per-tenant isolation: a failure in one tenant's run doesn't block
//     the others.
//   - Inngest steps are durable: if a tenant run fails mid-way, Inngest
//     retries that step without re-running successful tenants.
//   - Easy on-demand re-use: the on-demand button server action sends
//     the same "growth/run.tenant" event with trigger="on_demand".
//
// Idempotency:
//   runGrowthAgent (in src/lib/agents/growth/run.ts) catches its own
//   errors and updates the growth_runs row to status="failed" before
//   returning. It does NOT throw. So Inngest sees a successful step
//   completion, no retry, no duplicate growth_runs rows. Fatal errors
//   (e.g. tenant not found before the row is opened) DO throw, and
//   Inngest retries up to its default of 4 attempts — at which point
//   we'd want to investigate, not silently swallow.

import "server-only";
import { inngest } from "./client";
import { runGrowthAgent } from "@/lib/agents/growth/run";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GrowthRunTrigger } from "@/lib/agents/growth/types";

// ─────────────────────────────────────────────────────────────
// Function 1 — weekly cron fan-out
// ─────────────────────────────────────────────────────────────

export const weeklyGrowthCron = inngest.createFunction(
  {
    id: "growth-weekly-cron",
    name: "Growth Agent — Weekly Cron",
    // Sunday 07:00 Israel time. Inngest supports the TZ= prefix for
    // timezone-aware cron schedules. DST is handled automatically.
    triggers: [{ cron: "TZ=Asia/Jerusalem 0 7 * * 0" }],
  },
  async ({ step }) => {
    // Step 1: list all active tenants.
    // We use a step.run wrapper so Inngest checkpoints the result.
    // If the fan-out step fails, we don't re-query the tenants list.
    const tenantIds = await step.run("list-active-tenants", async () => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("tenants")
        .select("id")
        .eq("is_active", true);

      if (error) {
        throw new Error(`Failed to list active tenants: ${error.message}`);
      }

      return (data ?? []).map((t) => t.id as string);
    });

    if (tenantIds.length === 0) {
      return { tenantsTriggered: 0, note: "no active tenants" };
    }

    // Step 2: fan out. One event per tenant.
    // step.sendEvent is durable — if the cron handler crashes after
    // sending half the events, Inngest replays from the last checkpoint.
    await step.sendEvent(
      "trigger-tenants",
      tenantIds.map((tenantId: string) => ({
        name: "growth/run.tenant",
        data: {
          tenantId,
          trigger: "cron" satisfies GrowthRunTrigger,
        },
      }))
    );

    return { tenantsTriggered: tenantIds.length };
  }
);

// ─────────────────────────────────────────────────────────────
// Function 2 — per-tenant Growth runner
// ─────────────────────────────────────────────────────────────

interface GrowthRunTenantEventData {
  tenantId: string;
  trigger: GrowthRunTrigger;
  /** Set when triggered via the on-demand button (null for cron) */
  triggeredBy?: string | null;
}

export const runGrowthForTenant = inngest.createFunction(
  {
    id: "growth-run-tenant",
    name: "Growth Agent — Run for Single Tenant",
    // Inngest Hobby tier allows max 5 concurrent steps. Capping here
    // prevents a fan-out of 50 tenants from queueing past the limit.
    concurrency: { limit: 5 },
    triggers: [{ event: "growth/run.tenant" }],
  },
  async ({ event, step }) => {
    const data = event.data as GrowthRunTenantEventData;

    // The whole Growth pipeline runs in one step. runGrowthAgent has
    // its own internal error handling — it returns a result (with
    // status='failed') rather than throwing. So this step.run normally
    // completes successfully even when the Growth pipeline reports
    // failure, and Inngest doesn't retry.
    //
    // If something OUTSIDE runGrowthAgent's catch (e.g., a transient
    // network error reaching Supabase to insert the initial run row)
    // throws here, Inngest retries up to 4 times — a healthy backstop
    // for transient infrastructure issues.
    const result = await step.run("execute-growth-agent", async () => {
      return await runGrowthAgent({
        tenantId: data.tenantId,
        trigger: data.trigger,
        triggeredBy: data.triggeredBy ?? null,
      });
    });

    return result;
  }
);

// ─────────────────────────────────────────────────────────────
// Registry — exported for the Inngest serve handler
// ─────────────────────────────────────────────────────────────

export const inngestFunctions = [weeklyGrowthCron, runGrowthForTenant];
