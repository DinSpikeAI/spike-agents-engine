// src/app/dashboard/agents/page.tsx
//
// Sub-stage 1.8 — Agents overview page.
//
// Shows a card per customer-facing agent with:
//   - emoji + name + role (from agents/config.ts)
//   - description (also from config)
//   - "X runs this month" (non-mock)
//   - "Last run: <relative time>" or "Not run yet"
//   - the agent's existing Run button (reused from dashboard)
//
// No cost/quota display — see overview.ts header comment.
//
// Layout: same 3 categories as dashboard (routine / content / insight).

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOnboarded } from "@/lib/auth/require-onboarded";
import { isAdminEmail } from "@/lib/admin/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileHeader } from "@/components/dashboard/mobile-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { WhatsAppFab } from "@/components/dashboard/whatsapp-fab";
import { AppleBg } from "@/components/ui/apple-bg";
import { AgentOverviewCard } from "@/components/dashboard/agent-overview-card";
import { listPendingDrafts, getManagerLockState } from "@/app/dashboard/actions";
import { getAgentsOverview } from "@/lib/agents/overview";
import type { AgentId } from "@/lib/agents/types";

export const dynamic = "force-dynamic";

// Category mapping mirrors dashboard/page.tsx — same logical groups.
type AgentCategory = "routine" | "content" | "insight";

const AGENTS_BY_CATEGORY: Record<AgentCategory, AgentId[]> = {
  routine: ["morning", "watcher"],
  content: ["reviews", "social", "sales"],
  insight: ["manager", "hot_leads", "inventory"],
};

const CATEGORY_META: Record<
  AgentCategory,
  { label: string; tagline: string }
> = {
  routine: {
    label: "שגרה יומית",
    tagline: "מה שצריך להתחיל איתו את היום",
  },
  content: {
    label: "תוכן ושירות לקוח",
    tagline: "טיוטות שמחכות לאישור שלך",
  },
  insight: {
    label: "ניתוח ותובנות",
    tagline: "מה קורה בעסק ולאן מתקדמים",
  },
};

export default async function AgentsOverviewPage() {
  const { userEmail, tenantId } = await requireOnboarded();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load tenant for sidebar identity.
  const adminDb = createAdminClient();
  const { data: tenantRow } = await adminDb
    .from("tenants")
    .select("name, config")
    .eq("id", tenantId)
    .maybeSingle();

  const tenantConfig =
    (tenantRow?.config as Record<string, unknown> | null) ?? {};
  const ownerName =
    typeof tenantConfig.owner_name === "string"
      ? tenantConfig.owner_name
      : null;
  const businessName =
    typeof tenantConfig.business_name === "string"
      ? tenantConfig.business_name
      : (tenantRow?.name as string | undefined) ?? null;

  // Fetch overview + drafts + manager lock in parallel.
  const [overview, draftsResult, managerLockResult] = await Promise.all([
    getAgentsOverview(tenantId),
    listPendingDrafts(),
    getManagerLockState(),
  ]);

  const pendingCount = draftsResult.success
    ? draftsResult.drafts?.filter((d) => d.status === "pending").length ?? 0
    : 0;

  const managerLockState =
    managerLockResult.success && managerLockResult.state
      ? managerLockResult.state
      : {
          canRun: true,
          reason: null,
          nextEligibleAt: null,
          daysUntilNext: 0,
          hoursUntilNext: 0,
          unreadReportId: null,
          lastReadAt: null,
        };

  // Index overview by agentId for quick lookup.
  const overviewByAgent = new Map(overview.map((o) => [o.agentId, o]));

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
        <main className="spike-scroll mx-auto max-w-[1280px] px-4 pb-[96px] pt-6 sm:px-6 md:px-10 md:pb-20 md:pt-10">
          <h1
            className="mb-2 text-[26px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[30px]"
            style={{ color: "var(--color-ink)" }}
          >
            הסוכנים שלי
          </h1>
          <p
            className="mb-8 text-[14px] leading-[1.55]"
            style={{ color: "var(--color-ink-3)" }}
          >
            סקירה של כל הסוכנים שעובדים בעסק שלך, מתי רצו לאחרונה, וכמה פעמים
            רצו החודש.
          </p>

          {(["routine", "content", "insight"] as AgentCategory[]).map(
            (cat, catIdx) => {
              const meta = CATEGORY_META[cat];
              const agentIds = AGENTS_BY_CATEGORY[cat];
              if (agentIds.length === 0) return null;

              return (
                <section key={cat} className={catIdx === 0 ? "" : "pt-7"}>
                  <div className="mb-3 flex items-baseline gap-3">
                    <h2
                      className="text-[17px] font-semibold tracking-[-0.01em]"
                      style={{ color: "var(--color-ink)" }}
                    >
                      {meta.label}
                    </h2>
                    <span
                      className="hidden text-[12px] sm:inline"
                      style={{ color: "var(--color-ink-3)" }}
                    >
                      {meta.tagline}
                    </span>
                    <div className="section-divider flex-1" />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {agentIds.map((agentId) => {
                      const data = overviewByAgent.get(agentId);
                      if (!data) return null;
                      return (
                        <AgentOverviewCard
                          key={agentId}
                          agentId={agentId}
                          lastRunAt={data.lastRunAt}
                          lastStatus={data.lastStatus}
                          monthlyRunCount={data.monthlyRunCount}
                          managerLockState={managerLockState}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            }
          )}
        </main>

        <WhatsAppFab />
      </div>

      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}
