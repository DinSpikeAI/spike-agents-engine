// src/app/admin/page.tsx
//
// Day 11B — Admin Command Center entry point.
//
// Auth model:
//   1. proxy.ts redirects unauthenticated users to /login
//   2. requireAdmin() (from src/lib/admin/auth.ts) redirects non-admin
//      users to /dashboard
//   3. Only admin emails (per ADMIN_EMAILS env var) reach this page
//
// Layout matches the existing /dashboard structure: Sidebar on the side,
// main content with header + sections. Three sections in priority order:
//
//   1. AdminStatsStrip   — top-of-page KPIs (revenue potential, spend, etc.)
//   2. GlobalHealthTable — every tenant with risk indicators
//   3. AuditLogViewer    — recent agent_runs feed across all tenants

import { requireAdmin } from "@/lib/admin/auth";
import {
  listAllTenantsWithHealth,
  getRecentAgentRunsAcrossTenants,
  getGlobalSpendStats,
} from "@/lib/admin/queries";
import { Sidebar } from "@/components/dashboard/sidebar";
import { AdminStatsStrip } from "@/components/admin/admin-stats-strip";
import { GlobalHealthTable } from "@/components/admin/global-health-table";
import { AuditLogViewer } from "@/components/admin/audit-log-viewer";

// Always fresh — no caching for admin views
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Auth — throws redirect if not admin
  const adminUser = await requireAdmin();

  // Load all 3 datasets in parallel
  const [stats, tenants, recentRuns] = await Promise.all([
    getGlobalSpendStats(),
    listAllTenantsWithHealth(),
    getRecentAgentRunsAcrossTenants(50),
  ]);

  const adminEmail = adminUser.email ?? "";

  return (
    <div
      className="relative min-h-screen"
      dir="rtl"
      style={{ background: "var(--spike-bg)", color: "var(--spike-text)" }}
    >
      <Sidebar userEmail={adminEmail} />

      <div className="md:mr-[248px]">
        <main
          className="spike-scroll mx-auto max-w-[1400px] px-6 pb-20 pt-8 md:px-10"
          style={{ position: "relative", zIndex: 1 }}
        >
          {/* ─── Page header ───────────────────────────── */}
          <div className="mb-8">
            <div className="mb-1 flex items-center gap-3">
              <span
                className="inline-flex h-2 w-2 rounded-full spike-pulse-dot"
                style={{ background: "var(--spike-teal)" }}
              />
              <span
                className="text-xs uppercase tracking-wider"
                style={{ color: "var(--spike-text-mute)" }}
              >
                Admin · Founder's Eye
              </span>
            </div>
            <h1
              className="text-3xl font-bold"
              style={{ color: "var(--spike-text)" }}
            >
              מרכז בקרה
            </h1>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--spike-text-dim)" }}
            >
              תצוגה גלובלית של כל הלקוחות, הוצאות, ובריאות החשבונות במערכת.
            </p>
          </div>

          {/* ─── Section 1: KPI strip ─────────────────── */}
          <section className="mb-8">
            <AdminStatsStrip stats={stats} />
          </section>

          {/* ─── Section 2: Global health table ───────── */}
          <section className="mb-8">
            <h2
              className="mb-4 text-xl font-bold"
              style={{ color: "var(--spike-text)" }}
            >
              בריאות לקוחות גלובלית
            </h2>
            <GlobalHealthTable tenants={tenants} />
          </section>

          {/* ─── Section 3: Audit log ──────────────────── */}
          <section className="mb-8">
            <h2
              className="mb-4 text-xl font-bold"
              style={{ color: "var(--spike-text)" }}
            >
              לוג פעילות סוכנים
            </h2>
            <AuditLogViewer runs={recentRuns} />
          </section>
        </main>
      </div>
    </div>
  );
}
