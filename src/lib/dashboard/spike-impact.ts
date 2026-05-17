// src/lib/dashboard/spike-impact.ts
//
// Sprint 3F (2026-05-17) — Spike Impact owner-facing ROI widget.
//
// Aggregates per-tenant weekly activity into 4 headline metrics:
//   - drafts created (Spike's output)
//   - drafts approved/sent (owner sign-off rate)
//   - hot leads classified (sales surface)
//   - estimated hours saved (drafts × 2.5 min / 60)
//
// Why these 4: each is a direct fact from agent_runs/drafts/hot_leads tables
// (no derivation chains), each works for every vertical (salon/restaurant/
// retail/clinic equally), and together they tell the "Spike is earning its
// keep this week" story in 4 seconds of dashboard scan. See §10.50 (TBD)
// for the full design rationale.
//
// Mount points: /dashboard (above existing KPI strip) and /dashboard/agents
// (above category sections).

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Minutes-per-draft assumption used to estimate owner time saved.
 *
 * Sourced from a quick survey of comparable benchmarks:
 *   - 2-3 min to draft a Hebrew followup in WhatsApp manually
 *   - 1-2 min to draft a social post
 *   - 3-5 min to draft a review reply (need to re-read the review first)
 *
 * 2.5 min is the conservative middle. Lower = less impressive headline;
 * higher = looks like we're overclaiming. Adjust here ONLY based on real
 * user research, not gut feel.
 */
const MINUTES_PER_DRAFT_SAVED = 2.5;

export interface SpikeImpactStats {
  // Period
  windowStartIso: string;
  windowDays: number;

  // Activity counts (raw)
  draftsCreated: number;
  draftsApprovedOrSent: number; // owner clicked "אשר" — either pending→sent or approved→sent
  draftsRejected: number;
  hotLeadsCount: number;

  // Derived
  hoursSaved: number; // (draftsApprovedOrSent × MINUTES_PER_DRAFT_SAVED) / 60, 1-decimal

  // Display helpers
  hasMeaningfulActivity: boolean; // any drafts OR any leads → show stats; else show empty state
}

export async function getSpikeImpactStats(
  tenantId: string,
  windowDays: number = 7,
): Promise<SpikeImpactStats> {
  const db = createAdminClient();
  const windowStart = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000,
  );
  const windowStartIso = windowStart.toISOString();

  // Run both queries in parallel
  const [draftsResult, leadsResult] = await Promise.all([
    db
      .from("drafts")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .gte("created_at", windowStartIso),
    db
      .from("hot_leads")
      .select("id")
      .eq("tenant_id", tenantId)
      .gte("created_at", windowStartIso),
  ]);

  if (draftsResult.error) {
    console.error(
      "[spike-impact] drafts query failed:",
      draftsResult.error,
    );
  }
  if (leadsResult.error) {
    console.error(
      "[spike-impact] hot_leads query failed:",
      leadsResult.error,
    );
  }

  const drafts = draftsResult.data ?? [];
  const hotLeads = leadsResult.data ?? [];

  // "Approved" semantically = owner clicked the approve button.
  // In the drafts.status state machine that means status moved to 'sent'
  // (or 'approved' if we ever introduce a queued-but-not-yet-sent stage).
  // Both indicate owner sign-off, so count both.
  const draftsApprovedOrSent = drafts.filter(
    (d) => d.status === "sent" || d.status === "approved",
  ).length;
  const draftsRejected = drafts.filter(
    (d) => d.status === "rejected",
  ).length;

  // 1-decimal rounding so "0.3 hours" displays cleanly, not "0.291666..."
  const rawHoursSaved =
    (draftsApprovedOrSent * MINUTES_PER_DRAFT_SAVED) / 60;
  const hoursSaved = Math.round(rawHoursSaved * 10) / 10;

  return {
    windowStartIso,
    windowDays,
    draftsCreated: drafts.length,
    draftsApprovedOrSent,
    draftsRejected,
    hotLeadsCount: hotLeads.length,
    hoursSaved,
    hasMeaningfulActivity: drafts.length > 0 || hotLeads.length > 0,
  };
}
