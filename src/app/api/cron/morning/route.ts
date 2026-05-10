// src/app/api/cron/morning/route.ts
//
// Sprint 3M — Daily Morning auto-send to owner via WhatsApp.
//
// Schedule: 0 4 * * *  (04:00 UTC = 07:00 IL year-round, since IL is UTC+3
//                       year-round after the 2024 DST simplification).
// Auth:     Authorization: Bearer ${CRON_SECRET}
// Runtime:  Node.js (Anthropic SDK is not Edge-compatible; same constraint
//           every other agent cron route hits).
//
// ─────────────────────────────────────────────────────────────────────
// Why this exists — the Iron Rule carve-out
// ─────────────────────────────────────────────────────────────────────
// "AI מסמן, בעלים מחליט" is a promise about CUSTOMER-FACING messages —
// the AI never speaks to a customer without the owner pressing [אשר].
// Morning's recipient is NOT a customer. It's the OWNER, receiving their
// own daily briefing about their own business. The owner approving their
// own self-summary would be circular UX.
//
// This is architecturally consistent with Watcher (writes to `alerts`)
// and Manager (writes to `manager_reports`) — both owner-facing, neither
// goes through the drafts/approval flow. Sprint 3M extends that pattern:
// Morning generates the briefing AND auto-delivers it via WhatsApp,
// because dashboards can be ignored but a phone notification is hard
// to miss for the founder of a 1-3 person business.
//
// ─────────────────────────────────────────────────────────────────────
// Per-tenant flow (executed concurrently, capped at MAX_CONCURRENT_TENANTS)
// ─────────────────────────────────────────────────────────────────────
//   1. Idempotency check: did Morning already run successfully today
//      for this tenant? If yes, skip (Vercel cron retries, manual trigger
//      same day, etc. — don't double-send).
//   2. Run runMorningAgent → MorningAgentOutput (Hebrew structured fields:
//      greeting, headline, yesterdayMetrics, thingsCompleted,
//      thingsNeedingApproval, insights, todaysSchedule, callToAction).
//   3. Render those fields into a single Hebrew WhatsApp message body
//      with WhatsApp formatting (*bold*, line breaks, emojis).
//   4. Resolve owner phone from `tenants.config->>'owner_phone'`. If
//      absent, log + skip (graceful — don't error out the whole cron).
//   5. lookupWhatsAppIntegration. If not connected → skip with reason.
//   6. wasContactedInLast24h(ownerPhone). If outside window → skip with
//      reason (Meta would drop a session message; we'd need a template
//      which is post-Meta-Business-verification paperwork).
//   7. sendWhatsAppMessage. On failure → log; on success → done.
//
// ─────────────────────────────────────────────────────────────────────
// Failure model
// ─────────────────────────────────────────────────────────────────────
// One tenant failing must NOT poison the others. Promise.allSettled per
// chunk + per-tenant try/catch. Final response is a JSON array of
// outcomes per tenant; Dean (or an external monitor) can see at a glance
// which tenants got their summary and which didn't.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMorningAgent } from "@/lib/agents/morning/run";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import {
  lookupWhatsAppIntegration,
  wasContactedInLast24h,
  mapSendErrorToHebrew,
} from "@/lib/whatsapp/helpers";
import type { MorningAgentOutput } from "@/lib/agents/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Concurrency cap. Most installs have < 50 tenants; 5-at-a-time is gentle
// on Anthropic rate limits and Meta API. Bump if/when scaled.
const MAX_CONCURRENT_TENANTS = 5;

// ─────────────────────────────────────────────────────────────────────
// Outcome type — for the response JSON + logging
// ─────────────────────────────────────────────────────────────────────

type Outcome =
  | "sent"
  | "already_ran_today"
  | "agent_no_op"
  | "agent_failed"
  | "no_owner_phone"
  | "no_integration"
  | "missing_credentials"
  | "outside_24h"
  | "send_failed"
  | "no_summary_text"
  | "uncaught_error";

interface TenantResult {
  tenantId: string;
  outcome: Outcome;
  detail?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();

  // ── Tenant discovery ────────────────────────────────────────────
  // We want tenants that satisfy ALL of:
  //   (a) have a connected WhatsApp integration
  //   (b) have owner_phone set in their config
  // Step 1: find tenant_ids with a connected integration.
  // Step 2: pull those tenants' configs.
  // Step 3: filter by owner_phone presence.
  //
  // (We don't filter on `tenants.status='active'` because that column
  // isn't documented in the schema; adding it later is a follow-up.)

  const { data: integrations, error: intErr } = await db
    .from("integrations")
    .select("tenant_id")
    .eq("provider", "whatsapp")
    .eq("status", "connected");

