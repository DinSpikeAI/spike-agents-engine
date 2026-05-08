-- ═══════════════════════════════════════════════════════
-- Rich Demo Seed for /dashboard/showcase
-- ═══════════════════════════════════════════════════════
--
-- Replaces the sparse single-customer seed with 18 realistic
-- Hebrew customer scenarios for a Tel Aviv / Haifa salon.
-- Designed to give the showcase page a compelling story that
-- exercises ALL 9 customer-facing agents:
--
--   * Watcher    — sentiment classification across positive/
--                  negative/neutral/urgent
--   * Hot Leads  — buying-intent detection at varying heat
--                  levels (warm, hot, blazing)
--   * Reviews    — incoming positive + negative reviews
--   * Sales      — cascade triggered by hot leads
--   * Inventory  — questions about specific products
--   * Manager    — aggregable patterns for weekly digest
--   * Morning    — daily summary fodder
--   * Social     — DMs from social platforms
--   * Growth     — dormant customers + unanswered prospects
--
-- DESIGN DECISIONS:
--   - Names: mix of Jewish + Arab + Russian/Ethiopian for realism
--   - Times: spread across last 90 days (most recent in last week)
--   - Vertical: hair/beauty salon "Tel Aviv style" (matches existing
--     "טיפול קרטין" reference in current seed)
--   - All phones are FAKE +972541999XXX range — NOT real numbers
--   - All flagged is_demo=true so they can be filtered/removed
--
-- HOW TO USE:
--   1. (Optional) wipe existing demo events:
--      DELETE FROM events WHERE tenant_id = '15ef2c6e-...' 
--        AND payload->>'is_demo' = 'true';
--   2. Run this script.
--   3. Trigger agents to process: invoke watcher, hot_leads, etc.
--      via /admin/agents or natural cron firing.
--   4. View results in /dashboard/showcase.
--
-- WIPE COMMAND (commented out — uncomment if needed):
-- DELETE FROM events 
-- WHERE tenant_id = '15ef2c6e-a064-49bf-9455-217ba937ccf2'
--   AND payload->>'is_demo' = 'true'
--   AND id LIKE 'DEMO_SEED_%';

-- ─────────────────────────────────────────────────────────────
-- Customer 1: דנה כהן — DORMANT (for Growth)
-- 4 prior interactions 60-90 days ago, then silence
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.events (id, tenant_id, provider, event_type, payload, received_at) VALUES
('DEMO_SEED_001', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','היי! שמעתי עליכם המון, רציתי לקבוע תור לטיפול קרטין. כמה זה עולה?',
   'summary','הודעת WhatsApp נכנסה מ-דנה כהן: שאלה על מחיר טיפול קרטין',
   'received_at',extract(epoch from now()-interval '90 days')::int,
   'contact_name','דנה כהן','contact_phone','+972541999001',
   'message_type','text','whatsapp_message_id','wamid.DEMO_001',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '90 days'),
('DEMO_SEED_002', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','מאשרת לחמישי 15:00. תודה!',
   'summary','הודעת WhatsApp נכנסה מ-דנה כהן: אישור תור',
   'received_at',extract(epoch from now()-interval '85 days')::int,
   'contact_name','דנה כהן','contact_phone','+972541999001',
   'message_type','text','whatsapp_message_id','wamid.DEMO_002',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '85 days'),
('DEMO_SEED_003', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','הטיפול היה מדהים, תודה רבה!',
   'summary','הודעת WhatsApp נכנסה מ-דנה כהן: הודעת תודה',
   'received_at',extract(epoch from now()-interval '83 days')::int,
   'contact_name','דנה כהן','contact_phone','+972541999001',
   'message_type','text','whatsapp_message_id','wamid.DEMO_003',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '83 days'),
('DEMO_SEED_004', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','רציתי לשאול מתי יש זמן לחידוש קרטין? הוא מתחיל לרדת',
   'summary','הודעת WhatsApp נכנסה מ-דנה כהן: שאלה על חידוש',
   'received_at',extract(epoch from now()-interval '60 days')::int,
   'contact_name','דנה כהן','contact_phone','+972541999001',
   'message_type','text','whatsapp_message_id','wamid.DEMO_004',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '60 days'),

-- ─────────────────────────────────────────────────────────────
-- Customer 2: מוחמד אבו ראס — HOT LEAD (existing pattern, kept)
-- Urgent, budget mentioned, ready to book
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_010', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','שלום, אני צריך דחוף לקבוע פגישה היום. רוצה לבדוק את הטיפול. תקציב 2000 שקל. מתי אתם פנויים?',
   'summary','הודעת WhatsApp נכנסה מ-מוחמד אבו ראס: ליד חם דחוף',
   'received_at',extract(epoch from now()-interval '2 hours')::int,
   'contact_name','מוחמד אבו ראס','contact_phone','+972541999002',
   'message_type','text','whatsapp_message_id','wamid.DEMO_010',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '2 hours'),

