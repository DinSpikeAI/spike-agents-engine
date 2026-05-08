-- supabase/migrations/024_fix_current_tenant_id.sql
--
-- Sub-stage 1.15.2 — RLS architectural fix.
--
-- BEFORE:
--   current_tenant_id() returned ONLY the JWT app_metadata.tenant_id claim.
--   Spike's onboarding flow never sets that claim — so for every onboarded
--   user, current_tenant_id() returned NULL, and any RLS policy of the
--   form `(tenant_id = current_tenant_id())` filtered out every row.
--   Symptom: dashboard reads on growth_candidates returned empty arrays
--   silently. See §15.20 in CLAUDE.md for the full incident write-up.
--
-- AFTER:
--   coalesce(JWT claim, user_settings.active_tenant_id).
--   - Existing users that happen to have the JWT claim continue working
--     unchanged (JWT path wins).
--   - New users without the claim resolve via user_settings, which is
--     already the canonical source of truth used by requireOnboarded().
--
-- No schema change. No data migration. Single function rewrite.
-- Zero downtime — function replacement is atomic.

CREATE OR REPLACE FUNCTION public.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    -- Primary: explicit JWT app_metadata claim (kept for backwards compat
    -- with any user who happens to have it set, e.g. via the per-user
    -- workaround applied during 1.15.2 incident).
    nullif((select auth.jwt() #>> '{app_metadata,tenant_id}'), '')::uuid,
    -- Fallback: user_settings.active_tenant_id — the canonical source per
    -- requireOnboarded(). Every onboarded user has a row here.
    (select active_tenant_id from user_settings where user_id = auth.uid())
  )
$function$;

-- Reload PostgREST schema cache so the new function definition is picked
-- up immediately by API queries (Iron Rule §9 — every migration that
-- changes a function/schema needs this).
NOTIFY pgrst, 'reload schema';
