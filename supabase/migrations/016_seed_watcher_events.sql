-- ============================================================================
-- Migration 016 — Seed Watcher Events
-- ============================================================================
--
-- Purpose: Populate the public.events table for the Spike Demo tenant so the
-- Watcher agent has real data to classify when run from the dashboard.
--
-- These are NOT mock LLM outputs — they are real rows in real tables that the
-- Watcher will load via SELECT, hand to Sonnet/Haiku for classification, and
-- return as alerts. When a real integration (webhook/form/CRM) is added later,
-- it writes to the same table in the same shape, and the Watcher keeps working
-- with no code changes.
--
-- The 15 events span all 11 categories so the demo always has something
-- interesting in every severity tier:
--   critical (4): negative_review, customer_complaint, urgent_message, new_lead
--   high     (2): payment_issue, hot_inquiry
--   medium   (3): schedule_change, low_inventory, appointment_soon
--   low      (2): positive_review, routine_update
--   + 4 extras to make the queue feel realistic
--
-- received_at is randomized in [NOW() - 12h, NOW()] so events always look
-- recent regardless of when this seed last ran.
--
-- Idempotent: uses ON CONFLICT (id) DO UPDATE so re-running refreshes the
-- timestamps and content but keeps the same primary keys.
-- ============================================================================

-- Demo tenant id from QUICK-REFERENCE.md
-- If you reset the tenant, update this constant in one place.
do $$
declare
  v_tenant_id uuid := '15ef2c6e-a064-49bf-9455-217ba937ccf2';
begin
  -- Sanity check — fail loudly if the demo tenant is missing.
  if not exists (select 1 from public.tenants where id = v_tenant_id) then
    raise exception 'Demo tenant % not found. Did you run 007_seed.sql?', v_tenant_id;
  end if;
end $$;

