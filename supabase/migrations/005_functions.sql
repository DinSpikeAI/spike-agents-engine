-- ============================================================================
-- Spike Agents Engine — Schema 2.0
-- File: 005_functions.sql
-- Purpose: Atomic spend cap + outbox helpers + utility functions
-- Run order: FIFTH (after 004_grants.sql)
--
-- The spend cap pattern (reserve → settle → refund) is the central piece
-- of cost control. Every Anthropic call is wrapped in:
--
--   1. reserve_spend(tenant, run, estimate)   ← BEFORE the API call
--   2. <call Anthropic>
--   3a. settle_spend(run, actual_cost)        ← on success
--   3b. refund_spend(run)                     ← on failure
--
-- The unique partial indexes on cost_ledger guarantee idempotency:
-- double-settle or double-refund is a no-op (returns false), preventing
-- both double-charge and infinite refund loops.
-- ============================================================================

-- ============================================================================
-- FUNCTION: reserve_spend
-- Atomic check-and-reserve. Returns true if budget allowed, false if cap hit.
-- Uses the CHECK constraint on tenants for ultimate safety; the WHERE clause
-- on UPDATE avoids the constraint violation in the common path.
-- ============================================================================

create or replace function public.reserve_spend(
  p_tenant_id uuid,
  p_agent_run_id uuid,
  p_agent_id text,
  p_estimate_ils numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if p_estimate_ils <= 0 then
    return true;  -- nothing to reserve
  end if;

  -- Atomic: only updates if cap not exceeded
  update public.tenants
     set spend_reserved_ils = spend_reserved_ils + p_estimate_ils,
         updated_at = now()
   where id = p_tenant_id
     and (spend_used_ils + spend_reserved_ils + p_estimate_ils) <= spend_cap_ils;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    -- Cap hit. Log it for monitoring.
    insert into public.system_alerts(severity, tenant_id, message, metadata)
    values ('warn', p_tenant_id, 'Spend cap hit on reserve',
            jsonb_build_object('agent_run_id', p_agent_run_id,
                               'agent_id', p_agent_id,
                               'estimate', p_estimate_ils));
    return false;
  end if;

  -- Record the reservation
  insert into public.cost_ledger(tenant_id, agent_run_id, agent_id, kind, amount_ils)
  values (p_tenant_id, p_agent_run_id, p_agent_id, 'reserve', p_estimate_ils);

  return true;
end;
$$;

-- ============================================================================
-- FUNCTION: settle_spend
-- Convert a reservation into actual spend. Idempotent — second call no-ops.
-- Also handles the case where actual > estimate (within reason).
-- ============================================================================

create or replace function public.settle_spend(
  p_agent_run_id uuid,
  p_actual_ils numeric,
  p_model text default null,
  p_input_tokens int default null,
  p_output_tokens int default null,
  p_cache_read_tokens int default 0,
  p_cache_create_5m_tokens int default 0,
  p_cache_create_1h_tokens int default 0,
  p_metadata jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_agent_id text;
  v_reserved_ils numeric;
  v_settle_id bigint;
begin
  -- Look up the original reserve
  select tenant_id, agent_id, amount_ils
    into v_tenant_id, v_agent_id, v_reserved_ils
    from public.cost_ledger
   where agent_run_id = p_agent_run_id
     and kind = 'reserve'
   limit 1;

  if not found then
    raise warning 'settle_spend: no reserve found for run %', p_agent_run_id;
    return false;
  end if;

  -- Try to insert settle record. Unique partial index makes this idempotent.
  begin
    insert into public.cost_ledger(
      tenant_id, agent_run_id, agent_id, kind, amount_ils,
      model, input_tokens, output_tokens,
      cache_read_tokens, cache_create_5m_tokens, cache_create_1h_tokens,
      metadata
    ) values (
      v_tenant_id, p_agent_run_id, v_agent_id, 'settle', p_actual_ils,
      p_model, p_input_tokens, p_output_tokens,
      p_cache_read_tokens, p_cache_create_5m_tokens, p_cache_create_1h_tokens,
      p_metadata
    ) returning id into v_settle_id;
  exception when unique_violation then
    -- Already settled. Idempotent no-op.
    return false;
  end;

  -- Move money from reserved to used
  update public.tenants
     set spend_reserved_ils = greatest(0, spend_reserved_ils - v_reserved_ils),
         spend_used_ils     = spend_used_ils + p_actual_ils,
         updated_at = now()
   where id = v_tenant_id;

  return true;
end;
$$;

-- ============================================================================
-- FUNCTION: refund_spend
-- Release a reservation without charging. Idempotent.
-- ============================================================================

create or replace function public.refund_spend(
  p_agent_run_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_agent_id text;
  v_reserved_ils numeric;
  v_refund_id bigint;
begin
  -- Look up the original reserve
  select tenant_id, agent_id, amount_ils
    into v_tenant_id, v_agent_id, v_reserved_ils
    from public.cost_ledger
   where agent_run_id = p_agent_run_id
     and kind = 'reserve'
   limit 1;

  if not found then
    return false;
  end if;

  -- Try to insert refund record. Unique partial index makes this idempotent.
  begin
    insert into public.cost_ledger(
      tenant_id, agent_run_id, agent_id, kind, amount_ils, metadata
    ) values (
      v_tenant_id, p_agent_run_id, v_agent_id, 'refund', -v_reserved_ils,
      jsonb_build_object('reason', p_reason)
    ) returning id into v_refund_id;
  exception when unique_violation then
    return false;
  end;

  -- Release the reservation
  update public.tenants
     set spend_reserved_ils = greatest(0, spend_reserved_ils - v_reserved_ils),
         updated_at = now()
   where id = v_tenant_id;

  return true;
end;
$$;

-- ============================================================================
-- FUNCTION: reset_monthly_spend
-- Called by pg_cron on the 1st of each month.
-- ============================================================================

create or replace function public.reset_monthly_spend()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.tenants
     set spend_used_ils = 0,
         spend_reserved_ils = 0,
         spend_period_start = date_trunc('month', now())::date,
         updated_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- FUNCTION: reap_stale_runs
-- Reset agent_runs stuck in 'queued' or 'running' too long.
-- Safety net for crashed workers / lost QStash messages.
-- Called by pg_cron every 5 minutes.
-- ============================================================================

create or replace function public.reap_stale_runs(
  p_queued_threshold_minutes int default 30,
  p_running_threshold_minutes int default 20
)
returns table(reaped_id uuid, reaped_status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with reaped as (
    update public.agent_runs
       set status = 'failed',
           finished_at = now(),
           error_message = 'reaped: stale ' || status
     where (status = 'queued'  and started_at < now() - (p_queued_threshold_minutes  || ' minutes')::interval)
        or (status = 'running' and started_at < now() - (p_running_threshold_minutes || ' minutes')::interval)
    returning id, status
  ),
  refunded as (
    select r.id, public.refund_spend(r.id, 'reaper: stale run') from reaped r
  )
  select r.id, 'failed'::text from reaped r;
end;
$$;

-- ============================================================================
-- FUNCTION: enqueue_outbox_event
-- Helper for app code to insert an outbox row.
-- ============================================================================

create or replace function public.enqueue_outbox_event(
  p_tenant_id uuid,
  p_event_type text,
  p_payload jsonb,
  p_destination text default 'qstash'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.outbox(tenant_id, event_type, payload, destination)
  values (p_tenant_id, p_event_type, p_payload, p_destination)
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================================
-- GRANTS
-- service_role can call all of these directly. authenticated users only
-- through the SDK with proper RLS context (these are SECURITY DEFINER so
-- the function checks auth itself when needed).
-- ============================================================================

grant execute on function public.reserve_spend       (uuid, uuid, text, numeric) to service_role;
grant execute on function public.settle_spend        (uuid, numeric, text, int, int, int, int, int, jsonb) to service_role;
grant execute on function public.refund_spend        (uuid, text) to service_role;
grant execute on function public.reset_monthly_spend ()           to service_role;
grant execute on function public.reap_stale_runs     (int, int)   to service_role;
grant execute on function public.enqueue_outbox_event(uuid, text, jsonb, text) to service_role;

-- Block authenticated users from calling spend functions directly
revoke execute on function public.reserve_spend       (uuid, uuid, text, numeric) from authenticated, anon, public;
revoke execute on function public.settle_spend        (uuid, numeric, text, int, int, int, int, int, jsonb) from authenticated, anon, public;
revoke execute on function public.refund_spend        (uuid, text) from authenticated, anon, public;
revoke execute on function public.reset_monthly_spend ()           from authenticated, anon, public;
revoke execute on function public.reap_stale_runs     (int, int)   from authenticated, anon, public;
revoke execute on function public.enqueue_outbox_event(uuid, text, jsonb, text) from authenticated, anon, public;

-- ============================================================================
-- DONE — atomic spend cap, reaper, outbox helpers in place.
-- Next: 006_hook.sql to wire up the Custom Access Token Hook.
-- ============================================================================