  if (intErr) {
    console.error("[cron/morning] integrations query failed:", intErr);
    return NextResponse.json(
      { error: "integrations_query_failed", detail: intErr.message },
      { status: 500 }
    );
  }

  const eligibleTenantIds = Array.from(
    new Set((integrations ?? []).map((r) => r.tenant_id as string))
  );
  if (eligibleTenantIds.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      reason: "no_connected_tenants",
    });
  }

  const { data: tenants, error: tenantsErr } = await db
    .from("tenants")
    .select("id, name, config")
    .in("id", eligibleTenantIds);

  if (tenantsErr) {
    console.error("[cron/morning] tenants query failed:", tenantsErr);
    return NextResponse.json(
      { error: "tenants_query_failed", detail: tenantsErr.message },
      { status: 500 }
    );
  }

  type EligibleTenant = { id: string; ownerPhone: string };
  const eligible: EligibleTenant[] = [];
  const missingPhone: string[] = [];

  for (const t of tenants ?? []) {
    const cfg = (t.config ?? {}) as Record<string, unknown>;
    const ownerPhone = cfg.owner_phone;
    if (typeof ownerPhone === "string" && ownerPhone.trim().length > 0) {
      eligible.push({ id: t.id as string, ownerPhone: ownerPhone.trim() });
    } else {
      missingPhone.push(t.id as string);
    }
  }

  if (eligible.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      reason: "no_eligible_tenants",
      missing_owner_phone: missingPhone,
    });
  }

  // ── Run per-tenant in chunks ────────────────────────────────────
  const results: TenantResult[] = [];

  // Pre-record tenants that lack owner_phone for visibility.
  for (const id of missingPhone) {
    results.push({ tenantId: id, outcome: "no_owner_phone" });
  }

  for (let i = 0; i < eligible.length; i += MAX_CONCURRENT_TENANTS) {
    const chunk = eligible.slice(i, i + MAX_CONCURRENT_TENANTS);
    const chunkResults = await Promise.allSettled(
      chunk.map((t) => processTenant(t.id, t.ownerPhone))
    );
    chunkResults.forEach((r, idx) => {
      const tenantId = chunk[idx].id;
      if (r.status === "fulfilled") {
        results.push({
          tenantId,
          outcome: r.value.outcome,
          detail: r.value.detail,
        });
      } else {
        results.push({
          tenantId,
          outcome: "uncaught_error",
          detail:
            r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    });
  }

  // ── Summary log ─────────────────────────────────────────────────
  const tally = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `[cron/morning] processed ${results.length} tenants:`,
    Object.entries(tally)
      .map(([o, n]) => `${o}=${n}`)
      .join(", ")
  );

  return NextResponse.json({
    ok: true,
    processed: results.length,
    tally,
    results,
  });
}

// ─────────────────────────────────────────────────────────────────────
// processTenant
// ─────────────────────────────────────────────────────────────────────

async function processTenant(
  tenantId: string,
  ownerPhone: string
): Promise<{ outcome: Outcome; detail?: string }> {
  const db = createAdminClient();

  // ─── Idempotency: did we already run successfully today? ────
  // "Today" is UTC midnight to UTC midnight. Cron fires at 04:00 UTC,
  // so a same-day re-fire (Vercel retry, manual click) within the same
  // UTC day means another success exists for this tenant. Skip to
  // prevent double-send to owner.
  const todayUtcStart = new Date();
  todayUtcStart.setUTCHours(0, 0, 0, 0);

  const { data: runsToday, error: runsErr } = await db
    .from("agent_runs")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("agent_id", "morning")
    .eq("status", "succeeded")
    .gte("started_at", todayUtcStart.toISOString())
    .limit(1);

  if (runsErr) {
    console.warn(
      `[cron/morning] idempotency check failed for ${tenantId}:`,
      runsErr.message
    );
    // Don't bail — proceed and accept the small risk of double-run.
    // The send step has its own gates (24h window, integration); the
    // worst case is wasted Anthropic call, not double WhatsApp.
  } else if ((runsToday ?? []).length > 0) {
    return { outcome: "already_ran_today" };
  }

  // ─── Step 1: Run the Morning agent ──────────────────────────
  let agentResult;
  try {
    agentResult = await runMorningAgent(tenantId, "scheduled");
  } catch (err) {
    return {
      outcome: "agent_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (agentResult.status === "no_op") {
    return { outcome: "agent_no_op" };
  }
  if (agentResult.status !== "succeeded" || !agentResult.output) {
    return {
      outcome: "agent_failed",
      detail: agentResult.error ?? "no_output",
    };
  }

  // ─── Step 2: Render the structured output to a WhatsApp body ─
  const messageBody = renderMorningSummary(agentResult.output);
  if (!messageBody || messageBody.trim().length === 0) {
    return { outcome: "no_summary_text" };
  }

  // ─── Step 3: Look up integration ────────────────────────────
  const integration = await lookupWhatsAppIntegration(db, tenantId);
  if (!integration.ok) {
    return {
      outcome:
        integration.reason === "not_connected"
          ? "no_integration"
          : "missing_credentials",
      detail: integration.reason,
    };
  }

  // ─── Step 4: 24h window check ───────────────────────────────
  // The owner needs to have messaged Spike's number within the last 24h
  // for the session message to be allowed. In practice a founder-grade
  // user will satisfy this most days; when they don't, we skip silently
  // (don't surface to anyone) — tomorrow's run will likely succeed.
  const within24h = await wasContactedInLast24h(db, tenantId, ownerPhone);
  if (!within24h) {
    return {
      outcome: "outside_24h",
      detail:
        "owner has not messaged spike in the last 24h; needs template message (post-Meta-verification)",
    };
  }

  // ─── Step 5: Send ───────────────────────────────────────────
  const sendResult = await sendWhatsAppMessage({
    toPhone: ownerPhone,
    messageBody,
    phoneNumberId: integration.phoneNumberId,
    accessToken: integration.accessToken,
  });

  if (!sendResult.ok) {
    console.warn(
      `[cron/morning] send failed for tenant ${tenantId}: ${sendResult.errorCategory} / ${sendResult.metaCode ?? "no-code"} / ${sendResult.errorMessage}`
    );
    return {
      outcome: "send_failed",
      detail: `${sendResult.errorCategory}: ${mapSendErrorToHebrew(sendResult)}`,
    };
  }

  return { outcome: "sent" };
}

// ─────────────────────────────────────────────────────────────────────
// renderMorningSummary
// ─────────────────────────────────────────────────────────────────────
//
// MorningAgentOutput is a structured object (per schema.ts):
//   greeting, headline, yesterdayMetrics, thingsCompleted,
//   thingsNeedingApproval, insights, todaysSchedule, callToAction
//
// We render it into a single Hebrew WhatsApp body using WhatsApp's
// inline formatting:
//   *bold* with single asterisks
//   _italic_ with single underscores
//   newlines work
//   emojis work
//
// Sections that are empty/null/zero are omitted to keep the message
// compact — owners reading on a phone don't want padding.

function renderMorningSummary(output: MorningAgentOutput): string {
  const lines: string[] = [];

  // Greeting + headline (always present per schema's required[])
  lines.push(output.greeting);
  lines.push("");
  lines.push(output.headline);

  // Yesterday metrics — render only if at least one field is non-null
  const m = output.yesterdayMetrics;
  if (m && (m.revenue !== null || m.sameWeekdayCompare !== null)) {
    lines.push("");
    lines.push("📊 *אתמול:*");
    if (m.revenue !== null) {
      const rev = `₪${m.revenue.toLocaleString("he-IL")}`;
      const compare = m.sameWeekdayCompare ? ` ${m.sameWeekdayCompare}` : "";
      lines.push(`הכנסות: ${rev}${compare}`);
    } else if (m.sameWeekdayCompare) {
      lines.push(m.sameWeekdayCompare);
    }
  }

  // Things completed
  if (output.thingsCompleted && output.thingsCompleted.length > 0) {
    lines.push("");
    lines.push("✅ *מה נעשה אתמול:*");
    for (const item of output.thingsCompleted) {
      lines.push(`• ${item}`);
    }
  }

  // Things needing approval — only if > 0
  if (output.thingsNeedingApproval && output.thingsNeedingApproval > 0) {
    lines.push("");
    const noun =
      output.thingsNeedingApproval === 1
        ? "פריט אחד ממתין"
        : `${output.thingsNeedingApproval} פריטים ממתינים`;
    lines.push(`⚠️ ${noun} לאישור`);
  }

  // Insights
  if (output.insights && output.insights.length > 0) {
    lines.push("");
    lines.push("💡 *תובנות:*");
    for (const item of output.insights) {
      lines.push(`• ${item}`);
    }
  }

  // Today's schedule
  if (output.todaysSchedule && output.todaysSchedule.length > 0) {
    lines.push("");
    lines.push("📅 *היום:*");
    for (const item of output.todaysSchedule) {
      lines.push(`• ${item}`);
    }
  }

  // Call to action — always present per schema's required[]
  lines.push("");
  lines.push(`🎯 ${output.callToAction}`);

  return lines.join("\n").trim();
}
