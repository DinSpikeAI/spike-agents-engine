-- ============================================================================
-- Spike Agents Engine — Schema 2.0
-- File: 003_rls.sql
-- Purpose: Enable RLS on all tables + policies using tenant_id from JWT
-- Run order: THIRD (after 002_schema.sql)
--
-- Performance pattern (per Supabase docs):
--   Wrap auth.jwt() / auth.uid() in (select ...) so planner uses initPlan
--   (evaluates once per query, not once per row).
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS for RLS
-- Marked stable + security definer so the planner caches results and policies
-- can call them safely.
-- ============================================================================

-- Read tenant_id from the JWT app_metadata claim
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select nullif(
    (select auth.jwt() #>> '{app_metadata,tenant_id}'),
    ''
  )::uuid
$$;

-- Read super_admin flag from JWT (Dean only)
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean,
    false
  )
$$;

-- Get all tenant_ids the user is a member of (for tenant switcher UI)
create or replace function public.user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.memberships where user_id = (select auth.uid())
$$;

grant execute on function public.current_tenant_id() to authenticated, anon;
grant execute on function public.is_super_admin()    to authenticated, anon;
grant execute on function public.user_tenant_ids()   to authenticated;

-- ============================================================================
-- ENABLE RLS on all tables
-- ============================================================================

alter table public.tenants            enable row level security;
alter table public.user_settings      enable row level security;
alter table public.memberships        enable row level security;
alter table public.agents             enable row level security;
alter table public.agent_prompts      enable row level security;
alter table public.tenant_agents      enable row level security;
alter table public.agent_runs         enable row level security;
alter table public.drafts             enable row level security;
alter table public.integrations       enable row level security;
alter table public.notifications      enable row level security;
alter table public.events             enable row level security;
alter table public.cost_ledger        enable row level security;
alter table public.system_alerts      enable row level security;
alter table public.outbox             enable row level security;
alter table public.idempotency_keys   enable row level security;
alter table public.audit_log          enable row level security;

-- ============================================================================
-- POLICIES: tenants
-- Users see only the tenant they're a member of. Super admin sees all.
-- ============================================================================

create policy "tenants_select"            on public.tenants for select to authenticated
  using ( id = (select public.current_tenant_id()) or (select public.is_super_admin()) );

create policy "tenants_update_owner"      on public.tenants for update to authenticated
  using (
    id in (
      select tenant_id from public.memberships
      where user_id = (select auth.uid()) and role in ('owner', 'admin')
    )
  )
  with check (
    id in (
      select tenant_id from public.memberships
      where user_id = (select auth.uid()) and role in ('owner', 'admin')
    )
  );

create policy "tenants_admin_all"         on public.tenants for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- POLICIES: user_settings
-- A user can only read/write their own settings.
-- ============================================================================

create policy "user_settings_self"        on public.user_settings for all to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

create policy "user_settings_admin"       on public.user_settings for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- POLICIES: memberships
-- Users see their own memberships; tenant owners see all members of their tenant.
-- ============================================================================

create policy "memberships_select"        on public.memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or tenant_id in (
      select tenant_id from public.memberships
      where user_id = (select auth.uid()) and role in ('owner', 'admin')
    )
    or (select public.is_super_admin())
  );

create policy "memberships_admin_all"     on public.memberships for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- POLICIES: agents (global, read-only for tenants)
-- ============================================================================

create policy "agents_select_all"         on public.agents for select to authenticated
  using ( true );

create policy "agents_admin_all"          on public.agents for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- POLICIES: agent_prompts (global, read-only for tenants)
-- ============================================================================

create policy "agent_prompts_select_all"  on public.agent_prompts for select to authenticated
  using ( true );

create policy "agent_prompts_admin_all"   on public.agent_prompts for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- POLICIES: tenant_agents
-- ============================================================================

