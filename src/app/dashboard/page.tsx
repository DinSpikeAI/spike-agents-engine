import { Suspense } from "react";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth/require-onboarded";
import { isAdminEmail } from "@/lib/admin/auth";
import { getOnboardingStatus } from "@/lib/auth/onboarding-status";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileHeader } from "@/components/dashboard/mobile-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { Topbar } from "@/components/dashboard/topbar";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { ApprovalBanner } from "@/components/dashboard/approval-banner";
import { OnboardingBanner } from "@/components/dashboard/onboarding-banner";
import { WhatsAppFab } from "@/components/dashboard/whatsapp-fab";
import { AppleBg } from "@/components/ui/apple-bg";
import { Glass } from "@/components/ui/glass";
import { SpikeImpactWidget } from "@/components/dashboard/spike-impact-widget";
import { getSpikeImpactStats } from "@/lib/dashboard/spike-impact";
import { RunMorningButton } from "@/components/dashboard/run-morning-button";
import { RunWatcherButton } from "@/components/dashboard/run-watcher-button";
import { RunReviewsButton } from "@/components/dashboard/run-reviews-button";
import { RunHotLeadsButton } from "@/components/dashboard/run-hot-leads-button";
import { RunManagerButton } from "@/components/dashboard/run-manager-button";
import { RunSocialButton } from "@/components/dashboard/run-social-button";
import { RunSalesButton } from "@/components/dashboard/run-sales-button";
import { RunInventoryButton } from "@/components/dashboard/run-inventory-button";
import {
  listPendingDrafts,
  getManagerLockState,
  getDashboardKpis,
} from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "בוקר טוב";
  if (hour >= 12 && hour < 17) return "צהריים טובים";
  if (hour >= 17 && hour < 21) return "ערב טוב";
  return "לילה טוב";
}

// Agent metadata — desc + role + status from research handoff
// Categories: routine (daily ops), content (drafts for owner), insight (analysis)
type AgentCategory = "routine" | "content" | "insight";

interface AgentMeta {
  id: string;
  emoji: string;
  name: string;
  role: string;
  desc: string;
  button: string;
  category: AgentCategory;
}

const AGENTS: AgentMeta[] = [
  {
    id: "manager",
    emoji: "🧠",
    name: "סוכן מנהל",
    role: "דוח שבועי",
    desc: "סוקר את כל הסוכנים שלך בשבוע האחרון, מזהה חריגות איכות, חישוב מדדי צמיחה והמלצה אחת לפעולה.",
    button: "manager",
    category: "insight",
  },
  {
    id: "morning",
    emoji: "☀️",
    name: "סוכן הבוקר",
    role: "תדריך יומי",
    desc: "תדריך בוקר עם 3 פעולות לעדיפות ראשונה, על בסיס הלידים והפניות מאתמול.",
    button: "morning",
    category: "routine",
  },
  {
    id: "watcher",
    emoji: "🎯",
    name: "סוכן מעקב",
    role: "התראות בזמן אמת",
    desc: "מסמן לידים תקועים, פניות שלא נענו ושיחות שמצריכות תגובה היום.",
    button: "watcher",
    category: "routine",
  },
  {
    id: "reviews",
    emoji: "⭐",
    name: "סוכן ביקורות",
    role: "טיוטות תגובה",
    desc: "מנסח תגובות לביקורות בגוגל ופייסבוק, בודק טון ומחכה לאישורך לפני שליחה.",
    button: "reviews",
    category: "content",
  },
  {
    id: "leads",
    emoji: "🔥",
    name: "סוכן לידים חמים",
    role: "סיווג לידים",
    desc: "מסווג לידים נכנסים ל־Cold / Warm / Hot / Burning לפי התנהגות בפועל.",
    button: "leads",
    category: "insight",
  },
  {
    id: "social",
    emoji: "📱",
    name: "סוכן רשתות",
    role: "פוסטים יומיים",
    desc: "מכין 3 טיוטות פוסטים יומיים בעברית לאינסטגרם ופייסבוק. אתה מאשר ושולח בעצמך.",
    button: "social",
    category: "content",
  },
  {
    id: "sales",
    emoji: "💰",
    name: "סוכן מכירות",
    role: "פולואו־אפ",
    desc: "מאתר לידים שתקועים יותר מ־3 ימים ומכין follow-up עם קישור ישיר ל-WhatsApp.",
    button: "sales",
    category: "content",
  },
  {
    id: "inventory",
    emoji: "📦",
    name: "סוכן מלאי",
    role: "ניתוח מלאי",
    desc: "מנתח קובץ CSV של המלאי, מחשב ימי כיסוי לכל מוצר ומסמן פריטים שדורשים תשומת לב.",
    button: "inventory",
    category: "insight",
  },
  {
    id: "growth",
    emoji: "🌱",
    name: "סוכן צמיחה",
    role: "סריקה שבועית",
    desc: "סורק לקוחות רדומים ופניות שלא נענו, מציע טיוטות אישיות בעברית להחזיר את הקשר. רץ אוטומטית ביום ראשון בבוקר; אפשר להפעיל ידנית מתוך הכרטיס.",
    button: "growth",
    category: "routine",
  },
];

