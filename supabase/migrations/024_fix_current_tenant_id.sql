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
--   Single lookup against user_settings.active_tenant_id — the canonical
--   tenant source per requireOnboarded(). Every onboarded user has this
--   row populated, so the function will resolve correctly for everyone
--   who completed onboarding.
--
-- Why we dropped the JWT path:
--   Spike has no code path that sets `auth.users.raw_app_meta_data.tenant_id`
--   during onboarding. Keeping JWT-as-primary with a user_settings fallback
--   creates the illusion that JWT-claim onboarding is supported, when it
--   isn't. Single canonical path is easier to reason about, easier to
--   audit, and matches how the rest of the application code resolves
--   tenants (`requireOnboarded()` reads user_settings).
--
-- No schema change. No data migration. Single function rewrite.
-- Zero downtime — function replacement is atomic.

CREATE OR REPLACE FUNCTION public.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select active_tenant_id from user_settings where user_id = auth.uid()
$function$;

-- Reload PostgREST schema cache so the new function definition is picked
-- up immediately by API queries (Iron Rule §9 — every migration that
-- changes a function/schema needs this).
NOTIFY pgrst, 'reload schema';
