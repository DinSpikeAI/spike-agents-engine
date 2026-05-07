-- ============================================================================
-- Spike Agents Engine — Sub-stage 1.15
-- File: 023_growth_agent.sql
-- Purpose: Schema for the 10th and final agent — Growth Agent.
--
-- The Growth Agent does two things:
--   1. Reactivation — flag dormant customers (45-60+ days no activity)
--   2. Lead Discovery — surface unanswered questions and unresolved interest
--
-- Sources:
--   C — Internal interactions already in DB (events, drafts, hot_leads)
--   G — Instagram + Facebook Messenger DMs received on the tenant's pages
--       (new — populated via Meta webhook in Sprint 3)
--
-- Output: a list of opportunities, each with a why-explanation and a
-- ready-to-send draft. Owner approves → message sent → outcome tracked.
--
-- Cron schedule: Sunday 07:00 IST + on-demand button (Pro tier only).
--
-- Tables introduced here:
--   1. meta_inbox_messages    — incoming IG/FB DMs
--   2. growth_runs             — per-execution telemetry (cost, tokens, status)
--   3. growth_candidates       — opportunities waiting for owner decision
--   4. growth_outcomes         — outcome history for ROI rollups
--
-- All tables are tenant-isolated via Postgres RLS (Israeli Amendment 13
-- requirement, in force since Aug 2025).
--
-- Run order: 23rd (after 022_integrations_whatsapp_phone_lookup.sql).
-- ============================================================================

-- ============================================================================
-- TABLE: meta_inbox_messages
--
-- One row per inbound Instagram/Facebook DM. Append-only from the webhook;
-- updated only when the owner replies (was_replied flag) or when the
-- Growth Haiku scan classifies the message (classification field).
--
-- We keep this dedicated (not in `events`) because:
--   - events is WhatsApp-shaped and Watcher-owned
--   - Meta DMs have a different lifecycle (scanned weekly by Growth, not
--     real-time by Watcher)
--   - Future agents may join on this table without polluting the WhatsApp
--     event stream
-- ============================================================================

create table public.meta_inbox_messages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,

  -- Source identification
  channel         text not null check (channel in ('instagram', 'facebook')),
  platform_msg_id text not null,                  -- Meta's message ID (dedup key)
  conversation_id text not null,                  -- Meta's conversation/thread ID

  -- Sender (the prospect who messaged)
  sender_platform_id  text not null,              -- IG user ID / FB user ID
  sender_username     text,                       -- @handle (IG) or display name (FB)
  sender_display_name text,

  -- Message content
  message_text    text,
  message_type    text not null check (
                    message_type in ('text', 'image', 'voice', 'video', 'sticker', 'other')
                  ),
  received_at     timestamptz not null,

  -- Owner response state (set by webhook when owner replies via IG/FB)
  was_replied     boolean not null default false,
  replied_at      timestamptz,

  -- Lead qualification (filled by Haiku scan in Growth pipeline)
  classification     text check (
                       classification in ('lead', 'question', 'compliment', 'spam', 'other')
                     ),
  classification_at  timestamptz,

  created_at      timestamptz not null default now(),

  unique (tenant_id, platform_msg_id)
);

comment on table public.meta_inbox_messages is
  'Inbound IG/FB Messenger DMs received on tenant''s own pages. Source G of Growth Agent.';

create index idx_meta_inbox_tenant_unreplied
  on public.meta_inbox_messages (tenant_id, was_replied, received_at desc)
  where was_replied = false;

create index idx_meta_inbox_tenant_class
  on public.meta_inbox_messages (tenant_id, classification, received_at desc);

-- ============================================================================
-- TABLE: growth_runs
--
-- One row per Growth Agent execution (cron OR on-demand). Tracks status,
-- token usage, cost, and stage-by-stage progress for observability.
-- ============================================================================

create table public.growth_runs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,

  trigger         text not null check (trigger in ('cron', 'on_demand')),
  triggered_by    uuid references auth.users(id),  -- null for cron

  -- Pipeline state
  status          text not null check (status in ('running', 'succeeded', 'failed', 'partial')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  error_message   text,

  -- Stage 1 metrics (Haiku scan)
  scanned_count            integer,
  candidates_count         integer,
  haiku_input_tokens       integer,
  haiku_output_tokens      integer,
  haiku_cost_ils           numeric(10, 4),

  -- Stage 2 metrics (Sonnet draft)
  drafts_count             integer,
  sonnet_input_tokens      integer,
  sonnet_output_tokens     integer,
  sonnet_cache_read_tokens integer,
  sonnet_cost_ils          numeric(10, 4),

  total_cost_ils           numeric(10, 4),

  created_at      timestamptz not null default now()
);

comment on table public.growth_runs is
  'Per-execution telemetry for the Growth Agent. One row per cron or on-demand run.';

create index idx_growth_runs_tenant_recent
  on public.growth_runs (tenant_id, started_at desc);

-- ============================================================================
-- TABLE: growth_candidates
--
-- The heart of the agent. One row per opportunity surfaced to the owner.
--
-- Each candidate is either:
--   - An internal customer (customer_phone is set, meta_inbox_msg_id is null)
--   - A Meta DM sender (meta_inbox_msg_id is set, customer_phone is null)
--
-- Status flow:
--   pending → approved (owner clicked "אשר ושלח")
--   pending → rejected (owner clicked "דחה")
--   pending → expired (14 days passed without decision)
--   approved → closed (owner later clicked "סגרתי" with optional value)
-- ============================================================================