// Category visual metadata — drives section headers and tile accents.
const CATEGORY_META: Record<
  AgentCategory,
  { label: string; tagline: string; bg: string; fg: string; tileBg: string }
> = {
  routine: {
    label: "שגרה",
    tagline: "פעולות שגרתיות, יומיות ושבועיות",
    bg: "var(--color-cat-routine)",
    fg: "var(--color-cat-routine-fg)",
    tileBg:
      "linear-gradient(135deg, rgba(232,239,255,0.95), rgba(225,234,250,0.7))",
  },
  content: {
    label: "תוכן ושירות לקוח",
    tagline: "טיוטות שמחכות לאישור שלך",
    bg: "var(--color-cat-content)",
    fg: "var(--color-cat-content-fg)",
    tileBg:
      "linear-gradient(135deg, rgba(248,243,255,0.95), rgba(240,232,250,0.7))",
  },
  insight: {
    label: "ניתוח ותובנות",
    tagline: "מה קורה בעסק ולאן מתקדמים",
    bg: "var(--color-cat-insight)",
    fg: "var(--color-cat-insight-fg)",
    tileBg:
      "linear-gradient(135deg, rgba(238,250,244,0.95), rgba(225,245,235,0.7))",
  },
};

// Default lock state — used as the Suspense fallback for the manager
// button so the agent grid stays clickable even before the real state
// streams in. canRun=true means the button looks "live" rather than
// disabled during the brief load window. The streamed real state will
// hot-swap in once getManagerLockState() resolves.
const DEFAULT_MANAGER_LOCK_STATE = {
  canRun: true,
  reason: null,
  nextEligibleAt: null,
  daysUntilNext: 0,
  hoursUntilNext: 0,
  unreadReportId: null,
  lastReadAt: null,
} as const;

// Default KPIs — used as the Suspense fallback for the KPI strip while
// real numbers stream in. We pass through the already-known
// pendingApprovals (we have it from listPendingDrafts which blocks the
// shell render) so that one tile is correct from frame 1; the other 3
// show 0 briefly and update when getDashboardKpis() resolves.
const DEFAULT_KPIS = {
  todaysActions: 0,
  monthlySpend: 0,
  monthlyCap: 0,
} as const;

// ─────────────────────────────────────────────────────────────
// Streamed sections — each is its own async server component that
// awaits ONE data source. Wrapped in Suspense by the page below so
// they don't block the shell render. Cold-start latency hits the
// shell once; these sections fill in the response stream as their
// data resolves, in parallel.
// ─────────────────────────────────────────────────────────────

async function KpiStripStream({
  pendingApprovals,
}: {
  pendingApprovals: number;
}) {
  const kpiResult = await getDashboardKpis();
  const kpis =
    kpiResult.success && kpiResult.kpis
      ? kpiResult.kpis
      : {
          pendingApprovals,
          todaysActions: 0,
          monthlySpend: 0,
          monthlyCap: 0,
        };
  return (
    <KpiStrip
      pendingApprovals={kpis.pendingApprovals}
      todaysActions={kpis.todaysActions}
      monthlySpend={kpis.monthlySpend}
      monthlyCap={kpis.monthlyCap}
    />
  );
}

async function OnboardingBannerStream({ tenantId }: { tenantId: string }) {
  const onboardingStatus = await getOnboardingStatus(tenantId);
  if (!onboardingStatus.hasNoRealRuns) return null;
  return <OnboardingBanner tenantId={tenantId} />;
}

async function RunManagerButtonStream() {
  const managerLockResult = await getManagerLockState();
  const state =
    managerLockResult.success && managerLockResult.state
      ? managerLockResult.state
      : DEFAULT_MANAGER_LOCK_STATE;
  return <RunManagerButton lockState={state} />;
}

