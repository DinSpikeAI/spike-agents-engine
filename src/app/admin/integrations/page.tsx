// src/app/admin/integrations/page.tsx
//
// Sub-stage 2.0 (revision 2026-05-07) — Admin integrations management.
//
// Auth: requireAdmin() (ADMIN_EMAILS env var).
// Lists ALL tenants with their WhatsApp connection status. Admin picks
// a tenant from the dropdown to manage that tenant's integrations
// (connect, disconnect, edit credentials).
//
// Customers do NOT see this page (admin-only). Customers see the
// read-only /dashboard/integrations view.

import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Sidebar } from "@/components/dashboard/sidebar";
import { AdminIntegrationsManager } from "@/components/admin/admin-integrations-form";

export const dynamic = "force-dynamic";

export interface TenantWithIntegrations {
  id: string;
  name: string | null;
  ownerName: string | null;
  whatsapp:
    | {
        id: string;
        status: string;
        phoneNumberId: string | null;
        displayPhoneNumber: string | null;
        wabaId: string | null;
        connectedAt: string;
      }
    | null;
}

export default async function AdminIntegrationsPage() {
  const adminUser = await requireAdmin();
  const adminEmail = adminUser.email ?? "";

  const adminDb = createAdminClient();

  // Tenants
  const { data: tenants } = await adminDb
    .from("tenants")
    .select("id, name, config")
    .order("created_at", { ascending: false });

  // All whatsapp integrations (we'll join in JS)
  const { data: allWhatsapp } = await adminDb
    .from("integrations")
    .select("id, tenant_id, status, metadata, created_at")
    .eq("provider", "whatsapp")
    .in("status", ["connected", "disconnected"]);

  const whatsappByTenant = new Map<
    string,
    NonNullable<TenantWithIntegrations["whatsapp"]>
  >();
  for (const it of allWhatsapp ?? []) {
    // Prefer connected over disconnected if both exist (shouldn't due to UNIQUE
    // constraint, but defensive).
    const existing = whatsappByTenant.get(it.tenant_id);
    if (existing && existing.status === "connected") continue;

    const md = (it.metadata as Record<string, unknown> | null) ?? {};
    whatsappByTenant.set(it.tenant_id, {
      id: it.id,
      status: it.status,
      phoneNumberId:
        typeof md.phone_number_id === "string" ? md.phone_number_id : null,
      displayPhoneNumber:
        typeof md.display_phone_number === "string"
          ? md.display_phone_number
          : null,
      wabaId:
        typeof md.whatsapp_business_account_id === "string"
          ? md.whatsapp_business_account_id
          : null,
      connectedAt:
        (typeof md.connected_at === "string" && md.connected_at) ||
        it.created_at,
    });
  }

  const tenantList: TenantWithIntegrations[] = (tenants ?? []).map((t) => {
    const config = (t.config as Record<string, unknown> | null) ?? {};
    const ownerName =
      (typeof config.owner_name === "string" && config.owner_name) || null;
    return {
      id: t.id,
      name: (t.name as string | null) ?? null,
      ownerName,
      whatsapp: whatsappByTenant.get(t.id) ?? null,
    };
  });

  // Stats for header strip
  const totalTenants = tenantList.length;
  const connectedCount = tenantList.filter(
    (t) => t.whatsapp?.status === "connected"
  ).length;
  const pendingCount = totalTenants - connectedCount;

  return (
    <div
      className="relative min-h-screen"
      dir="rtl"
      style={{ background: "var(--spike-bg)", color: "var(--spike-text)" }}
    >
      <Sidebar userEmail={adminEmail} isAdmin={true} />

      <div className="md:mr-[248px]">
        <main
          className="spike-scroll mx-auto max-w-[1100px] px-6 pb-20 pt-8 md:px-10"
          style={{ position: "relative", zIndex: 1 }}
        >
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
                Admin · Integrations
              </span>
            </div>
            <h1
              className="text-3xl font-bold"
              style={{ color: "var(--spike-text)" }}
            >
              ניהול אינטגרציות
            </h1>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--spike-text-dim)" }}
            >
              חיבור WhatsApp עבור tenants, מבוצע על ידך בשמם. הלקוחות לא רואים
              את הדף הזה ולא יכולים להריץ פעולות טכניות בעצמם.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-3">
            <StatCell label="סה״כ tenants" value={totalTenants} />
            <StatCell
              label="WhatsApp מחובר"
              value={connectedCount}
              accent="var(--spike-teal)"
            />
            <StatCell
              label="ממתין להקמה"
              value={pendingCount}
              accent={pendingCount > 0 ? "#ff9f0a" : undefined}
            />
          </div>

          <AdminIntegrationsManager tenants={tenantList} />
        </main>
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div
      className="rounded-[12px] px-4 py-3"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="text-[11px] uppercase tracking-wider"
        style={{ color: "var(--spike-text-mute)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-bold"
        style={{ color: accent ?? "var(--spike-text)" }}
      >
        {value}
      </div>
    </div>
  );
}
