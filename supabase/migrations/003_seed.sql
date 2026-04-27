-- ============================================================================
-- Spike Agents Engine — Seed Data
-- File: 003_seed.sql
-- Purpose: Insert the 9 agents and placeholder prompts
-- Run order: THIRD (after 001_schema.sql and 002_rls.sql)
-- ============================================================================

-- ============================================================================
-- 9 AGENTS
-- Models per Day 1 plan:
--   Haiku 4.5  : morning, watcher, cleanup, inventory, hot_leads
--   Sonnet 4.6 : reviews, social, sales
--   Opus 4.7   : manager
-- Cron schedules in Asia/Jerusalem (we'll handle TZ in app code)
-- ============================================================================

insert into public.agents (id, name_he, description_he, default_model, default_schedule, icon, display_order)
values
  ('morning',
   'סוכן בוקר',
   'דוח יומי שמחכה לך כל בוקר ב-7:00. מסכם את אתמול, מציג את היום, ומסמן הזדמנויות חמות.',
   'claude-haiku-4-5',
   '0 7 * * *',
   '☀️',
   1),

  ('reviews',
   'סוכן ביקורות',
   'סורק ביקורות חדשות ב-Google ובאינסטגרם, מנסח טיוטות תגובה בעברית, ומתריע על ביקורות שדורשות טיפול דחוף.',
   'claude-sonnet-4-6',
   '0 */2 * * *',
   '⭐',
   2),

  ('social',
   'סוכן רשתות',
   '3 פוסטים ביום (9:00, 14:00, 19:00), מותאמים לטון של העסק. מוכנים ללחיצה אחת והעלאה.',
   'claude-sonnet-4-6',
   '0 6 * * *',
   '📱',
   3),

  ('manager',
   'סוכן מנהל',
   'סיכום אסטרטגי יומי בעברית עם המלצות אמיתיות. כמו מנהל אישי שמכיר את העסק שלך.',
   'claude-opus-4-7',
   '0 19 * * *',
   '🧠',
   4),

  ('watcher',
   'סוכן מעקב',
   'התראות בזמן אמת על אירועים חמים — לקוח חדש, ביקורת חדשה, ליד שמתקרר. אתה הראשון לדעת.',
   'claude-haiku-4-5',
   '*/15 * * * *',
   '🎯',
   5),

  ('cleanup',
   'סוכן ניקיון',
   'מנקה אוטומטית לידים מתים, מתריע על תקועים, ושומר על pipeline נקי ומסודר.',
   'claude-haiku-4-5',
   '0 9 * * 0',
   '🧹',
   6),

  ('sales',
   'סוכן מכירות',
   'מנתח deals תקועים, מסמן לידים חמים, ומנסח follow-ups שמחזירים שיחות לחיים.',
   'claude-sonnet-4-6',
   '0 10 * * 0-4',
   '💰',
   7),

  ('inventory',
   'סוכן מלאי',
   'מתריע על מלאי נמוך לפני שאוזל, חוזה ביקוש, ומסמן מוצרים שמתחילים לרדת בביצועים.',
   'claude-haiku-4-5',
   '0 8 * * *',
   '📦',
   8),

  ('hot_leads',
   'סוכן לידים חמים',
   'מדרג לידים נכנסים אוטומטית, מתעדף לפי סבירות לסגירה, ומסמן את אלה ששווה לחזור אליהם עכשיו.',
   'claude-haiku-4-5',
   '*/30 * * * *',
   '🔥',
   9);

-- ============================================================================
-- PLACEHOLDER PROMPTS (v1)
-- These are minimal stubs — real prompts get filled in Day 3+ when we wire up
-- each agent end-to-end. The schema requires at least one prompt per agent
-- so client_agents can reference one.
-- ============================================================================

insert into public.agent_prompts (agent_id, version, template, output_schema)
values
  ('morning', 1,
   'You are the Morning Briefing agent for {{BUSINESS_NAME}}, a {{BUSINESS_TYPE}} in Israel. Generate a concise daily brief in natural Hebrew. PLACEHOLDER — full prompt in Day 3.',
   '{"type":"object","properties":{"greeting":{"type":"string"},"yesterday_highlights":{"type":"array"},"today_priorities":{"type":"array"},"anomalies":{"type":"array"},"suggested_focus":{"type":"string"}},"required":["greeting","yesterday_highlights","today_priorities"]}'::jsonb),

  ('reviews', 1,
   'You are the Reviews agent. Draft a Hebrew response to a Google/Instagram review on behalf of {{BUSINESS_NAME}}. PLACEHOLDER — full prompt in Day 5.',
   '{"type":"object","properties":{"sentiment":{"type":"string"},"response_he":{"type":"string"},"requires_human_review":{"type":"boolean"},"escalation_reason":{"type":"string"}},"required":["sentiment","response_he","requires_human_review"]}'::jsonb),

  ('social', 1,
   'You are the Social Posts agent for {{BUSINESS_NAME}}. Generate 3 Hebrew post drafts. PLACEHOLDER.',
   '{"type":"object","properties":{"posts":{"type":"array"}},"required":["posts"]}'::jsonb),

  ('manager', 1,
   'You are the Strategic Manager agent for {{BUSINESS_NAME}}. Synthesize today across all agents. PLACEHOLDER.',
   '{"type":"object","properties":{"headline":{"type":"string"},"weekly_trend":{"type":"string"},"top_decisions":{"type":"array"},"red_flags":{"type":"array"},"opportunities":{"type":"array"}},"required":["headline","top_decisions"]}'::jsonb),

  ('watcher', 1,
   'You are the Real-time Watcher agent. Decide whether an event warrants alerting the owner. PLACEHOLDER.',
   '{"type":"object","properties":{"should_alert":{"type":"boolean"},"severity":{"type":"string"},"headline_he":{"type":"string"},"recommended_action":{"type":"string"}},"required":["should_alert","severity"]}'::jsonb),

  ('cleanup', 1,
   'You are the Lead Pipeline Hygiene agent. Scan leads for stale/duplicate/missing-followup. PLACEHOLDER.',
   '{"type":"object","properties":{"stale_leads":{"type":"array"},"duplicates":{"type":"array"},"missing_followup":{"type":"array"}}}'::jsonb),

  ('sales', 1,
   'You are the Sales Deal Analysis agent. Analyze open deals and propose follow-up emails in Hebrew. PLACEHOLDER.',
   '{"type":"object","properties":{"deals":{"type":"array"}},"required":["deals"]}'::jsonb),

  ('inventory', 1,
   'You are the Inventory agent. Detect low stock, forecast demand. PLACEHOLDER.',
   '{"type":"object","properties":{"low_stock":{"type":"array"},"demand_forecast":{"type":"array"}}}'::jsonb),

  ('hot_leads', 1,
   'You are the Hot Leads Scoring agent. Score new leads 0-100 and propose first message in Hebrew. PLACEHOLDER.',
   '{"type":"object","properties":{"lead_id":{"type":"string"},"score":{"type":"integer"},"priority":{"type":"string"},"why":{"type":"array"},"recommended_first_message_he":{"type":"string"}},"required":["lead_id","score","priority"]}'::jsonb);

-- ============================================================================
-- LINK each agent to its v1 prompt as the default
-- ============================================================================

update public.agents a
   set default_prompt_id = (
     select id from public.agent_prompts p
     where p.agent_id = a.id and p.version = 1
   );

-- ============================================================================
-- VERIFICATION QUERIES (run these manually to confirm)
-- ============================================================================

-- select count(*) from public.agents;        -- should be 9
-- select count(*) from public.agent_prompts; -- should be 9
-- select id, name_he, default_model, icon from public.agents order by display_order;

-- ============================================================================
-- DONE — 9 AGENTS SEEDED, READY FOR FIRST CLIENT
-- ============================================================================
