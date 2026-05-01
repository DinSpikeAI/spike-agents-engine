-- ============================================================================
-- Migration 017 — Seed Review Events
-- ============================================================================
--
-- Purpose: Populate public.events with sample Google Business reviews for the
-- Spike Demo tenant. The Reviews agent will load these via the new
-- loadReviewEventsAsReviews() helper in actions.ts and produce response drafts.
--
-- 4 reviews spanning the sentiment spectrum:
--   - 5 stars (positive praise) → expected sentiment: positive, intent: praise
--   - 3 stars (mixed) → expected: neutral, minor_complaint
--   - 1 star (major complaint) → expected: very_negative, major_complaint
--   - 2 stars (rant w/o specifics) → expected: negative, abusive (defamation guard test)
--
-- received_at is randomized in the last 0-24h so reviews always look recent.
--
-- Idempotent: ON CONFLICT (id) DO UPDATE refreshes content + timestamps.
-- ============================================================================

do $$
declare
  v_tenant_id uuid := '15ef2c6e-a064-49bf-9455-217ba937ccf2';
begin
  if not exists (select 1 from public.tenants where id = v_tenant_id) then
    raise exception 'Demo tenant % not found. Did you run 007_seed.sql?', v_tenant_id;
  end if;
end $$;

insert into public.events (id, tenant_id, provider, event_type, payload, received_at)
values
  -- ─── 5 stars: positive praise ────────────────────────────────────
  (
    'seed-review-001',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'google_business',
    'review_received',
    jsonb_build_object(
      'reviewerName', 'רחלי כהן',
      'rating', 5,
      'reviewText', 'חוויה מצוינת! הצוות היה אדיב מאוד, השירות מהיר, והמוצר בדיוק כמו שתואר באתר. בהחלט אחזור ואמליץ לחברות.',
      'platform', 'google'
    ),
    now() - (random() * interval '6 hours')
  ),

  -- ─── 3 stars: mixed (delivery delay, but service was kind) ────────
  (
    'seed-review-002',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'google_business',
    'review_received',
    jsonb_build_object(
      'reviewerName', 'אורי פרידמן',
      'rating', 3,
      'reviewText', 'המוצר היה בסדר אבל המשלוח התעכב ביומיים יותר ממה שהוצג. הצוות לא יידע אותי מראש על העיכוב — זה היה מאכזב. השירות עצמו היה אדיב.',
      'platform', 'google'
    ),
    now() - (random() * interval '12 hours')
  ),

  -- ─── 1 star: major complaint with specifics ──────────────────────
  (
    'seed-review-003',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'google_business',
    'review_received',
    jsonb_build_object(
      'reviewerName', 'דנה לוי',
      'rating', 1,
      'reviewText', 'הזמנתי לפני שבועיים ועד היום לא קיבלתי. ניסיתי ליצור קשר 3 פעמים, השאירו אותי על המתנה ולא חזרו. אני רוצה החזר כספי מלא.',
      'platform', 'google'
    ),
    now() - (random() * interval '4 hours')
  ),

  -- ─── 2 stars: rant without specifics — tests abusive/defamation path
  (
    'seed-review-004',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'google_business',
    'review_received',
    jsonb_build_object(
      'reviewerName', 'Anonymous Customer',
      'rating', 2,
      'reviewText', 'בזבוז כסף! המוצר הגיע פגום והצוות לא רצה לקבל אותו בחזרה. הם פשוט גנבו לי את הכסף. אנשים, אל תקנו פה!!!',
      'platform', 'google'
    ),
    now() - (random() * interval '20 hours')
  )
on conflict (id) do update set
  payload     = excluded.payload,
  received_at = excluded.received_at,
  provider    = excluded.provider,
  event_type  = excluded.event_type;

-- Verification
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.events
  where tenant_id = '15ef2c6e-a064-49bf-9455-217ba937ccf2'
    and id like 'seed-review-%';

  raise notice 'Seed Review events for demo tenant: % rows', v_count;
end $$;
