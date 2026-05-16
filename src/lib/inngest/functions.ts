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
import { sendManagerToOwner } from "@/lib/agents/manager/owner-send";
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
// Function 3 — Manager weekly cron fan-out  (Sprint 3Z, 2026-05-16)
// ─────────────────────────────────────────────────────────────
//
// Replaces the deleted Vercel cron route at /api/cron/manager.
//
// Why this exists:
//   The Vercel Hobby plan caps function duration at 60s (Node runtime).
//   runManagerAgent with thinking_budget=8000 sat right at that cap and
//   timed out 75% of the time. The fix is a combo:
//     (a) src/lib/agents/manager/run.ts reduced thinking_budget 8000→3000
//         (Anthropic call now ~20-30s reliably)
//     (b) THIS function — each eligible tenant becomes its own Inngest
//         event, giving each tenant its own 60s step budget instead of
//         all tenants sharing one cron-route execution
//
// Schedule: Sunday 08:00 IL (TZ-aware, auto-handles DST), one hour after
// Morning. Comes from CLAUDE.md §10.42 design intent (was previously
// "0 5 * * 0" UTC in vercel.json, which drifted between 07:00 IL winter
// and 08:00 IL summer — Inngest's TZ prefix fixes this).

export const weeklyManagerCron = inngest.createFunction(
  {
    id: "manager-weekly-cron",
    name: "Manager Agent — Weekly Cron",
    triggers: [{ cron: "TZ=Asia/Jerusalem 0 8 * * 0" }],
  },
  async ({ step }) => {
    // Step 1: discover eligible tenants
    //   - WhatsApp integration connected
    //   - tenants.config.owner_phone set
    const eligibleTenants = await step.run(
      "list-eligible-tenants",
      async () => {
        const db = createAdminClient();

        const { data: integrations, error: intErr } = await db
          .from("integrations")
          .select("tenant_id")
          .eq("provider", "whatsapp")
          .eq("status", "connected");

        if (intErr) {
          throw new Error(
            `integrations query failed: ${intErr.message}`
          );
        }

        const tenantIds = Array.from(
          new Set((integrations ?? []).map((r) => r.tenant_id as string))
        );
        if (tenantIds.length === 0) return [];

        const { data: tenants, error: tenantsErr } = await db
          .from("tenants")
          .select("id, config")
          .in("id", tenantIds);

        if (tenantsErr) {
          throw new Error(`tenants query failed: ${tenantsErr.message}`);
        }

        return (tenants ?? [])
          .map((t) => {
            const cfg = (t.config ?? {}) as Record<string, unknown>;
            const phone = cfg.owner_phone;
            if (typeof phone !== "string" || phone.trim().length === 0) {
              return null;
            }
            return {
              tenantId: t.id as string,
              ownerPhone: phone.trim(),
            };
          })
          .filter(
            (x): x is { tenantId: string; ownerPhone: string } => x !== null
          );
      }
    );

    if (eligibleTenants.length === 0) {
      return { tenantsTriggered: 0, note: "no eligible tenants" };
    }

    // Step 2: fan out. One event per tenant.
    // step.sendEvent is durable — if the cron handler crashes after
    // sending half the events, Inngest replays from the last checkpoint.
    await step.sendEvent(
      "trigger-tenants",
      eligibleTenants.map((t) => ({
        name: "manager/run.tenant",
        data: {
          tenantId: t.tenantId,
          ownerPhone: t.ownerPhone,
        },
      }))
    );

    return { tenantsTriggered: eligibleTenants.length };
  }
);

// ─────────────────────────────────────────────────────────────
// Function 4 — per-tenant Manager runner  (Sprint 3Z)
// ─────────────────────────────────────────────────────────────
//
// One event per tenant. sendManagerToOwner encapsulates the entire
// per-tenant flow (idempotency check → runManagerAgent → render summary
// → WhatsApp send). It does NOT throw — returns a structured outcome.
// So step.run normally completes successfully even when send is skipped
// (no_integration, outside_24h, etc.), and Inngest doesn't retry.
//
// concurrency: 5 matches Growth's limit and the Inngest Hobby tier cap.

interface ManagerRunTenantEventData {
  tenantId: string;
  ownerPhone: string;
}

export const runManagerForTenant = inngest.createFunction(
  {
    id: "manager-run-tenant",
    name: "Manager Agent — Run for Single Tenant",
    concurrency: { limit: 5 },
    triggers: [{ event: "manager/run.tenant" }],
  },
  async ({ event, step }) => {
    const data = event.data as ManagerRunTenantEventData;

    const result = await step.run(
      "execute-manager-and-send",
      async () => {
        return await sendManagerToOwner(data.tenantId, data.ownerPhone);
      }
    );

    return result;
  }
);

// ─────────────────────────────────────────────────────────────
// Registry — exported for the Inngest serve handler
// ─────────────────────────────────────────────────────────────

export const inngestFunctions = [
  weeklyGrowthCron,
  runGrowthForTenant,
  weeklyManagerCron,
  runManagerForTenant,
];