-- ─────────────────────────────────────────────────────────────
-- Customer 3: שרה לוי — POSITIVE REVIEW (Reviews agent)
-- Existing customer leaves enthusiastic feedback
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_020', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','תודה ענקית!! יצאתי מהסלון ופשוט נראית כמו אישה אחרת. הצבע מושלם, החלקה כמו משי, ועדנה הייתה מקסימה. אני חוזרת בעוד חודש בלי ספק 💕',
   'summary','הודעת WhatsApp נכנסה מ-שרה לוי: ביקורת חיובית מאוד',
   'received_at',extract(epoch from now()-interval '6 hours')::int,
   'contact_name','שרה לוי','contact_phone','+972541999003',
   'message_type','text','whatsapp_message_id','wamid.DEMO_020',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '6 hours'),

-- ─────────────────────────────────────────────────────────────
-- Customer 4: יעל מזרחי — NEGATIVE REVIEW + Watcher urgent
-- Complaint requiring quick owner attention
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_030', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','אני ממש מאוכזבת מהטיפול שעשיתי אתמול. הצבע יצא לי בכלל לא מה שביקשתי, כתום במקום בלונד! שילמתי 800 שקל ואני נראית רע. אני מבקשת שתחזרו אליי בהקדם',
   'summary','הודעת WhatsApp נכנסה מ-יעל מזרחי: תלונה דחופה על תוצאת טיפול',
   'received_at',extract(epoch from now()-interval '45 minutes')::int,
   'contact_name','יעל מזרחי','contact_phone','+972541999004',
   'message_type','text','whatsapp_message_id','wamid.DEMO_030',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '45 minutes'),

-- ─────────────────────────────────────────────────────────────
-- Customer 5: אנה בלוך — WARM LEAD (recurring inquirer)
-- Asked twice, didn't book yet
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_040', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','שלום, מה המחיר של בוטוקס שיער?',
   'summary','הודעת WhatsApp נכנסה מ-אנה בלוך: שאלה על מחיר',
   'received_at',extract(epoch from now()-interval '12 days')::int,
   'contact_name','אנה בלוך','contact_phone','+972541999005',
   'message_type','text','whatsapp_message_id','wamid.DEMO_040',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '12 days'),
('DEMO_SEED_041', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','והאם זה מתאים לשיער דק וצבוע? והאם יש זמן השבוע?',
   'summary','הודעת WhatsApp נכנסה מ-אנה בלוך: שאלת המשך + עניין',
   'received_at',extract(epoch from now()-interval '3 days')::int,
   'contact_name','אנה בלוך','contact_phone','+972541999005',
   'message_type','text','whatsapp_message_id','wamid.DEMO_041',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '3 days'),

-- ─────────────────────────────────────────────────────────────
-- Customer 6: ליאת אברהם — INVENTORY question
-- Asks about specific product availability
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_050', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','היי, יש לכם את שמפו Olaplex No. 4 הגדול? אני קונה תמיד אצלכם והמלאי שלי נגמר',
   'summary','הודעת WhatsApp נכנסה מ-ליאת אברהם: שאלה על מלאי Olaplex',
   'received_at',extract(epoch from now()-interval '1 day')::int,
   'contact_name','ליאת אברהם','contact_phone','+972541999006',
   'message_type','text','whatsapp_message_id','wamid.DEMO_050',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '1 day'),

-- ─────────────────────────────────────────────────────────────
-- Customer 7: רינת גרין — APPOINTMENT confirmation
-- Standard recurring customer, neutral interaction
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_060', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','מאשרת תור לרביעי הבא ב-11:00. תודה',
   'summary','הודעת WhatsApp נכנסה מ-רינת גרין: אישור תור',
   'received_at',extract(epoch from now()-interval '4 days')::int,
   'contact_name','רינת גרין','contact_phone','+972541999007',
   'message_type','text','whatsapp_message_id','wamid.DEMO_060',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '4 days'),

-- ─────────────────────────────────────────────────────────────
-- Customer 8: סלימה חליל — SCHEDULING reschedule request
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_070', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','שלום, יש לי תור מחר ב-14:00 אבל יצא לי משהו דחוף. אפשר להעביר ליום אחר השבוע?',
   'summary','הודעת WhatsApp נכנסה מ-סלימה חליל: בקשת העברת תור',
   'received_at',extract(epoch from now()-interval '8 hours')::int,
   'contact_name','סלימה חליל','contact_phone','+972541999008',
   'message_type','text','whatsapp_message_id','wamid.DEMO_070',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '8 hours'),