-- ─── Insert / refresh seed events ─────────────────────────────────────────
insert into public.events (id, tenant_id, provider, event_type, payload, received_at)
values
  -- ─── critical (4) ────────────────────────────────────────────────────
  (
    'seed-watcher-001',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'google_business',
    'review_received',
    jsonb_build_object(
      'summary', 'ביקורת חדשה ב-Google: דנה לוי כתבה ★★ "חיכיתי 40 דקות לתור שנקבע מראש, השירות לא מקצועי. לא אחזור." 7 אנשים סימנו ''שימושי''.',
      'reviewer_name', 'דנה לוי',
      'rating', 2,
      'channel', 'google'
    ),
    now() - (random() * interval '6 hours')
  ),
  (
    'seed-watcher-002',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'whatsapp',
    'message_received',
    jsonb_build_object(
      'summary', 'הודעת WhatsApp מיוסי כהן (לקוח קיים): "קניתי אצלכם אתמול והמוצר הגיע פגום. אני דורש החזר כספי מלא היום אחרת אני מתלונן ברשת ההגנת הצרכן."',
      'sender', 'יוסי כהן',
      'channel', 'whatsapp'
    ),
    now() - (random() * interval '3 hours')
  ),
  (
    'seed-watcher-003',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'whatsapp',
    'urgent_message',
    jsonb_build_object(
      'summary', 'הודעה דחופה מספק: חברת ההובלה מודיעה שהמשלוח ל-15 לקוחות לא יצא היום בגלל תקלה. צריך להחליט מיידית האם לעדכן את הלקוחות או לחפש מוביל חלופי.',
      'sender', 'הובלות אלון',
      'channel', 'whatsapp'
    ),
    now() - (random() * interval '2 hours')
  ),
  (
    'seed-watcher-004',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'website_form',
    'lead_received',
    jsonb_build_object(
      'summary', 'ליד חדש מטופס באתר: רותם ברק, חברת "ברק ייעוץ", מתעניינת בחבילה החודשית שלכם, ציינה תקציב של 2,500 ש״ח לחודש ורוצה התחלה השבוע.',
      'name', 'רותם ברק',
      'phone', '050-1234567',
      'channel', 'website'
    ),
    now() - (random() * interval '1 hour')
  ),

  -- ─── high (2) ───────────────────────────────────────────────────────
  (
    'seed-watcher-005',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'cardcom',
    'payment_failed',
    jsonb_build_object(
      'summary', 'תשלום נדחה: גלית אברהם, ניסיון חיוב של 890 ש״ח לקורס הדיגיטלי. הבנק החזיר "כרטיס לא תקף". ניסיון שני נכשל באותה שיטה.',
      'amount_ils', 890,
      'customer_name', 'גלית אברהם',
      'channel', 'cardcom'
    ),
    now() - (random() * interval '5 hours')
  ),
  (
    'seed-watcher-006',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'instagram',
    'dm_received',
    jsonb_build_object(
      'summary', 'הודעת DM באינסטגרם מאוהד שמש: "ראיתי את הפוסט שלכם, אני צריך הצעת מחיר ל-3 פרויקטים, יש לי תקציב פתוח ואני רוצה לסגור השבוע. תוכלו לקבוע פגישה?"',
      'sender_handle', '@ohad_shemesh',
      'channel', 'instagram'
    ),
    now() - (random() * interval '4 hours')
  ),

  -- ─── medium (3) ─────────────────────────────────────────────────────
  (
    'seed-watcher-007',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'google_calendar',
    'calendar_change',
    jsonb_build_object(
      'summary', 'שינוי ביומן: מיכל רוזן ביטלה את הפגישה של 14:00 מחר וביקשה לתאם מחדש לתחילת השבוע הבא. השעה הזו עדיין פנויה אם רוצים להציע ללקוח אחר.',
      'customer_name', 'מיכל רוזן',
      'channel', 'google_calendar'
    ),
    now() - (random() * interval '8 hours')
  ),
  (
    'seed-watcher-008',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'inventory_system',
    'low_stock',
    jsonb_build_object(
      'summary', 'שמן זית כתית פרימיום: נותרו 4 בקבוקים במלאי, קצב מכירה ממוצע של 2 בקבוקים ביום. צפי כיסוי: 2 ימים בלבד.',
      'product_name', 'שמן זית כתית פרימיום',
      'units_left', 4,
      'channel', 'inventory'
    ),
    now() - (random() * interval '7 hours')
  ),
  (
    'seed-watcher-009',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'google_calendar',
    'appointment_upcoming',
    jsonb_build_object(
      'summary', 'תזכורת: פגישה עם רון מזרחי מחר ב-09:00 — צריך להכין הצעת מחיר עדכנית, התיק נסגר לפני 3 חודשים והוא חזר השבוע.',
      'customer_name', 'רון מזרחי',
      'when', 'tomorrow 09:00',
      'channel', 'google_calendar'
    ),
    now() - (random() * interval '10 hours')
  ),

  -- ─── low (2) ────────────────────────────────────────────────────────
  (
    'seed-watcher-010',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'google_business',
    'review_received',
    jsonb_build_object(
      'summary', 'ביקורת חיובית ב-Google: שירה דניאלי ★★★★★ "שירות מעולה, מוצר איכותי, התקבלתי במקצועיות. ממליצה בחום!" — שווה תגובה מנומסת.',
      'reviewer_name', 'שירה דניאלי',
      'rating', 5,
      'channel', 'google'
    ),
    now() - (random() * interval '11 hours')
  ),
  (
    'seed-watcher-011',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'system',
    'routine_update',
    jsonb_build_object(
      'summary', 'דוח שבועי הוכן ונשלח אוטומטית 12 לקוחות פעילים. אין כשלים בשליחה.',
      'channel', 'system'
    ),
    now() - (random() * interval '12 hours')
  ),

  -- ─── 4 extras (mixed tiers) — to fill the queue ─────────────────────
  (
    'seed-watcher-012',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'website_form',
    'lead_received',
    jsonb_build_object(
      'summary', 'ליד חדש מטופס: אביב ברנע, מעוניין בייעוץ ראשוני, השאיר טלפון 052-9876543. לא ציין תקציב, ביקש שיחזרו אליו אחרי 18:00.',
      'name', 'אביב ברנע',
      'phone', '052-9876543',
      'channel', 'website'
    ),
    now() - (random() * interval '90 minutes')
  ),
  (
    'seed-watcher-013',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'whatsapp',
    'message_received',
    jsonb_build_object(
      'summary', 'הודעת WhatsApp מטל לוין: "כמה עולה אצלכם הקורס המתקדם ויש לי הנחה כי אני סטודנט?" — ליד פושר עם שאלת מחיר ראשונית.',
      'sender', 'טל לוין',
      'channel', 'whatsapp'
    ),
    now() - (random() * interval '5 hours')
  ),
  (
    'seed-watcher-014',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'google_business',
    'review_received',
    jsonb_build_object(
      'summary', 'ביקורת חדשה ב-Google: עמרי פרץ ★ "מוצר הגיע שבור, ניסיתי ליצור קשר 3 פעמים, אף אחד לא חזר אליי. בושה." פורסם לפני שעה.',
      'reviewer_name', 'עמרי פרץ',
      'rating', 1,
      'channel', 'google'
    ),
    now() - (random() * interval '90 minutes')
  ),
  (
    'seed-watcher-015',
    '15ef2c6e-a064-49bf-9455-217ba937ccf2',
    'inventory_system',
    'low_stock',
    jsonb_build_object(
      'summary', 'אריזות מתנה (גודל בינוני): נותרו 8 יחידות במלאי, קצב צריכה ממוצע 5 יחידות ביום בעונה הנוכחית. כיסוי: כיומיים.',
      'product_name', 'אריזות מתנה — בינוני',
      'units_left', 8,
      'channel', 'inventory'
    ),
    now() - (random() * interval '9 hours')
  )
on conflict (id) do update set
  payload     = excluded.payload,
  received_at = excluded.received_at,
  provider    = excluded.provider,
  event_type  = excluded.event_type;

-- ─── Verification — print row count for the demo tenant ──────────────────
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.events
  where tenant_id = '15ef2c6e-a064-49bf-9455-217ba937ccf2'
    and id like 'seed-watcher-%';

  raise notice 'Seed Watcher events for demo tenant: % rows', v_count;
end $$;
