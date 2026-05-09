-- supabase/migrations/025_fix_membership_rls_recursion.sql
--
-- Sub-stage 1.15.3 / Sprint 2 Batch 2C — discovered during end-to-end
-- test of the Growth approve flow.
--
-- ──────────────────────────────────────────────────────────────────
-- WHY
-- ──────────────────────────────────────────────────────────────────
-- Two RLS policies in the schema reference `memberships` from inside
-- their qual:
--
--   1. memberships_select on memberships:
--      `tenant_id IN (SELECT memberships_1.tenant_id FROM memberships ...)`
--      -- a self-referential subquery on memberships, FROM INSIDE the
--      memberships policy. PostgreSQL evaluates the subquery, which
--      triggers memberships RLS, which evaluates the policy, which
--      evaluates the subquery, which triggers memberships RLS, ... =>
--      ERROR 42P17: infinite recursion detected in policy.
--
--   2. integrations_admin_only on integrations:
--      `tenant_id IN (SELECT memberships.tenant_id FROM memberships ...)`
--      -- queries memberships from inside the integrations policy.
--      memberships RLS is then evaluated, hitting the broken policy
--      from #1, hence the recursion.
--
-- Symptom: any user-scoped SELECT on `integrations` returns the
-- 42P17 error to the supabase-js client. The Growth approve flow
-- (`lookupTenantWhatsAppIntegration` in actions/growth.ts) was the
-- first piece of code to read integrations user-scoped, so this is
-- where it surfaced. Toast in production: "אושר. שגיאה זמנית בבדיקת
-- WhatsApp." (the `db_error` branch of the integration lookup).
--
-- Why this didn't surface before: every existing RLS policy on
-- memberships was self-referential, but no previous code path
-- triggered the integrations RLS user-scoped. Inngest jobs and
-- admin-client reads bypass RLS entirely; user-scoped reads on
-- integrations only landed with 2C.
--
-- This bug was latent for months. It would have hit any real
-- customer the moment they tried to use the Growth approve button.
-- Caught pre-launch.
--
-- ──────────────────────────────────────────────────────────────────
-- FIX
-- ──────────────────────────────────────────────────────────────────
-- Standard pattern: pull the recursive subquery into a SECURITY
-- DEFINER function. SECURITY DEFINER functions execute with the
-- function owner's privileges (postgres, the schema owner here)
-- which bypasses RLS on the tables they query internally. The
-- recursion breaks at the function boundary.
--
-- The function `user_admin_tenant_ids()` returns the set of tenant
-- UUIDs where the calling auth.uid() has role IN (owner, admin).
-- Both policies are rewritten to use it instead of an inline
-- subquery on memberships.
--
-- Behavior is unchanged — same set of rows are visible to the same
-- users. Only the recursion is removed.
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_admin_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT tenant_id
  FROM memberships
  WHERE user_id = auth.uid()
    AND role = ANY (ARRAY['owner'::text, 'admin'::text])
$function$;

-- ── memberships SELECT ──────────────────────────────────────────────

DROP POLICY IF EXISTS memberships_select ON public.memberships;

CREATE POLICY memberships_select ON public.memberships
  FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT user_admin_tenant_ids())
    OR is_super_admin()
  );

-- ── integrations ALL (admin write + read) ──────────────────────────

DROP POLICY IF EXISTS integrations_admin_only ON public.integrations;

CREATE POLICY integrations_admin_only ON public.integrations
  FOR ALL
  USING (
    tenant_id IN (SELECT user_admin_tenant_ids())
    OR is_super_admin()
  )
  WITH CHECK (
    tenant_id IN (SELECT user_admin_tenant_ids())
    OR is_super_admin()
  );

-- ── PostgREST schema cache ──────────────────────────────────────────
-- Required after any policy/function change so that the API layer
-- picks up the new definitions immediately. Without this, supabase-js
-- callers may continue to see the old (broken) policy for several
-- minutes until PostgREST reloads on its own.

NOTIFY pgrst, 'reload schema';
