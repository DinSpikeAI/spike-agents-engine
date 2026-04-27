-- ============================================================================
-- Spike Agents Engine — Role Grants
-- File: 004_grants.sql
-- Purpose: Grant proper privileges to anon, authenticated, service_role
-- Run order: FOURTH (after 003_seed.sql)
--
-- Why this exists:
-- We disabled "Automatically expose new tables and functions" during project
-- creation for security. As a side effect, Supabase did NOT grant base
-- privileges on our public schema to the API roles. We do it manually here.
--
-- This is a security trade-off in OUR favor: we control exactly which tables
-- get API exposure rather than auto-exposing everything.
--
-- Security model:
--   - service_role: ALL on everything (RLS-bypassed by SDK)
--   - authenticated: SELECT/INSERT/UPDATE/DELETE (RLS filters which rows)
--   - anon: nothing (we don't expose any tables to unauthenticated users)
-- ============================================================================

-- ============================================================================
-- SCHEMA USAGE (required to access ANY object in the schema)
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- ============================================================================
-- service_role: full privileges on existing objects
-- (RLS is bypassed when using the secret key)
-- ============================================================================

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ============================================================================
-- authenticated: standard CRUD privileges on existing tables
-- (RLS policies filter row access on top of these)
-- ============================================================================

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ============================================================================
-- anon: explicitly grant nothing on tables.
-- We do NOT have any tables that should be accessible without authentication.
-- (Anon role only needs USAGE on schema for auth.users lookups, granted above.)
-- ============================================================================

-- ============================================================================
-- DEFAULT PRIVILEGES (for tables created in the future)
-- This ensures the same grants apply to ANY new table we create later,
-- without needing to re-run grants every time.
-- ============================================================================

alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;

-- ============================================================================
-- VERIFY (run manually after this script)
-- ============================================================================

-- select grantee, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public' and table_name = 'agents';
--
-- Expected: rows for service_role (ALL), authenticated (SELECT/INSERT/UPDATE/DELETE)

-- ============================================================================
-- DONE — Grants in place. The verify-supabase.js script should now work.
-- ============================================================================