create policy "tenant_agents_select"      on public.tenant_agents for select to authenticated
  using ( tenant_id = (select public.current_tenant_id()) );

create policy "tenant_agents_update_admin" on public.tenant_agents for update to authenticated
  using (
    tenant_id in (
      select tenant_id from public.memberships
      where user_id = (select auth.uid()) and role in ('owner', 'admin')
    )
  )
  with check (
    tenant_id in (
      select tenant_id from public.memberships
      where user_id = (select auth.uid()) and role in ('owner', 'admin')
    )
  );

create policy "tenant_agents_admin_all"   on public.tenant_agents for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- POLICIES: agent_runs (read-only for tenants; service_role writes via SDK)
-- ============================================================================

create policy "agent_runs_select"         on public.agent_runs for select to authenticated
  using ( tenant_id = (select public.current_tenant_id()) );

create policy "agent_runs_admin_all"      on public.agent_runs for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- POLICIES: drafts (members can approve/reject)
-- ============================================================================

create policy "drafts_select"             on public.drafts for select to authenticated
  using ( tenant_id = (select public.current_tenant_id()) );

create policy "drafts_update"             on public.drafts for update to authenticated
  using ( tenant_id = (select public.current_tenant_id()) )
  with check ( tenant_id = (select public.current_tenant_id()) );

create policy "drafts_admin_all"          on public.drafts for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- POLICIES: integrations (admin role only — sensitive OAuth tokens)
-- ============================================================================

create policy "integrations_select"       on public.integrations for select to authenticated
  using ( tenant_id = (select public.current_tenant_id()) );

create policy "integrations_admin_only"   on public.integrations for all to authenticated
  using (
    tenant_id in (
      select tenant_id from public.memberships
      where user_id = (select auth.uid()) and role in ('owner', 'admin')
    )
    or (select public.is_super_admin())
  )
  with check (
    tenant_id in (
      select tenant_id from public.memberships
      where user_id = (select auth.uid()) and role in ('owner', 'admin')
    )
    or (select public.is_super_admin())
  );

-- ============================================================================
-- POLICIES: notifications (per-user with tenant scope)
-- ============================================================================

create policy "notifications_select"      on public.notifications for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (user_id = (select auth.uid()) or user_id is null)
  );

create policy "notifications_update_self" on public.notifications for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (user_id = (select auth.uid()) or user_id is null)
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (user_id = (select auth.uid()) or user_id is null)
  );

create policy "notifications_admin_all"   on public.notifications for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- POLICIES: events (super_admin only — service_role writes via SDK)
-- ============================================================================

create policy "events_admin_all"          on public.events for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- POLICIES: cost_ledger (read-only for tenants)
-- ============================================================================

create policy "cost_ledger_select"        on public.cost_ledger for select to authenticated
  using ( tenant_id = (select public.current_tenant_id()) );

create policy "cost_ledger_admin_all"     on public.cost_ledger for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- POLICIES: system_alerts (super_admin only)
-- ============================================================================

create policy "system_alerts_admin_only"  on public.system_alerts for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- POLICIES: outbox (super_admin only — internal infrastructure)
-- ============================================================================

create policy "outbox_admin_only"         on public.outbox for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- POLICIES: idempotency_keys (super_admin only — internal)
-- ============================================================================

create policy "idempotency_keys_admin"    on public.idempotency_keys for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- POLICIES: audit_log (read-only for tenant owners + super_admin)
-- ============================================================================

create policy "audit_log_select_owner"    on public.audit_log for select to authenticated
  using (
    tenant_id in (
      select tenant_id from public.memberships
      where user_id = (select auth.uid()) and role in ('owner', 'admin')
    )
  );

create policy "audit_log_admin_all"       on public.audit_log for all to authenticated
  using ( (select public.is_super_admin()) ) with check ( (select public.is_super_admin()) );

-- ============================================================================
-- DONE — RLS locked down. Next: 004_grants.sql for role privileges.
-- ============================================================================
