-- ============================================================================
-- Spike Agents Engine — Schema 2.0
-- File: 002_schema.sql
-- Purpose: Create all 16 tables with research amendments
-- Run order: SECOND (after 001_reset.sql)
--
-- Changes from v1:
--   - clients → tenants (avoids JWT collision with Supabase OAuth client_id)
--   - client_agents → tenant_agents
--   - cost_ledger now has kind (reserve/settle/refund) for atomic spend cap
--   - tenants now tracks spend_reserved separately from spend_used
--   - NEW: user_settings (active_tenant_id for multi-tenant users)
--   - NEW: outbox (reliable event delivery to QStash/webhooks)
--   - NEW: idempotency_keys (HTTP-level dedup)
--   - NEW: audit_log (Israeli A13 privacy law compliance)
--   - agents now has default_thinking_budget (Sonnet 4.6 + extended thinking)
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================================
-- TABLE: tenants
-- The multi-tenant root. Each row = one Israeli SMB customer.
-- spend_used + spend_reserved is the "committed total"; cap blocks at sum.
-- ============================================================================

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type text,
  status text not null default 'trial'
    check (status in ('trial', 'active', 'paused', 'churned')),
  config jsonb not null default '{}'::jsonb,

  -- Spend cap (atomic via reserve_spend / settle_spend / refund_spend functions)
  spend_cap_ils numeric(10,2) not null default 250,
  spend_used_ils numeric(10,4) not null default 0      -- already settled
    check (spend_used_ils >= 0),
  spend_reserved_ils numeric(10,4) not null default 0  -- reserved, not yet settled
    check (spend_reserved_ils >= 0),
  spend_period_start date not null default date_trunc('month', now())::date,

  -- Hard ceiling: used + reserved cannot exceed cap
  constraint cap_not_exceeded check (spend_used_ils + spend_reserved_ils <= spend_cap_ils),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index tenants_status_idx on public.tenants(status);

-- ============================================================================
-- TABLE: user_settings
-- Per-user app state. active_tenant_id is read by Custom Access Token Hook.
-- ============================================================================

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_tenant_id uuid references public.tenants(id) on delete set null,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================================
-- TABLE: memberships
-- Many-to-many: a user can be member of multiple tenants (consultants etc.)
-- ============================================================================

create table public.memberships (
  user_id uuid references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  is_super_admin boolean not null default false,  -- Dean only
  created_at timestamptz default now(),
  primary key (user_id, tenant_id)
);

create index memberships_user_id_idx   on public.memberships(user_id);
create index memberships_tenant_id_idx on public.memberships(tenant_id);

-- ============================================================================
-- TABLE: agent_prompts
-- Versioned prompt templates. output_schema = native Anthropic JSON Schema
-- (passed to output_config.format, NOT tool_use).
-- ============================================================================

create table public.agent_prompts (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,        -- FK added below after agents table exists
  version int not null default 1,
  template text not null,        -- system prompt with {{VARIABLES}}
  output_schema jsonb not null default '{}'::jsonb,  -- native JSON Schema
  cache_breakpoints jsonb not null default '[]'::jsonb,  -- which parts to cache
  created_at timestamptz default now(),
  unique (agent_id, version)
);

-- ============================================================================
-- TABLE: agents
-- The 9 agent definitions (system-level, not per-tenant).
-- default_thinking_budget = tokens for extended thinking (NULL = no thinking).
-- ============================================================================

create table public.agents (
  id text primary key,
  name_he text not null,
  description_he text,
  default_model text not null,
  default_thinking_budget int,                          -- NULL = no extended thinking
  default_cache_ttl text not null default '1h',         -- explicit per research
  default_schedule text not null,                       -- cron expression
  default_prompt_id uuid references public.agent_prompts(id),
  icon text,
  display_order int default 0
);

-- Now back-link agent_prompts → agents
alter table public.agent_prompts
  add constraint agent_prompts_agent_id_fkey
  foreign key (agent_id) references public.agents(id) on delete cascade;

-- ============================================================================
-- TABLE: tenant_agents
-- Per-tenant agent config (which are enabled, schedule overrides, etc).
-- ============================================================================

create table public.tenant_agents (
  tenant_id uuid references public.tenants(id) on delete cascade,
  agent_id text references public.agents(id) on delete cascade,
  enabled boolean not null default true,
  schedule_override text,
  model_override text,
  thinking_budget_override int,
  prompt_overrides jsonb default '{}'::jsonb,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz default now(),
  primary key (tenant_id, agent_id)
);

create index tenant_agents_next_run_idx
  on public.tenant_agents(next_run_at)
  where enabled = true;

-- ============================================================================
-- TABLE: agent_runs
-- Every execution. id chosen by producer for idempotency.
-- ============================================================================

create table public.agent_runs (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  agent_id text not null references public.agents(id),
  status text not null
    check (status in ('queued', 'running', 'succeeded', 'failed', 'skipped', 'cancelled')),
  started_at timestamptz default now(),
  finished_at timestamptz,
  input jsonb,
  output jsonb,
  error_message text,
  model_used text,
  thinking_used boolean default false,
  usage jsonb,           -- {input_tokens, output_tokens, cache_read, cache_create_5m, cache_create_1h}
  cost_ils numeric(10,4)
);

create index agent_runs_tenant_started_idx
  on public.agent_runs(tenant_id, started_at desc);
create index agent_runs_status_idx
  on public.agent_runs(status)
  where status in ('queued', 'running');

-- Reaper helper: claim only queued rows older than threshold
create index agent_runs_queued_age_idx
  on public.agent_runs(started_at)
  where status = 'queued';

