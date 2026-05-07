// src/lib/auth/require-onboarded.ts
//
// Dashboard route guard. Call at the top of any server component that
// requires a logged-in user with a completed onboarding.
//
// Behavior:
//   - Not logged in       → redirect to /login
//   - Logged in, no tenant → redirect to /auth/error?reason=no_tenant
//   - Tenant exists, onboarding NOT done → redirect to /onboarding
//   - Tenant exists, onboarding done → returns full context including
//     the already-fetched user and tenantConfig (so callers don't need
//     to re-fetch them).
//
// Sub-stage 1.14.3 perf changes (2026-05-07):
//   1. Returns user, tenantConfig, tenantName already-fetched (callers
//      don't need duplicate auth.getUser or tenants lookups).
//   2. Wrapped in React `cache()` so multiple callers WITHIN A SINGLE
//      REQUEST share the same result — no extra DB cost when both a
//      layout and its page invoke requireOnboarded. Cross-request,
//      cache is fresh (per-request scope guaranteed by React).

import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface OnboardedContext {
  /** Already-fetched Supabase user. Use directly instead of calling
   *  supabase.auth.getUser() again. */
  user: User;
  userId: string;
  userEmail: string;
  tenantId: string;
  /** Already-fetched tenant.config jsonb (or {} if missing). Avoids a
   *  second round-trip to the tenants table. */
  tenantConfig: Record<string, unknown>;
  /** Already-fetched tenant.name (or null). Same rationale as
   *  tenantConfig — we already had the row. */
  tenantName: string | null;
}

/**
 * Resolve the current user's onboarded context. Cached per-request via
 * React's `cache()` — multiple invocations within the same request
 * share the same result, but each new request is a fresh execution.
 */
export const requireOnboarded = cache(
  async (): Promise<OnboardedContext> => {
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
    // We pull `name` and full `config` here so callers can reuse them
    // (saves a duplicate tenants lookup in page.tsx).
    const adminDb = createAdminClient();
    const { data: tenant } = await adminDb
      .from("tenants")
      .select("name, config")
      .eq("id", tenantId)
      .maybeSingle();

    const tenantConfig = (tenant?.config ?? {}) as Record<string, unknown>;
    const completedAt = tenantConfig.onboarding_completed_at;

    if (typeof completedAt !== "string" || completedAt.length === 0) {
      redirect("/onboarding");
    }

    const tenantName =
      typeof tenant?.name === "string" ? tenant.name : null;

    return {
      user,
      userId: user.id,
      userEmail: user.email ?? "",
      tenantId,
      tenantConfig,
      tenantName,
    };
  }
);
