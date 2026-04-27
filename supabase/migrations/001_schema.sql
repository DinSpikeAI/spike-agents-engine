-- ============================================================================
-- Spike Agents Engine — Schema 1.0
-- File: 001_schema.sql
-- Purpose: Create all 12 tables, indexes, and helper functions
-- Run order: FIRST
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================================
-- TABLE: clients
-- The multi-tenant root. Each row = one Israeli SMB customer.
-- ============================================================================

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'churned', 'trial')),
  config jsonb not null default '{}'::jsonb,
  spend_cap_ils numeric(10,2) not null default 250,
  spend_used_ils numeric(10,2) not null default 0,
  spend_period_start date not null default date_trunc('month', now())::date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index clients_status_idx on public.clients(status);

-- ============================================================================
-- TABLE: memberships
-- Links auth.users to clients with roles.
-- ============================================================================

create table public.memberships (
  user_id uuid references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz default now(),
  primary key (user_id, client_id)
);

create index memberships_user_id_idx on public.memberships(user_id);
create index memberships_client_id_idx on public.memberships(client_id);

-- ============================================================================
-- TABLE: agent_prompts
-- Versioned prompt templates per agent type.
-- ============================================================================

create table public.agent_prompts (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  version int not null default 1,
  template text not null,
  output_schema jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (agent_id, version)
);

-- ============================================================================
-- TABLE: agents
-- The 9 agent definitions (system-level, not per-client).
-- ============================================================================

create table public.agents (
  id text primary key,
  name_he text not null,
  description_he text,
  default_model text not null,
  default_schedule text not null,
  default_prompt_id uuid references public.agent_prompts(id),
  icon text,
  display_order int default 0
);

-- Now we can add the FK from agent_prompts back to agents
alter table public.agent_prompts
  add constraint agent_prompts_agent_id_fkey
  foreign key (agent_id) references public.agents(id) on delete cascade;

-- ============================================================================
-- TABLE: client_agents
-- Per-client config of agents (which are enabled, schedule overrides, etc).
-- ============================================================================

create table public.client_agents (
  client_id uuid references public.clients(id) on delete cascade,
  agent_id text references public.agents(id) on delete cascade,
  enabled boolean default true,
  schedule_override text,
  model_override text,
  prompt_overrides jsonb default '{}'::jsonb,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz default now(),
  primary key (client_id, agent_id)
);

create index client_agents_next_run_idx
  on public.client_agents(next_run_at)
  where enabled = true;

-- ============================================================================
-- TABLE: agent_runs
-- Every agent execution. Idempotent via UUID PK chosen by producer.
-- ============================================================================

create table public.agent_runs (
  id uuid primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  agent_id text not null references public.agents(id),
  status text not null
    check (status in ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  started_at timestamptz default now(),
  finished_at timestamptz,
  input jsonb,
  output jsonb,
  error_message text,
  model_used text,
  usage jsonb,
  cost_ils numeric(10,4)
);

create index agent_runs_client_started_idx
  on public.agent_runs(client_id, started_at desc);
create index agent_runs_status_idx
  on public.agent_runs(status)
  where status in ('pending', 'running');

-- ============================================================================
-- TABLE: drafts
-- Drafts awaiting owner approval (review replies, social posts, emails).
-- ============================================================================

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id),
  agent_id text references public.agents(id),
  type text not null,
  content jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired', 'sent')),
  context jsonb,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  external_target jsonb,
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '7 days'
);

create index drafts_client_status_idx
  on public.drafts(client_id, status);
create index drafts_pending_idx
  on public.drafts(client_id, created_at desc)
  where status = 'pending';

-- ============================================================================
-- TABLE: integrations
-- Per-client OAuth tokens / API credentials (Google Sheets, GBP, etc).
-- ============================================================================

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null,
  status text not null default 'connected'
    check (status in ('connected', 'expired', 'revoked', 'error')),
  vault_token_id uuid,
  vault_refresh_id uuid,
  scopes text[],
  metadata jsonb,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (client_id, provider)
);

create index integrations_client_idx on public.integrations(client_id);

-- ============================================================================
-- TABLE: notifications
-- In-app notifications for users (bell icon).
-- ============================================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid references auth.users(id),
  type text not null,
  title_he text not null,
  body_he text,
  link text,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index notifications_user_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;

-- ============================================================================
-- TABLE: events
-- Inbound webhook events (idempotency via provider's event id).
-- ============================================================================

create table public.events (
  id text primary key,
  client_id uuid references public.clients(id),
  provider text,
  event_type text,
  payload jsonb,
  received_at timestamptz default now()
);

create index events_client_idx on public.events(client_id, received_at desc);

-- ============================================================================
-- TABLE: cost_ledger
-- Every Anthropic API call. Source of truth for per-client cost.
-- ============================================================================

create table public.cost_ledger (
  id bigserial primary key,
  client_id uuid references public.clients(id) on delete cascade,
  agent_id text,
  agent_run_id uuid references public.agent_runs(id),
  model text,
  input_tokens int,
  output_tokens int,
  cache_read_tokens int default 0,
  cache_creation_tokens int default 0,
  cost_ils numeric(10,6),
  created_at timestamptz default now()
);

create index cost_ledger_client_created_idx
  on public.cost_ledger(client_id, created_at desc);

-- ============================================================================
-- TABLE: system_alerts
-- Internal alerts (Dean only — for Telegram bot + admin dashboard).
-- ============================================================================

create table public.system_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text check (severity in ('info', 'warn', 'error', 'critical')),
  client_id uuid,
  message text,
  metadata jsonb,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create index system_alerts_unresolved_idx
  on public.system_alerts(created_at desc)
  where resolved_at is null;

-- ============================================================================
-- HELPER FUNCTION: user_client_ids
-- Returns the client_ids that a user is a member of.
-- Used by RLS policies for fast membership checks.
-- ============================================================================

create or replace function public.user_client_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select client_id from public.memberships where user_id = auth.uid();
$$;

grant execute on function public.user_client_ids() to authenticated;

-- ============================================================================
-- HELPER FUNCTION: increment_spend
-- Atomically increment a client's spend counter.
-- Used by the agent runner after every Anthropic call.
-- ============================================================================

create or replace function public.increment_spend(
  _client uuid,
  _amount numeric
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.clients
     set spend_used_ils = spend_used_ils + _amount,
         updated_at = now()
   where id = _client;
$$;

-- ============================================================================
-- TRIGGER: update updated_at on clients
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create trigger integrations_updated_at
  before update on public.integrations
  for each row execute function public.set_updated_at();

-- ============================================================================
-- DONE — SCHEMA 1.0 CREATED
-- Next step: run 002_rls.sql to enable Row Level Security.
-- ============================================================================