-- ============================================================================
-- TABLE: drafts
-- Drafts awaiting owner approval (review replies, social posts, follow-ups).
-- ============================================================================

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id),
  agent_id text references public.agents(id),
  type text not null,                                   -- review_reply, social_post, sales_email, ...
  content jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired', 'sent')),
  context jsonb,                                        -- source data (review text, lead info)
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  external_target jsonb,                                -- {channel, recipient, ...} for sending
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '7 days'
);

create index drafts_tenant_status_idx
  on public.drafts(tenant_id, status);
create index drafts_pending_idx
  on public.drafts(tenant_id, created_at desc)
  where status = 'pending';

-- ============================================================================
-- TABLE: integrations
-- Per-tenant OAuth tokens / API credentials, encrypted in Supabase Vault.
-- ============================================================================

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,                               -- google_business, meta, sheets, ...
  status text not null default 'connected'
    check (status in ('connected', 'expired', 'revoked', 'error')),
  vault_token_id uuid,                                  -- → vault.secrets
  vault_refresh_id uuid,
  scopes text[],
  metadata jsonb,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, provider)
);

create index integrations_tenant_idx on public.integrations(tenant_id);

-- ============================================================================
-- TABLE: notifications
-- In-app notifications (bell icon).
-- ============================================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id),               -- NULL = all members
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
-- Inbound webhook events. id from provider for idempotency (GBP, Meta, Stripe).
-- ============================================================================

create table public.events (
  id text primary key,
  tenant_id uuid references public.tenants(id),
  provider text,
  event_type text,
  payload jsonb,
  received_at timestamptz default now()
);

create index events_tenant_idx on public.events(tenant_id, received_at desc);

-- ============================================================================
-- TABLE: cost_ledger
-- Every spend movement: reserve / settle / refund.
-- Atomic spend cap relies on this + the unique partial indexes below.
-- ============================================================================

create table public.cost_ledger (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id),
  agent_id text references public.agents(id),

  kind text not null check (kind in ('reserve', 'settle', 'refund')),
  amount_ils numeric(10,6) not null,                    -- positive=debit, negative=credit

  -- Token breakdown (only for 'settle')
  model text,
  input_tokens int,
  output_tokens int,
  cache_read_tokens int default 0,
  cache_create_5m_tokens int default 0,
  cache_create_1h_tokens int default 0,

  metadata jsonb,
  created_at timestamptz default now()
);

-- One settle per run, one refund per run (prevents double-charge / double-refund)
create unique index cost_ledger_settle_uniq
  on public.cost_ledger(agent_run_id) where kind = 'settle' and agent_run_id is not null;
create unique index cost_ledger_refund_uniq
  on public.cost_ledger(agent_run_id) where kind = 'refund' and agent_run_id is not null;

create index cost_ledger_tenant_created_idx
  on public.cost_ledger(tenant_id, created_at desc);

-- ============================================================================
-- TABLE: system_alerts
-- Internal alerts (Dean only — Telegram + admin dashboard).
-- ============================================================================

create table public.system_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text check (severity in ('info', 'warn', 'error', 'critical')),
  tenant_id uuid,
  message text,
  metadata jsonb,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create index system_alerts_unresolved_idx
  on public.system_alerts(created_at desc)
  where resolved_at is null;

-- ============================================================================
-- TABLE: outbox
-- Reliable event delivery: write inside DB transaction, drain to QStash.
-- Pattern: insert outbox row in same tx as state change → relay process drains.
-- ============================================================================

create table public.outbox (
  id bigserial primary key,
  tenant_id uuid,                                       -- NULL = system event
  event_type text not null,                             -- run.completed, draft.created, ...
  payload jsonb not null,
  destination text not null,                            -- qstash, webhook, telegram_internal
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'dead')),
  attempts int not null default 0,
  next_attempt_at timestamptz default now(),
  last_error text,
  created_at timestamptz default now(),
  sent_at timestamptz
);

-- Drain query: pending OR retry-ready, FOR UPDATE SKIP LOCKED LIMIT 50
create index outbox_drain_idx
  on public.outbox(next_attempt_at)
  where status = 'pending';

-- ============================================================================
-- TABLE: idempotency_keys
-- HTTP-level dedup for webhook handlers + form submissions.
-- ============================================================================

create table public.idempotency_keys (
  key text primary key,
  tenant_id uuid,
  request_hash text not null,                           -- SHA-256 of request body
  response jsonb,                                       -- cached response (null until completed)
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'failed')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz default now()
);

create index idempotency_keys_expires_idx on public.idempotency_keys(expires_at);

-- ============================================================================
-- TABLE: audit_log
-- Israeli A13 privacy law (Aug 2025) compliance — track sensitive operations.
-- 7-year retention required by extended limitation period.
-- ============================================================================

create table public.audit_log (
  id bigserial primary key,
  tenant_id uuid,
  user_id uuid references auth.users(id),
  action text not null,                                 -- tenant.create, integration.connect, ...
  resource_type text,
  resource_id text,
  before_state jsonb,
  after_state jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz default now()
);

create index audit_log_tenant_created_idx on public.audit_log(tenant_id, created_at desc);
create index audit_log_user_created_idx   on public.audit_log(user_id,   created_at desc);
create index audit_log_action_idx         on public.audit_log(action,    created_at desc);

-- ============================================================================
-- TRIGGERS: updated_at maintenance
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

create trigger tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

create trigger integrations_updated_at
  before update on public.integrations
  for each row execute function public.set_updated_at();

-- ============================================================================
-- DONE — 16 tables, 0 policies.
-- Next: 003_rls.sql to lock them down.
-- ============================================================================
