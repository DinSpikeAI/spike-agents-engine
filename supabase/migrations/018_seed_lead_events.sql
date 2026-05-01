-- ============================================================================
-- Migration 018 — Seed Lead Events for Hot Leads Agent
-- ============================================================================
--
-- Purpose: Populate public.events with diverse lead events for the demo
-- tenant. The Hot Leads agent will load these via loadLeadEventsAsLeads()
-- in actions.ts and classify each into cold/warm/hot/burning.
--
-- 5 leads spanning the temperature spectrum:
--   - burning: specific product, specific quantity, today, budget
--   - hot:     specific model, ready to buy, mentions budget
--   - warm:    interested but vague, asks for catalog/info
--   - cold:    generic question, no buying signal
--   - spam:    English marketing pitch (tests filter logic)
--
-- Sources spread across whatsapp / instagram / website_form / email.
-- received_at randomized in last 0-12h.
--
-- Idempotent.
-- ============================================================================

do $$
declare
  v_tenant_id uuid := '15ef2c6e-a064-49bf-9455-217ba937ccf2';
begin
  if not exists (select 1 from public.tenants where id = v_tenant_id) then
    raise exception 'Demo tenant % not found.', v_tenant_id;
  end if;
end $$;

insert into public.events (id, tenant_id, provider, event_type, payload, received_at)
values
  -- ─── burning: WhatsApp, ready to buy today ────────────────────────
  (
    'seed-lead-001',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'whatsapp',
    'lead_received',
    jsonb_build_object(
      'name', 'דנה כהן',
      'phone', '+972501234567',
      'summary', 'שלום, אני מחפשת לקנות סלמון נורבגי טרי, 2 ק״ג, היום. תקציב עד ₪450. אפשר?'
    ),
    now() - (random() * interval '30 minutes')
  ),

  -- ─── hot: Instagram, specific model + budget + 2 units ───────────
  (
    'seed-lead-002',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'instagram',
    'lead_received',
    jsonb_build_object(
      'name', 'Mohammed Khalil',
      'handle', '@mhd_khalil',
      'summary', 'היי, ראיתי את הדגם XYZ-44 בעמוד שלכם. מעוניין להזמין שניים. תקציב 1500 שקל. כמה זמן משלוח?'
    ),
    now() - (random() * interval '3 hours')
  ),

  -- ─── warm: website form, asks for catalog ────────────────────────
  (
    'seed-lead-003',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'website_form',
    'lead_received',
    jsonb_build_object(
      'name', 'תמר שמעוני',
      'email', 'tamar.sh@gmail.com',
      'summary', 'שלום, מעוניינת לקבל מידע על השירותים שלכם. תוכלו לשלוח לי קטלוג?'
    ),
    now() - (random() * interval '5 hours')
  ),

  -- ─── cold: Instagram, generic location/hours question ────────────
  (
    'seed-lead-004',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'instagram',
    'lead_received',
    jsonb_build_object(
      'name', 'Ivan Petrov',
      'handle', '@ivan_p_il',
      'summary', 'Hi, where are you located? what hours?'
    ),
    now() - (random() * interval '7 hours')
  ),

  -- ─── spam: B2B marketing pitch, English, suspicious URL ──────────
  (
    'seed-lead-005',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'email',
    'lead_received',
    jsonb_build_object(
      'name', 'Marketing Pro Ltd',
      'email', 'ceo@marketingpro-deals.biz',
      'summary', 'Dear Business Owner, We can boost your Google ranking to #1 for only $99/month. Limited time offer! Click here: bit.ly/seo-boost-now. Reply STOP to unsubscribe.'
    ),
    now() - (random() * interval '90 minutes')
  )
on conflict (id) do update set
  payload     = excluded.payload,
  received_at = excluded.received_at,
  provider    = excluded.provider,
  event_type  = excluded.event_type;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.events
  where tenant_id = '15ef2c6e-a064-49bf-9455-217ba937ccf2'
    and id like 'seed-lead-%';

  raise notice 'Seed Lead events for demo tenant: % rows', v_count;
end $$;