-- ─────────────────────────────────────────────────────────────
-- Customer 9: טל רוזנברג — BLAZING HOT LEAD
-- Multiple urgent indicators
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_080', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','חברה שלי הולכת להתחתן בעוד שבועיים, אני שושבינה. אני חייבת טיפול מלא היום או מחר. תקציב לא מגביל. מי הקוסמטיקאית הכי טובה אצלכם? אפשר להזמין הכל ביחד - שיער, ציפורניים, איפור?',
   'summary','הודעת WhatsApp נכנסה מ-טל רוזנברג: ליד דחוף לחתונה',
   'received_at',extract(epoch from now()-interval '30 minutes')::int,
   'contact_name','טל רוזנברג','contact_phone','+972541999009',
   'message_type','text','whatsapp_message_id','wamid.DEMO_080',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '30 minutes'),

-- ─────────────────────────────────────────────────────────────
-- Customer 10: דבורה בן-דוד — DORMANT loyal (Growth target)
-- Was a regular, then disappeared
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_090', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','התור שלי לאתמול היה מוצלח, תודה לעדן',
   'summary','הודעת WhatsApp נכנסה מ-דבורה בן-דוד: אחרי תור',
   'received_at',extract(epoch from now()-interval '70 days')::int,
   'contact_name','דבורה בן-דוד','contact_phone','+972541999010',
   'message_type','text','whatsapp_message_id','wamid.DEMO_090',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '70 days'),
('DEMO_SEED_091', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','אפשר תור לחיתוך?',
   'summary','הודעת WhatsApp נכנסה מ-דבורה בן-דוד: בקשת תור',
   'received_at',extract(epoch from now()-interval '55 days')::int,
   'contact_name','דבורה בן-דוד','contact_phone','+972541999010',
   'message_type','text','whatsapp_message_id','wamid.DEMO_091',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '55 days'),
('DEMO_SEED_092', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','בא לי לעשות צבע. מה אומרים על שטיפה כחולה?',
   'summary','הודעת WhatsApp נכנסה מ-דבורה בן-דוד: שאלה על צבע',
   'received_at',extract(epoch from now()-interval '50 days')::int,
   'contact_name','דבורה בן-דוד','contact_phone','+972541999010',
   'message_type','text','whatsapp_message_id','wamid.DEMO_092',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '50 days'),

-- ─────────────────────────────────────────────────────────────
-- Customer 11: רביד פרץ — INSTAGRAM DM (Social/Growth via Meta)
-- Lead from Instagram that wasn't replied to
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_100', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','שלום, ראיתי באינסטגרם שלכם תספורת בוב יפה, אפשר תור לחתוך באותו סטייל?',
   'summary','הודעת WhatsApp נכנסה מ-רביד פרץ: ליד מאינסטגרם',
   'received_at',extract(epoch from now()-interval '5 days')::int,
   'contact_name','רביד פרץ','contact_phone','+972541999011',
   'message_type','text','whatsapp_message_id','wamid.DEMO_100',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '5 days'),

-- ─────────────────────────────────────────────────────────────
-- Customer 12: אסתר בן-שושן — long-time loyal positive
-- Manager report fodder — recurring customer
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_110', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','כרגיל, עדנה הצליחה. הצבע יוצא לי מושלם כל פעם. תוקבע אותי שוב לעוד חודש כרגיל?',
   'summary','הודעת WhatsApp נכנסה מ-אסתר בן-שושן: לקוחה קבועה מרוצה',
   'received_at',extract(epoch from now()-interval '2 days')::int,
   'contact_name','אסתר בן-שושן','contact_phone','+972541999012',
   'message_type','text','whatsapp_message_id','wamid.DEMO_110',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '2 days'),

-- ─────────────────────────────────────────────────────────────
-- Customer 13: יוסי דהן — MORNING summary fodder
-- Routine confirmation for tomorrow
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_120', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','איזה שעה זה התור שלי מחר?',
   'summary','הודעת WhatsApp נכנסה מ-יוסי דהן: שאלה על תור',
   'received_at',extract(epoch from now()-interval '14 hours')::int,
   'contact_name','יוסי דהן','contact_phone','+972541999013',
   'message_type','text','whatsapp_message_id','wamid.DEMO_120',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '14 hours'),

-- ─────────────────────────────────────────────────────────────
-- Customer 14: מאיה רובין — Price comparison shopper
-- Watcher should pick up the comparison signal
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_130', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','ראיתי שבסלון אחר עושים קרטין ב-700 שקל, אצלכם זה 950. למה הפער? מה ההבדל?',
   'summary','הודעת WhatsApp נכנסה מ-מאיה רובין: השוואת מחירים',
   'received_at',extract(epoch from now()-interval '3 hours')::int,
   'contact_name','מאיה רובין','contact_phone','+972541999014',
   'message_type','text','whatsapp_message_id','wamid.DEMO_130',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '3 hours'),

