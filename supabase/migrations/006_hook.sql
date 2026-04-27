-- ============================================================================
-- Spike Agents Engine — Schema 2.0
-- File: 006_hook.sql
-- Purpose: Custom Access Token Hook — injects tenant_id + is_super_admin
--          into JWT app_metadata so RLS policies can filter on them.
-- Run order: SIXTH (after 005_functions.sql)
--
-- Without this hook, all RLS policies that reference current_tenant_id()
-- return NULL and users see nothing. This is the keystone.
--
-- The hook reads from BOTH:
--   - user_settings.active_tenant_id (the tenant the user is currently using)
--   - memberships (to find the user's first tenant if no active set yet)
--
-- After running this SQL, you ALSO need to enable the hook in the dashboard:
--   Authentication → Hooks → Custom Access Token →
--     "public.custom_access_token_hook" → Enable
--
-- Pitfall: NEVER raise an exception in this hook — it would lock everyone out.
-- We log errors and return event unmodified, so worst case the user gets a
-- JWT without tenant_id and the app shows the onboarding flow.
-- ============================================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_user_id uuid;
  v_claims jsonb;
  v_app_meta jsonb;
  v_tenant_id uuid;
  v_role text;
  v_is_super boolean;
begin
  v_user_id := (event->>'user_id')::uuid;
  v_claims := coalesce(event->'claims', '{}'::jsonb);
  v_app_meta := coalesce(v_claims->'app_metadata', '{}'::jsonb);

  -- Try to find active tenant first
  select us.active_tenant_id, m.role, m.is_super_admin
    into v_tenant_id, v_role, v_is_super
    from public.user_settings us
    join public.memberships m
      on m.user_id = us.user_id
     and m.tenant_id = us.active_tenant_id
   where us.user_id = v_user_id
   limit 1;

  -- Fall back to first membership if no active tenant set
  if v_tenant_id is null then
    select tenant_id, role, is_super_admin
      into v_tenant_id, v_role, v_is_super
      from public.memberships
     where user_id = v_user_id
     order by created_at asc
     limit 1;
  end if;

  -- Inject claims if we found a tenant
  if v_tenant_id is not null then
    v_app_meta := v_app_meta
      || jsonb_build_object(
           'tenant_id', v_tenant_id,
           'role', v_role,
           'is_super_admin', coalesce(v_is_super, false)
         );
    v_claims := jsonb_set(v_claims, '{app_metadata}', v_app_meta);
    event := jsonb_set(event, '{claims}', v_claims);
  end if;

  return event;

exception
  when others then
    -- Critical: never block auth. Log and return unchanged event.
    raise log 'custom_access_token_hook error for user %: %', v_user_id, sqlerrm;
    return event;
end;
$$;

-- ============================================================================
-- GRANTS for the hook
-- supabase_auth_admin is the role that calls auth hooks. It needs:
--   1. EXECUTE on the function
--   2. SELECT on the tables the function reads
-- Without these grants the hook fails silently in local dev.
-- ============================================================================

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant select on public.memberships    to supabase_auth_admin;
grant select on public.user_settings  to supabase_auth_admin;

-- Revoke from everyone else (paranoia — the hook should only be called by auth)
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- ============================================================================
-- DONE — Hook deployed. After this SQL runs, ENABLE THE HOOK IN DASHBOARD:
--   Authentication → Hooks → "Custom Access Token" → select
--   public.custom_access_token_hook → Enable
--
-- Next: 007_seed.sql to insert the 9 agents.
-- ============================================================================
