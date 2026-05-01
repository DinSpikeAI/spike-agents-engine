// src/lib/auth/require-onboarded.ts
//
// Dashboard route guard. Call at the top of any server component that
// requires a logged-in user with a completed onboarding.
//
// Behavior:
//   - Not logged in       → redirect to /login
//   - Logged in, no tenant → redirect to /auth/error?reason=no_tenant
//   - Tenant exists, onboarding NOT done → redirect to /onboarding
//   - Tenant exists, onboarding done → returns { user, tenantId }
//
// All redirects are server-side (Next.js redirect()).

import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface OnboardedContext {
  userId: string;
  userEmail: string;
  tenantId: string;
}

export async function requireOnboarded(): Promise<OnboardedContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Resolve active tenant (mirrors dashboard/actions.ts pattern).
  const { data: settings } = await supabase
    .from("user_settings")
    .select("active_tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let tenantId: string | null = null;
  if (settings?.active_tenant_id) {
    tenantId = settings.active_tenant_id as string;
  } else {
    const { data: membership } = await supabase
      .from("memberships")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    tenantId = (membership?.tenant_id as string | undefined) ?? null;
  }

  if (!tenantId) {
    redirect("/auth/error?reason=no_tenant");
  }

  // Check onboarding status. Use admin client because RLS may restrict
  // direct selects on tenants from a normal user session.
  const adminDb = createAdminClient();
  const { data: tenant } = await adminDb
    .from("tenants")
    .select("config")
    .eq("id", tenantId)
    .maybeSingle();

  const config = (tenant?.config ?? {}) as Record<string, unknown>;
  const completedAt = config.onboarding_completed_at;

  if (typeof completedAt !== "string" || completedAt.length === 0) {
    redirect("/onboarding");
  }

  return {
    userId: user.id,
    userEmail: user.email ?? "",
    tenantId,
  };
}
