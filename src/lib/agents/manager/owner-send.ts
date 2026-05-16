// src/lib/agents/manager/owner-send.ts
//
// Sprint 3Z (2026-05-16) — extracted from the deleted Vercel cron route
// (src/app/api/cron/manager/route.ts) to support the Inngest async pattern.
//
// runManagerForTenant (in src/lib/inngest/functions.ts) listens for the
// "manager/run.tenant" event and calls `sendManagerToOwner` here. Each
// Inngest event gives its own 60s step budget rather than sharing a single
// cron-route execution across all tenants.
//
// ─────────────────────────────────────────────────────────────────────
// Iron Rule carve-out
// ─────────────────────────────────────────────────────────────────────
// Manager's recipient is the OWNER, not a customer. Weekly digest is a
// self-reflection report about the owner's own business — requiring the
// owner to press [אשר] on their own self-report would be circular UX.
// Same carve-out as Morning (§15.25) and Watcher (§3X).
//
// ─────────────────────────────────────────────────────────────────────
// Per-tenant flow
// ─────────────────────────────────────────────────────────────────────
//   1. Idempotency: did Manager already run successfully THIS WEEK
//      (since Sunday 00:00 UTC) for this tenant? If yes, skip.
//   2. Run runManagerAgent → ManagerAgentOutput (5 sections + recommendation).
//      Manager has its own spend cap check internally — if cap blocks, the
//      result.status will be 'failed' with a Hebrew error.
//   3. Render to a compact Hebrew WhatsApp body — teaser, not full report.
//      Owner clicks the link to see the full report on /dashboard/reports.
//   4. lookupWhatsAppIntegration. If not connected → skip.
//   5. wasContactedInLast24h(ownerPhone). If outside window → skip.
//      (Same Meta session-window constraint as Morning.)
//   6. sendWhatsAppMessage. On failure → log; on success → done.
//
// Does NOT throw — returns a structured outcome for observability.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { runManagerAgent } from "@/lib/agents/manager/run";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import {
  lookupWhatsAppIntegration,
  wasContactedInLast24h,
  mapSendErrorToHebrew,
} from "@/lib/whatsapp/helpers";
import type { ManagerAgentOutput } from "@/lib/agents/types";

export type ManagerOwnerSendOutcome =
  | "sent"
  | "already_ran_this_week"
  | "agent_failed"
  | "no_integration"
  | "missing_credentials"
  | "outside_24h"
  | "send_failed"
  | "no_summary_text";

export interface ManagerOwnerSendResult {
  outcome: ManagerOwnerSendOutcome;
  detail?: string;
}

// ─────────────────────────────────────────────────────────────────────
// sendManagerToOwner
// ─────────────────────────────────────────────────────────────────────

export async function sendManagerToOwner(
  tenantId: string,
  ownerPhone: string
): Promise<ManagerOwnerSendResult> {
  const db = createAdminClient();

  // ─── Idempotency: did Manager already run successfully this week? ───
  // "This week" = since Sunday 00:00 UTC of the current calendar week.
  // JS Date.getUTCDay() returns 0=Sunday, so subtracting it from the
  // current UTC date gives the most recent Sunday at midnight UTC.
  // The cron fires Sunday morning IL, so weekStart is a few hours earlier;
  // any Manager run since then = already executed this week → skip.
  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());

  const { data: runsThisWeek, error: runsErr } = await db
    .from("agent_runs")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("agent_id", "manager")
    .eq("status", "succeeded")
    .gte("started_at", weekStart.toISOString())
    .limit(1);

  if (runsErr) {
    console.warn(
      `[manager/owner-send] idempotency check failed for ${tenantId}:`,
      runsErr.message
    );
    // Don't bail — proceed and accept the small risk of double-run.
    // The send step has its own gates; worst case is wasted Anthropic
    // call (Manager has spend cap, so capped), not double WhatsApp.
  } else if ((runsThisWeek ?? []).length > 0) {
    return { outcome: "already_ran_this_week" };
  }

  // ─── Step 1: Run the Manager agent ──────────────────────────
  // windowDays=7 — analyze the last week of activity (matches the
  // weekly cadence of this digest). Manager has internal spend-cap
  // protection; if cap exceeded it returns status='failed' with a
  // Hebrew error in result.error.
  let agentResult;
  try {
    agentResult = await runManagerAgent(tenantId, "scheduled", 7);
  } catch (err) {
    return {
      outcome: "agent_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (agentResult.status !== "succeeded" || !agentResult.output) {
    return {
      outcome: "agent_failed",
      detail: agentResult.error ?? "no_output",
    };
  }

  // ─── Step 2: Render the structured output to a WhatsApp body ─
  const messageBody = renderManagerSummary(agentResult.output);
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
  // Same Meta session-window constraint as Morning (§10.39).
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
      `[manager/owner-send] send failed for tenant ${tenantId}: ${sendResult.errorCategory} / ${sendResult.metaCode ?? "no-code"} / ${sendResult.errorMessage}`
    );
    return {
      outcome: "send_failed",
      detail: `${sendResult.errorCategory}: ${mapSendErrorToHebrew(sendResult)}`,
    };
  }

  return { outcome: "sent" };
}

