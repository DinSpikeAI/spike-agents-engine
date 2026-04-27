-- ============================================================================
-- Spike Agents Engine — Schema 2.0
-- File: 001_reset.sql
-- Purpose: Drop Schema 1.0 cleanly so we can rebuild with research amendments
-- Run order: FIRST (in fresh SQL editor tab)
--
-- This is safe because:
--   - 0 production tenants
--   - 0 real customer data
--   - Schema 1.0 archived in supabase/migrations/_archive/v1/
-- ============================================================================

-- Drop in reverse dependency order
drop table if exists public.cost_ledger        cascade;
drop table if exists public.system_alerts      cascade;
drop table if exists public.events             cascade;
drop table if exists public.notifications      cascade;
drop table if exists public.integrations       cascade;
drop table if exists public.drafts             cascade;
drop table if exists public.agent_runs         cascade;
drop table if exists public.client_agents      cascade;
drop table if exists public.agent_prompts      cascade;
drop table if exists public.agents             cascade;
drop table if exists public.memberships        cascade;
drop table if exists public.clients            cascade;

-- Drop helper functions from v1
drop function if exists public.user_client_ids()           cascade;
drop function if exists public.increment_spend(uuid, numeric) cascade;
drop function if exists public.set_updated_at()            cascade;

-- Drop the auth hook if it exists from v1 attempts
drop function if exists public.custom_access_token_hook(jsonb) cascade;

-- ============================================================================
-- DONE — clean slate. Run 002_schema.sql next.
-- ============================================================================
