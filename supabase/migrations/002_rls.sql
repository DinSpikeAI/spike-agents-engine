-- ============================================================================
-- Spike Agents Engine — RLS Policies
-- File: 002_rls.sql
-- Purpose: Enable Row Level Security on all tenant-scoped tables + policies
-- Run order: SECOND (after 001_schema.sql)
-- ============================================================================

-- ============================================================================
-- ENABLE RLS ON ALL TENANT-SCOPED TABLES
-- ============================================================================

alter table public.clients          enable row level security;
alter table public.memberships      enable row level security;
alter table public.client_agents    enable row level security;
alter table public.agent_runs       enable row level security;
alter table public.drafts           enable row level security;
alter table public.integrations     enable row level security;
alter table public.notifications    enable row level security;
alter table public.events           enable row level security;
alter table public.cost_ledger      enable row level security;

-- system_alerts is admin-only, separate handling below
alter table public.system_alerts    enable row level security;

-- agents and agent_prompts are global (read-only for authenticated users)
alter table public.agents           enable row level security;
alter table public.agent_prompts    enable row level security;

-- ============================================================================
-- POLICIES: clients
-- Users can read their own clients. Only super admins can update/delete.
-- ============================================================================

create policy "clients_select_member" on public.clients
  for select to authenticated
  using ( id in (select public.user_client_ids()) );

create policy "clients_update_owner" on public.clients
  for update to authenticated
  using (
    id in (
      select client_id from public.memberships
      where user_id = (select auth.uid())
        and role in ('owner', 'admin')
    )
  )
  with check (
    id in (
      select client_id from public.memberships
      where user_id = (select auth.uid())
        and role in ('owner', 'admin')
    )
  );

-- Super admin (Dean) can do anything
create policy "clients_admin_all" on public.clients
  for all to authenticated
  using ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true )
  with check ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true );

-- ============================================================================
-- POLICIES: memberships
-- Users see their own memberships. Owners see all members of their clients.
-- ============================================================================

create policy "memberships_select_self" on public.memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or client_id in (
      select client_id from public.memberships
      where user_id = (select auth.uid())
        and role in ('owner', 'admin')
    )
  );

create policy "memberships_admin_all" on public.memberships
  for all to authenticated
  using ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true )
  with check ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true );

-- ============================================================================
-- POLICIES: agents (global, read-only)
-- ============================================================================

create policy "agents_select_all" on public.agents
  for select to authenticated
  using ( true );

create policy "agents_admin_all" on public.agents
  for all to authenticated
  using ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true )
  with check ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true );

-- ============================================================================
-- POLICIES: agent_prompts (global, read-only)
-- ============================================================================

create policy "agent_prompts_select_all" on public.agent_prompts
  for select to authenticated
  using ( true );

create policy "agent_prompts_admin_all" on public.agent_prompts
  for all to authenticated
  using ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true )
  with check ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true );

-- ============================================================================
-- POLICIES: client_agents
-- ============================================================================

create policy "client_agents_select_member" on public.client_agents
  for select to authenticated
  using ( client_id in (select public.user_client_ids()) );

create policy "client_agents_update_admin" on public.client_agents
  for update to authenticated
  using (
    client_id in (
      select client_id from public.memberships
      where user_id = (select auth.uid())
        and role in ('owner', 'admin')
    )
  )
  with check (
    client_id in (
      select client_id from public.memberships
      where user_id = (select auth.uid())
        and role in ('owner', 'admin')
    )
  );

create policy "client_agents_admin_all" on public.client_agents
  for all to authenticated
  using ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true )
  with check ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true );

-- ============================================================================
-- POLICIES: agent_runs (read-only for tenants; service_role writes)
-- ============================================================================

create policy "agent_runs_select_member" on public.agent_runs
  for select to authenticated
  using ( client_id in (select public.user_client_ids()) );

create policy "agent_runs_admin_all" on public.agent_runs
  for all to authenticated
  using ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true )
  with check ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true );

-- ============================================================================
-- POLICIES: drafts
-- ============================================================================

create policy "drafts_select_member" on public.drafts
  for select to authenticated
  using ( client_id in (select public.user_client_ids()) );

create policy "drafts_update_member" on public.drafts
  for update to authenticated
  using ( client_id in (select public.user_client_ids()) )
  with check ( client_id in (select public.user_client_ids()) );

create policy "drafts_admin_all" on public.drafts
  for all to authenticated
  using ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true )
  with check ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true );

-- ============================================================================
-- POLICIES: integrations
-- ============================================================================

create policy "integrations_select_member" on public.integrations
  for select to authenticated
  using ( client_id in (select public.user_client_ids()) );

create policy "integrations_admin_only" on public.integrations
  for all to authenticated
  using (
    client_id in (
      select client_id from public.memberships
      where user_id = (select auth.uid())
        and role in ('owner', 'admin')
    )
    or ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true
  )
  with check (
    client_id in (
      select client_id from public.memberships
      where user_id = (select auth.uid())
        and role in ('owner', 'admin')
    )
    or ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true
  );

-- ============================================================================
-- POLICIES: notifications
-- ============================================================================

create policy "notifications_select_self" on public.notifications
  for select to authenticated
  using (
    (user_id = (select auth.uid()) or user_id is null)
    and client_id in (select public.user_client_ids())
  );

create policy "notifications_update_self" on public.notifications
  for update to authenticated
  using (
    (user_id = (select auth.uid()) or user_id is null)
    and client_id in (select public.user_client_ids())
  )
  with check (
    (user_id = (select auth.uid()) or user_id is null)
    and client_id in (select public.user_client_ids())
  );

create policy "notifications_admin_all" on public.notifications
  for all to authenticated
  using ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true )
  with check ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true );

-- ============================================================================
-- POLICIES: events (no tenant access; service-role only)
-- ============================================================================

create policy "events_admin_all" on public.events
  for all to authenticated
  using ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true )
  with check ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true );

-- ============================================================================
-- POLICIES: cost_ledger (read-only for tenants)
-- ============================================================================

create policy "cost_ledger_select_member" on public.cost_ledger
  for select to authenticated
  using ( client_id in (select public.user_client_ids()) );

create policy "cost_ledger_admin_all" on public.cost_ledger
  for all to authenticated
  using ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true )
  with check ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true );

-- ============================================================================
-- POLICIES: system_alerts (admin only)
-- ============================================================================

create policy "system_alerts_admin_only" on public.system_alerts
  for all to authenticated
  using ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true )
  with check ( ((select auth.jwt()) #>> '{app_metadata,is_super_admin}')::boolean = true );

-- ============================================================================
-- DONE — RLS ENABLED ON ALL TABLES, POLICIES IN PLACE
-- Next step: run 003_seed.sql to insert the 9 agents.
-- ============================================================================