-- ─────────────────────────────────────────────────────────────
-- Customer 15: נטע ביטון — Voice note (placeholder for future)
-- Demonstrates message_type variety even before voice triage
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_140', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','[הודעה קולית — 0:14]',
   'summary','הודעת WhatsApp נכנסה מ-נטע ביטון: הודעה קולית',
   'received_at',extract(epoch from now()-interval '5 hours')::int,
   'contact_name','נטע ביטון','contact_phone','+972541999015',
   'message_type','audio','whatsapp_message_id','wamid.DEMO_140',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '5 hours'),

-- ─────────────────────────────────────────────────────────────
-- Customer 16: ויקטוריה אגייב — Russian/Israeli, repeat blazing
-- Already came twice this month, asks for third
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_150', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','עוד פעם אני! יש משהו פנוי השבוע? אני יודעת שזה שוב אבל אני אוהבת איך עדנה עושה',
   'summary','הודעת WhatsApp נכנסה מ-ויקטוריה אגייב: לקוחה חמה ביותר',
   'received_at',extract(epoch from now()-interval '1 hour')::int,
   'contact_name','ויקטוריה אגייב','contact_phone','+972541999016',
   'message_type','text','whatsapp_message_id','wamid.DEMO_150',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '1 hour'),

-- ─────────────────────────────────────────────────────────────
-- Customer 17: אסנת זהבי — DORMANT cold (Growth)
-- Last interaction 4 months ago, single low-priors
-- → SHOULD NOT pass Growth filter (totalPriorInteractions=1)
-- This is a NEGATIVE example for the filter
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_160', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','שלום, רציתי לשאול על מחיר הצבע',
   'summary','הודעת WhatsApp נכנסה מ-אסנת זהבי: שאלה חד פעמית',
   'received_at',extract(epoch from now()-interval '120 days')::int,
   'contact_name','אסנת זהבי','contact_phone','+972541999017',
   'message_type','text','whatsapp_message_id','wamid.DEMO_160',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '120 days'),

-- ─────────────────────────────────────────────────────────────
-- Customer 18: רוני קלינמן — Recently active, not dormant
-- Should NOT trigger Growth (last interaction <45 days)
-- ─────────────────────────────────────────────────────────────

('DEMO_SEED_170', '15ef2c6e-a064-49bf-9455-217ba937ccf2', 'whatsapp', 'whatsapp_message_received',
 jsonb_build_object('source','whatsapp','is_demo',true,
   'raw_message','מאשרת לחמישי הבא, מחכה',
   'summary','הודעת WhatsApp נכנסה מ-רוני קלינמן: אישור תור',
   'received_at',extract(epoch from now()-interval '7 days')::int,
   'contact_name','רוני קלינמן','contact_phone','+972541999018',
   'message_type','text','whatsapp_message_id','wamid.DEMO_170',
   'whatsapp_phone_number_id','DEMO_PHONE_NUMBER_ID'),
 now()-interval '7 days');

-- ─────────────────────────────────────────────────────────────
-- Verification: how many distinct customers got seeded?
-- ─────────────────────────────────────────────────────────────

SELECT 
  payload->>'contact_name' AS customer_name,
  COUNT(*) AS messages,
  MIN(received_at)::date AS first_seen,
  MAX(received_at)::date AS last_seen,
  EXTRACT(day FROM NOW() - MAX(received_at))::int AS days_since_last,
  CASE 
    WHEN EXTRACT(day FROM NOW() - MAX(received_at)) >= 45 AND COUNT(*) >= 2 
      THEN '🌱 Growth target'
    WHEN EXTRACT(epoch FROM NOW() - MAX(received_at)) < 7200  -- 2 hours
      THEN '🔥 Real-time'
    ELSE '💼 Active'
  END AS classification
FROM public.events
WHERE tenant_id = '15ef2c6e-a064-49bf-9455-217ba937ccf2'
  AND payload->>'is_demo' = 'true'
  AND id LIKE 'DEMO_SEED_%'
GROUP BY payload->>'contact_name'
ORDER BY MAX(received_at) DESC;

-- Expected output:
--   18 distinct customers
--   3 marked "🌱 Growth target" (דנה כהן, דבורה בן-דוד, אסתר?...)
--   3-4 marked "🔥 Real-time" (last 2h: מוחמד, יעל, טל, ויקטוריה)
--   Rest marked "💼 Active"