create table public.growth_candidates (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  run_id          uuid not null references public.growth_runs(id) on delete cascade,

  -- Candidate identity (exactly one of these must be set)
  customer_phone     text,
  meta_inbox_msg_id  uuid references public.meta_inbox_messages(id) on delete set null,

  -- Opportunity classification
  source             text not null check (source in ('interactions', 'instagram', 'facebook')),
  goal               text not null check (goal in ('reactivation', 'lead_discovery')),

  -- Scoring (Haiku output)
  priority_score     integer not null check (priority_score between 1 and 100),
  why_explanation    text not null,

  -- Display info (used by the dashboard)
  candidate_label    text not null,          -- "דנה כהן" or "@avi_levi"
  candidate_subtitle text,                   -- "VIP נעלם 90 יום" / "IG · שאל מחיר"

  -- Generated draft (Sonnet output)
  draft_message      text not null,
  draft_channel      text not null check (draft_channel in ('whatsapp', 'instagram', 'facebook')),

  -- Decision tracking
  status             text not null default 'pending' check (
                       status in ('pending', 'approved', 'rejected', 'closed', 'expired')
                     ),
  decided_at         timestamptz,
  decided_by         uuid references auth.users(id),

  -- ROI self-report (set when owner clicks "סגרתי")
  closed_at          timestamptz,
  closed_value_ils   numeric(10, 2),

  expires_at         timestamptz not null default (now() + interval '14 days'),
  created_at         timestamptz not null default now(),

  -- Identity invariant: exactly one source identifier
  check (
    (customer_phone is not null and meta_inbox_msg_id is null) or
    (customer_phone is null and meta_inbox_msg_id is not null)
  )
);

comment on table public.growth_candidates is
  'Growth Agent opportunities awaiting owner decision. Drafts → approval → outcome.';

create index idx_growth_candidates_tenant_active
  on public.growth_candidates (tenant_id, status, priority_score desc)
  where status = 'pending';

create index idx_growth_candidates_tenant_closed
  on public.growth_candidates (tenant_id, closed_at desc)
  where status = 'closed';

create index idx_growth_candidates_run
  on public.growth_candidates (run_id);

-- ============================================================================
-- TABLE: growth_outcomes
--
-- Append-only audit log of every state transition for a candidate.
-- Used to compute weekly/monthly ROI rollups for the dashboard stat strip.
--
-- Why a separate table (not just status field on growth_candidates):
--   - We want the FULL history per candidate (sent → replied → closed)
--   - Easy time-series queries ("how many closes last week?")
--   - Survives candidate row deletion if we ever need to (we don't, but
--     the audit shape is right)
-- ============================================================================

create table public.growth_outcomes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  candidate_id    uuid not null references public.growth_candidates(id) on delete cascade,

  outcome_type    text not null check (outcome_type in (
                    'sent', 'replied', 'closed', 'rejected_by_owner', 'expired'
                  )),

  reported_value_ils numeric(10, 2),       -- only set for outcome_type='closed'
  reported_at        timestamptz not null default now()
);

comment on table public.growth_outcomes is
  'Append-only audit log of Growth candidate state transitions. Powers ROI rollups.';

create index idx_growth_outcomes_tenant
  on public.growth_outcomes (tenant_id, reported_at desc);

create index idx_growth_outcomes_candidate
  on public.growth_outcomes (candidate_id, reported_at desc);

-- ============================================================================
-- RLS — Israeli Amendment 13 requires database-level tenant isolation.
-- All four tables follow Spike's standard pattern from 003_rls.sql:
--   - select via public.current_tenant_id()  (cached per query)
--   - super_admin (Dean) bypass via public.is_super_admin()
-- ============================================================================

alter table public.meta_inbox_messages enable row level security;
alter table public.growth_runs         enable row level security;
alter table public.growth_candidates   enable row level security;
alter table public.growth_outcomes     enable row level security;

-- meta_inbox_messages
create policy "meta_inbox_tenant_select" on public.meta_inbox_messages
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    or (select public.is_super_admin())
  );

create policy "meta_inbox_tenant_modify" on public.meta_inbox_messages
  for all to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    or (select public.is_super_admin())
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    or (select public.is_super_admin())
  );

-- growth_runs
create policy "growth_runs_tenant_select" on public.growth_runs
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    or (select public.is_super_admin())
  );

create policy "growth_runs_tenant_modify" on public.growth_runs
  for all to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    or (select public.is_super_admin())
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    or (select public.is_super_admin())
  );

-- growth_candidates
create policy "growth_candidates_tenant_select" on public.growth_candidates
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    or (select public.is_super_admin())
  );

create policy "growth_candidates_tenant_modify" on public.growth_candidates
  for all to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    or (select public.is_super_admin())
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    or (select public.is_super_admin())
  );

-- growth_outcomes
create policy "growth_outcomes_tenant_select" on public.growth_outcomes
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    or (select public.is_super_admin())
  );

create policy "growth_outcomes_tenant_modify" on public.growth_outcomes
  for all to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    or (select public.is_super_admin())
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    or (select public.is_super_admin())
  );
