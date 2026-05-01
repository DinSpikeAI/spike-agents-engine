-- ============================================================================
-- Migration 019 — Onboarding marker
-- ============================================================================
--
-- The onboarding flow stores its completion marker in tenants.config.
-- No new column needed — config is already a jsonb that holds
-- owner_name, business_name, etc.
--
-- We do TWO things here:
--   1. Backfill the demo tenant so we don't get sent to onboarding ourselves
--      (we already populated owner_name / business_name manually).
--   2. Document the contract: tenants.config keys used by onboarding are:
--        - owner_name              text  (Hebrew first name)
--        - business_name           text  (display name of the business)
--        - onboarding_completed_at timestamptz iso string
--      And tenants.business_owner_gender + tenants.vertical are top-level
--      columns set during onboarding too.
-- ============================================================================

-- Backfill the demo tenant so this migration leaves us in a known-good state.
update public.tenants
set config = config || jsonb_build_object(
  'onboarding_completed_at', to_jsonb(now()::text)
)
where id = '15ef2c6e-a064-49bf-9455-217ba937ccf2'
  and (config->>'onboarding_completed_at') is null;

do $$
declare
  v_marked integer;
begin
  select count(*) into v_marked
  from public.tenants
  where id = '15ef2c6e-a064-49bf-9455-217ba937ccf2'
    and (config->>'onboarding_completed_at') is not null;

  raise notice 'Demo tenant onboarding marker present: % (expected 1)', v_marked;
end $$;
