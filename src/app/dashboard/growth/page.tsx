// src/app/dashboard/growth/page.tsx
//
// Sub-stage 1.15 — Sprint 2 Batch 2B
// The /dashboard/growth route — main entry for the Growth Agent UI.
//
// Server component, edge runtime, dynamic rendering. Auth/onboarding
// handled by requireOnboarded — which also pre-fetches user, tenantConfig,
// and tenantName so we don't need a second supabase.auth.getUser call
// (perf change from sub-stage 1.14.3).
//
// Data fetched in parallel:
//   - listPendingGrowthCandidates → main list, sorted by priority DESC
//   - getGrowthRoi               → 30-day ROI snapshot for the strip
//   - listPendingDrafts          → only used for the sidebar's "דורש
//                                   אישור" badge count (cross-cutting,
//                                   not Growth-specific)
//
// Tier comes from tenantConfig.tier (Solo/Pro/Chain). The on-demand
// trigger button is gated to Pro/Chain. requireOnboarded gives us
// tenantConfig as Record<string, unknown>, so we narrow each field
// with `typeof === "string"` (mirrors the pattern in approvals/leads).

import { isAdminEmail } from "@/lib/admin/auth";
import { requireOnboarded } from "@/lib/auth/require-onboarded";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileHeader } from "@/components/dashboard/mobile-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { AppleBg } from "@/components/ui/apple-bg";
import {
  listPendingGrowthCandidates,
  getGrowthRoi,
} from "@/app/dashboard/actions/growth";
import { listPendingDrafts } from "@/app/dashboard/actions";
import { OpportunityCard } from "@/components/dashboard/growth/OpportunityCard";
import { RoiStatStrip } from "@/components/dashboard/growth/RoiStatStrip";
import { EmptyState } from "@/components/dashboard/growth/EmptyState";
import { OnDemandTriggerButton } from "@/components/dashboard/growth/OnDemandTriggerButton";
import { Sprout } from "lucide-react";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function GrowthPage() {
  const { userEmail, tenantConfig, tenantName } = await requireOnboarded();

  // Narrow tenant config fields. requireOnboarded returns
  // Record<string, unknown> so each property needs a typeof guard.
  const ownerName =
    typeof tenantConfig.owner_name === "string"
      ? tenantConfig.owner_name
      : null;
  const businessName =
    typeof tenantConfig.business_name === "string"
      ? tenantConfig.business_name
      : tenantName;
  const tier =
    typeof tenantConfig.tier === "string" ? tenantConfig.tier : "solo";

  // Parallel data fetch — 3 round-trips run concurrently
  const [candidates, roi, draftsResult] = await Promise.all([
    listPendingGrowthCandidates(),
    getGrowthRoi(),
    listPendingDrafts(),
  ]);

  const pendingCount = draftsResult.success
    ? draftsResult.drafts?.filter((d) => d.status === "pending").length ?? 0
    : 0;

  const candidateCountLabel =
    candidates.length === 0
      ? "הסוכן רץ אוטומטית בכל יום ראשון"
      : candidates.length === 1
        ? "הזדמנות אחת ממתינה לאישור"
        : `${candidates.length} הזדמנויות ממתינות לאישור`;

  return (
    <div
      className="relative min-h-screen"
      dir="rtl"
      style={{ color: "var(--color-ink)" }}
    >
      <AppleBg />

      <Sidebar
        userEmail={userEmail}
        ownerName={ownerName}
        businessName={businessName}
        isAdmin={isAdminEmail(userEmail)}
        pendingCount={pendingCount}
      />

      <MobileHeader
        userEmail={userEmail}
        ownerName={ownerName}
        businessName={businessName}
        isAdmin={isAdminEmail(userEmail)}
        pendingCount={pendingCount}
      />

      <div className="md:mr-[232px]">
        <main className="spike-scroll mx-auto max-w-[1280px] px-4 pb-[96px] pt-5 sm:px-6 md:px-10 md:pb-20 md:pt-8">
          {/* Page header — title + on-demand trigger */}
          <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Lime gradient marker — the visual identity for Growth */}
              <div
                className="flex h-11 w-11 items-center justify-center rounded-[12px]"
                style={{
                  background:
                    "linear-gradient(135deg, #84CC16 0%, #65A30D 100%)",
                  border: "1px solid rgba(255,255,255,0.6)",
                  boxShadow:
                    "0 4px 14px rgba(132,204,22,0.32), inset 0 1px 0 rgba(255,255,255,0.5)",
                }}
              >
                <Sprout
                  size={22}
                  strokeWidth={1.75}
                  style={{ color: "white" }}
                />
              </div>
              <div>
                <h1
                  className="text-[24px] font-semibold tracking-[-0.02em]"
                  style={{ color: "var(--color-ink)" }}
                >
                  הזדמנויות
                </h1>
                <p
                  className="mt-0.5 text-[13px]"
                  style={{ color: "var(--color-ink-3)" }}
                >
                  {candidateCountLabel}
                </p>
              </div>
            </div>
            <OnDemandTriggerButton tier={tier} />
          </div>

          {/* ROI strip — 30-day snapshot */}
          <RoiStatStrip snapshot={roi} />

          {/* Body — empty state OR list */}
          {candidates.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              {candidates.map((candidate) => (
                <OpportunityCard key={candidate.id} candidate={candidate} />
              ))}
            </div>
          )}
        </main>
      </div>

      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}