// ─────────────────────────────────────────────────────────────────────
// renderManagerSummary
// ─────────────────────────────────────────────────────────────────────
//
// ManagerAgentOutput is rich — 5 sections + recommendation + flags.
// A weekly WhatsApp digest should be a TEASER, not a full report. We
// render the most actionable signals + the recommendation, and link to
// the dashboard for the full breakdown.
//
// WhatsApp formatting: *bold* with single asterisks, newlines, emojis.
// Sections that are empty/zero are omitted to keep the message compact.

export function renderManagerSummary(output: ManagerAgentOutput): string {
  const lines: string[] = [];

  // Header + agent's own one-line summary (always present per schema's required[])
  lines.push("🗓 Spike — דוח שבועי");
  lines.push("");
  lines.push(output.summary);

  // Status summary — succeeded vs failed
  const { totalSucceeded, totalFailed } = output.status_summary;
  if (totalSucceeded > 0 || totalFailed > 0) {
    lines.push("");
    lines.push("📊 *סיכום שבועי:*");
    lines.push(`✅ הצליחו: ${totalSucceeded}    ❌ נכשלו: ${totalFailed}`);
  }

  // Growth metrics — render only if at least one metric is non-null
  const g = output.growth_metrics;
  const metricLines: string[] = [];
  if (g.approvalRate !== null) {
    const pct = Math.round(g.approvalRate * 100);
    metricLines.push(`שיעור אישור: ${pct}%`);
  }
  if (g.medianTimeToApprovalMinutes !== null) {
    metricLines.push(
      `זמן חציוני לאישור: ${g.medianTimeToApprovalMinutes} דק'`
    );
  }
  if (metricLines.length > 0) {
    lines.push("");
    lines.push("📈 *מדדים:*");
    for (const m of metricLines) lines.push(m);
  }

  // Stale alerts — only if > 0
  if (g.stalePendingDraftsCount > 0 || g.staleBlazingLeadsCount > 0) {
    lines.push("");
    if (g.stalePendingDraftsCount > 0) {
      const noun =
        g.stalePendingDraftsCount === 1
          ? "טיוטה ממתינה"
          : `${g.stalePendingDraftsCount} טיוטות ממתינות`;
      lines.push(`⚠️ ${noun} מעל 24 שעות`);
    }
    if (g.staleBlazingLeadsCount > 0) {
      const noun =
        g.staleBlazingLeadsCount === 1
          ? "ליד בוער"
          : `${g.staleBlazingLeadsCount} לידים בוערים`;
      lines.push(`🔥 ${noun} לא נענו 24h+`);
    }
  }

  // Critical issues — only if hasCriticalIssues true.
  // Pull up to 2 critical items from quality_findings and system_health
  // each, so the WhatsApp body doesn't explode.
  if (output.hasCriticalIssues) {
    const critQuality = output.quality_findings.findings
      .filter((f) => f.severity === "critical")
      .slice(0, 2);
    const critHealth = output.system_health.signals
      .filter((s) => s.severity === "critical")
      .slice(0, 2);

    if (critQuality.length > 0 || critHealth.length > 0) {
      lines.push("");
      lines.push("🚨 *נדרשת תשומת לב:*");
      for (const f of critQuality) {
        lines.push(`• ${f.reasonHe}`);
      }
      for (const s of critHealth) {
        lines.push(`• ${s.descriptionHe}`);
      }
    }
  }

  // Recommendation — always present per schema's required[], but skip
  // rendering when the agent decided no action is needed.
  const r = output.recommendation;
  if (r.type !== "no_action_needed") {
    lines.push("");
    lines.push(`💡 *המלצה:* ${r.titleHe}`);
    lines.push(r.suggestedActionHe);
  }

  // Footer — call to dashboard for the full report
  lines.push("");
  lines.push("דוח מלא: app.spikeai.co.il/dashboard/reports");

  return lines.join("\n").trim();
}