export default async function DashboardPage() {
  // Block access if user hasn't completed onboarding yet.
  // requireOnboarded() also handles the not-logged-in case (redirects to /login).
  // Sub-stage 1.14.3: requireOnboarded now returns user + tenantConfig +
  // tenantName already-fetched, AND is wrapped in React cache() so any
  // server actions invoked further down dedupe back to this single call.
  // Saves ~100-150ms per page (we used to do 5 round-trips to Frankfurt).
  const { userEmail, tenantId, tenantConfig, tenantName } =
    await requireOnboarded();

  const greeting = getGreeting();

  const ownerName =
    typeof tenantConfig.owner_name === "string"
      ? tenantConfig.owner_name
      : null;
  const businessName =
    typeof tenantConfig.business_name === "string"
      ? tenantConfig.business_name
      : tenantName;

  // Display name for greeting: owner_name from onboarding > email username
  const userName = ownerName || userEmail.split("@")[0] || "משתמש";

  // Sub-stage 1.16 perf refactor: only block on listPendingDrafts (single
  // small query) because pendingCount is needed by 4+ places in the
  // shell — Sidebar, MobileHeader, Topbar, BottomNav, KpiStrip badge,
  // ApprovalBanner gate. The OTHER three data sources (KPIs, manager
  // lock, onboarding status) stream in via Suspense boundaries below,
  // so the shell + agent grid are visible the moment listPendingDrafts
  // resolves — no longer waiting on the slowest of 4 parallel queries.
  //
  // Sprint 3F (2026-05-17): getSpikeImpactStats joins the blocking
  // round-trip. It's a 2-query read (drafts + hot_leads) — same shape
  // as listPendingDrafts itself — so Promise.all adds zero wall time vs
  // running listPendingDrafts alone. The widget mounts above the agent
  // category sections, so we want its data ready before paint.
  const [draftsResult, impactStats] = await Promise.all([
    listPendingDrafts(),
    getSpikeImpactStats(tenantId, 7),
  ]);

  const pendingCount = draftsResult.success
    ? draftsResult.drafts?.filter((d) => d.status === "pending").length ?? 0
    : 0;

  // Build pending summary string
  const pendingSummary = (() => {
    if (!draftsResult.success || !draftsResult.drafts) return "אין טיוטות מחכות";
    const pending = draftsResult.drafts.filter((d) => d.status === "pending");
    if (pending.length === 0) return "אין טיוטות מחכות";

    const counts = {
      sales_followup: 0,
      social_post: 0,
      review_reply: 0,
    };
    for (const d of pending) {
      if (d.type === "sales_followup") counts.sales_followup++;
      else if (d.type === "social_post") counts.social_post++;
      else if (d.type === "review_reply") counts.review_reply++;
    }

    const parts = [];
    if (counts.sales_followup > 0)
      parts.push(`${counts.sales_followup} טיוטות מכירה`);
    if (counts.social_post > 0) parts.push(`${counts.social_post} פוסטים`);
    if (counts.review_reply > 0)
      parts.push(`${counts.review_reply} תגובות לביקורות`);
    return parts.join(" · ");
  })();

  // Render the right button per agent. The manager case uses a Suspense
  // boundary so the rest of the agent grid stays interactive while the
  // lock-state query completes; fallback is the same button rendered
  // with a permissive default state so the user doesn't see a flicker
  // or "disabled" placeholder.
  const renderButton = (buttonType: string) => {
    switch (buttonType) {
      case "manager":
        return (
          <Suspense
            fallback={
              <RunManagerButton lockState={DEFAULT_MANAGER_LOCK_STATE} />
            }
          >
            <RunManagerButtonStream />
          </Suspense>
        );
      case "morning":
        return <RunMorningButton />;
      case "watcher":
        return <RunWatcherButton />;
      case "reviews":
        return <RunReviewsButton />;
      case "leads":
        return <RunHotLeadsButton />;
      case "social":
        return <RunSocialButton />;
      case "sales":
        return <RunSalesButton />;
      case "inventory":
        return <RunInventoryButton />;
      case "growth":
        // Growth is the only agent whose card-button NAVIGATES instead of triggering.
        // The actual on-demand trigger lives in /dashboard/growth's header (tier-gated,
        // 60-min cooldown). The pipeline takes a few minutes, so it's better UX for the
        // owner to see the existing list before deciding to fire another run.
        return (
          <Link
            href="/dashboard/growth"
            className="inline-flex items-center justify-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] font-medium text-white transition-all"
            style={{
              background: "linear-gradient(135deg, #84CC16 0%, #65A30D 100%)",
              boxShadow:
                "0 4px 14px rgba(132,204,22,0.32), inset 0 1px 0 rgba(255,255,255,0.45)",
            }}
          >
            פתח
          </Link>
        );
      default:
        return null;
    }
  };

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

      {/* Mobile-only sticky header with hamburger menu */}
      <MobileHeader
        userEmail={userEmail}
        ownerName={ownerName}
        businessName={businessName}
        isAdmin={isAdminEmail(userEmail)}
        pendingCount={pendingCount}
      />

      <div className="md:mr-[232px]">
        <main className="spike-scroll mx-auto max-w-[1280px] px-4 pb-[96px] pt-3 sm:px-6 md:px-10 md:pb-20 md:pt-2">
          <Topbar
            greeting={greeting}
            userName={userName}
            pendingApprovals={pendingCount}
            lastUpdate="לפני 12 דק׳"
          />

          {/* KPI strip streams in — fallback is the strip rendered with
              default zeros + the real pendingApprovals count we already
              have. The other 3 numbers (todaysActions, monthlySpend,
              monthlyCap) will hot-swap when getDashboardKpis() resolves. */}
          <Suspense
            fallback={
              <KpiStrip
                pendingApprovals={pendingCount}
                todaysActions={DEFAULT_KPIS.todaysActions}
                monthlySpend={DEFAULT_KPIS.monthlySpend}
                monthlyCap={DEFAULT_KPIS.monthlyCap}
              />
            }
          >
            <KpiStripStream pendingApprovals={pendingCount} />
          </Suspense>

          {/* Sub-stage 1.6 — Onboarding banner shown to tenants with 0 non-mock runs.
              Now streamed: the page renders without it, then the banner appears
              if needed once getOnboardingStatus() resolves. Rendering "no banner"
              first and then showing it briefly is fine — the alternative was
              blocking the entire shell on this query. The Banner component itself
              handles manual X dismissal via localStorage. */}
          <Suspense fallback={null}>
            <OnboardingBannerStream tenantId={tenantId} />
          </Suspense>

          {pendingCount > 0 && (
            <Link
              href="/dashboard/approvals"
              className="block transition-opacity hover:opacity-90"
            >
              <ApprovalBanner count={pendingCount} summary={pendingSummary} />
            </Link>
          )}

          {/* Sprint 3F — Spike Impact ROI widget. Sits between the
              urgent-action ApprovalBanner (which only renders when
              pendingCount > 0) and the agent category sections. On a
              tenant with no pending approvals, this becomes the first
              content card after the KpiStrip — the "what Spike did for
              you this week" narrative. Empty-state-aware: if a new
              tenant has no drafts/leads in the window, the widget shows
              a friendly "Spike is working" card instead of zeros. */}
          <SpikeImpactWidget stats={impactStats} />

          {/* Agents by category — three logical groups */}
          {(["routine", "content", "insight"] as AgentCategory[]).map(
            (cat, catIdx) => {
              const meta = CATEGORY_META[cat];
              const agentsInCat = AGENTS.filter((a) => a.category === cat);
              if (agentsInCat.length === 0) return null;

              return (
                <section key={cat} className={catIdx === 0 ? "pt-2" : "pt-7"}>
                  {/* Section header */}
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

                  {/* Agent grid */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {agentsInCat.map((agent) => (
                      <Glass
                        key={agent.id}
                        className="agent-card flex flex-col gap-2.5 p-[14px] sm:p-[18px]"
                      >
                        <div className="flex items-start justify-between">
                          <div
                            className="agent-tile flex h-11 w-11 items-center justify-center rounded-[12px] text-[22px]"
                            style={{
                              background: meta.tileBg,
                              border: "1px solid rgba(255,255,255,0.9)",
                              boxShadow:
                                "0 4px 12px rgba(15,20,30,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
                            }}
                          >
                            {agent.emoji}
                          </div>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                            style={{
                              background: meta.bg,
                              color: meta.fg,
                            }}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <div>
                          <div
                            className="text-[15.5px] font-semibold tracking-tight"
                            style={{ color: "var(--color-ink)" }}
                          >
                            {agent.name}
                          </div>
                          <div
                            className="mt-0.5 text-[11.5px]"
                            style={{ color: "var(--color-ink-3)" }}
                          >
                            {agent.role}
                          </div>
                        </div>
                        <div
                          className="text-[12.5px] leading-[1.55]"
                          style={{ color: "var(--color-ink-2)" }}
                        >
                          {agent.desc}
                        </div>
                        <div className="mt-auto pt-2.5">
                          {renderButton(agent.button)}
                        </div>
                      </Glass>
                    ))}
                  </div>
                </section>
              );
            }
          )}
        </main>

        <WhatsAppFab />
      </div>

      {/* Mobile-only bottom navigation tabs */}
      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}
