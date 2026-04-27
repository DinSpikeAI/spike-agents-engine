-- ============================================================================
-- Spike Agents Engine — Schema 2.0
-- File: 007_seed.sql
-- Purpose: Insert the 9 agents with research-validated model assignments.
-- Run order: SEVENTH and FINAL (after 006_hook.sql)
--
-- Changes from v1 seed:
--   - Manager: Opus 4.7 → Sonnet 4.6 + extended thinking 8000 tokens
--     (Opus 4.7's new tokenizer inflates Hebrew tokens by ~30%, eating its
--     price-equivalence; Sonnet+thinking matches Opus quality at SMB scale)
--   - Inventory: now has thinking_budget = 2048 for forecasting reasoning
--   - All cache_ttl set explicitly to '1h' (default fell to 5m in March 2026)
--   - output_schema is native Anthropic JSON Schema format, not tool_use
-- ============================================================================

-- ============================================================================
-- 9 AGENTS
-- ============================================================================

insert into public.agents (
  id, name_he, description_he, default_model,
  default_thinking_budget, default_cache_ttl,
  default_schedule, icon, display_order
) values
  ('morning',
   'סוכן בוקר',
   'דוח יומי שמחכה לך כל בוקר ב-7:00. מסכם את אתמול, מציג את היום, ומסמן הזדמנויות חמות.',
   'claude-haiku-4-5', null, '1h',
   '0 7 * * *', '☀️', 1),

  ('reviews',
   'סוכן ביקורות',
   'סורק ביקורות חדשות ב-Google ובאינסטגרם, מנסח טיוטות תגובה בעברית, ומתריע על ביקורות שדורשות טיפול דחוף.',
   'claude-sonnet-4-6', null, '1h',
   '0 */2 * * *', '⭐', 2),

  ('social',
   'סוכן רשתות',
   '3 פוסטים ביום (9:00, 14:00, 19:00), מותאמים לטון של העסק. מוכנים ללחיצה אחת והעלאה.',
   'claude-sonnet-4-6', null, '1h',
   '0 6 * * *', '📱', 3),

  ('manager',
   'סוכן מנהל',
   'סיכום אסטרטגי יומי בעברית עם המלצות אמיתיות. כמו מנהל אישי שמכיר את העסק שלך.',
   'claude-sonnet-4-6', 8000, '1h',          -- Sonnet + extended thinking (was Opus)
   '0 19 * * *', '🧠', 4),

  ('watcher',
   'סוכן מעקב',
   'התראות בזמן אמת על אירועים חמים — לקוח חדש, ביקורת חדשה, ליד שמתקרר. אתה הראשון לדעת.',
   'claude-haiku-4-5', null, '5m',           -- 5m cache OK for high-frequency runs
   '*/15 * * * *', '🎯', 5),

  ('cleanup',
   'סוכן ניקיון',
   'מנקה אוטומטית לידים מתים, מתריע על תקועים, ושומר על pipeline נקי ומסודר.',
   'claude-haiku-4-5', null, '1h',
   '0 9 * * 0', '🧹', 6),

  ('sales',
   'סוכן מכירות',
   'מנתח deals תקועים, מסמן לידים חמים, ומנסח follow-ups שמחזירים שיחות לחיים.',
   'claude-sonnet-4-6', null, '1h',
   '0 10 * * 0-4', '💰', 7),

  ('inventory',
   'סוכן מלאי',
   'מתריע על מלאי נמוך לפני שאוזל, חוזה ביקוש, ומסמן מוצרים שמתחילים לרדת בביצועים.',
   'claude-haiku-4-5', 2048, '1h',           -- thinking for forecasting reasoning
   '0 8 * * *', '📦', 8),

  ('hot_leads',
   'סוכן לידים חמים',
   'מדרג לידים נכנסים אוטומטית, מתעדף לפי סבירות לסגירה, ומסמן את אלה ששווה לחזור אליהם עכשיו.',
   'claude-haiku-4-5', null, '5m',           -- 5m cache OK for frequent runs
   '*/30 * * * *', '🔥', 9);

-- ============================================================================
-- PROMPTS v1 (placeholders — real prompts arrive Day 3+ per agent build)
-- output_schema = native Anthropic JSON Schema (passed to output_config.format)
-- cache_breakpoints = where to insert cache_control on the system prompt
-- ============================================================================

insert into public.agent_prompts (agent_id, version, template, output_schema, cache_breakpoints) values

  ('morning', 1,
   'You are the Morning Briefing agent for {{TENANT_NAME}}, a {{BUSINESS_TYPE}} in Israel. ' ||
   'Generate a concise daily brief in natural Hebrew. Use {{USER_GENDER}} forms. ' ||
   'PLACEHOLDER — full prompt in Day 3.',
   '{
      "type": "object",
      "properties": {
        "greeting": {"type": "string", "description": "Hebrew greeting"},
        "yesterday_highlights": {"type": "array", "items": {"type": "string"}},
        "today_priorities": {"type": "array", "items": {"type": "string"}},
        "anomalies": {"type": "array", "items": {"type": "string"}},
        "suggested_focus": {"type": "string"}
      },
      "required": ["greeting", "yesterday_highlights", "today_priorities"],
      "additionalProperties": false
    }'::jsonb,
   '[{"position": "system_end", "ttl": "1h"}]'::jsonb),

  ('reviews', 1,
   'You are the Reviews agent for {{TENANT_NAME}}. Draft a Hebrew response to a Google/Instagram review. ' ||
   'Match the tone {{BUSINESS_TONE}}. Use {{USER_GENDER}} forms. PLACEHOLDER — full prompt in Day 5.',
   '{
      "type": "object",
      "properties": {
        "sentiment": {"type": "string", "enum": ["positive", "neutral", "negative", "mixed"]},
        "response_he": {"type": "string", "description": "Reply in Hebrew, 200-400 chars"},
        "requires_human_review": {"type": "boolean"},
        "escalation_reason": {"type": "string"}
      },
      "required": ["sentiment", "response_he", "requires_human_review"],
      "additionalProperties": false
    }'::jsonb,
   '[{"position": "system_end", "ttl": "1h"}]'::jsonb),

  ('social', 1,
   'You are the Social Posts agent for {{TENANT_NAME}}. Generate 3 Hebrew post drafts. PLACEHOLDER.',
   '{
      "type": "object",
      "properties": {
        "posts": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "platform": {"type": "string", "enum": ["instagram", "facebook", "tiktok"]},
              "text_he": {"type": "string"},
              "hashtags": {"type": "array", "items": {"type": "string"}},
              "scheduled_for": {"type": "string"}
            },
            "required": ["platform", "text_he"]
          },
          "minItems": 3, "maxItems": 3
        }
      },
      "required": ["posts"],
      "additionalProperties": false
    }'::jsonb,
   '[{"position": "system_end", "ttl": "1h"}]'::jsonb),

  ('manager', 1,
   'You are the Strategic Manager agent for {{TENANT_NAME}}. Use extended thinking to synthesize ' ||
   'cross-agent activity into actionable insights. Hebrew output. {{USER_GENDER}} forms. PLACEHOLDER.',
   '{
      "type": "object",
      "properties": {
        "headline": {"type": "string"},
        "weekly_trend": {"type": "string"},
        "top_decisions": {"type": "array", "items": {"type": "string"}},
        "red_flags": {"type": "array", "items": {"type": "string"}},
        "opportunities": {"type": "array", "items": {"type": "string"}}
      },
      "required": ["headline", "top_decisions"],
      "additionalProperties": false
    }'::jsonb,
   '[{"position": "system_end", "ttl": "1h"}]'::jsonb),

  ('watcher', 1,
   'You are the Real-time Watcher agent. Decide whether an event warrants alerting the owner. PLACEHOLDER.',
   '{
      "type": "object",
      "properties": {
        "should_alert": {"type": "boolean"},
        "severity": {"type": "string", "enum": ["info", "warn", "urgent"]},
        "headline_he": {"type": "string"},
        "recommended_action": {"type": "string"}
      },
      "required": ["should_alert", "severity"],
      "additionalProperties": false
    }'::jsonb,
   '[{"position": "system_end", "ttl": "5m"}]'::jsonb),

  ('cleanup', 1,
   'You are the Lead Pipeline Hygiene agent. Scan for stale/duplicate/missing-followup leads. PLACEHOLDER.',
   '{
      "type": "object",
      "properties": {
        "stale_leads": {"type": "array", "items": {"type": "object"}},
        "duplicates": {"type": "array", "items": {"type": "object"}},
        "missing_followup": {"type": "array", "items": {"type": "object"}}
      },
      "additionalProperties": false
    }'::jsonb,
   '[{"position": "system_end", "ttl": "1h"}]'::jsonb),

  ('sales', 1,
   'You are the Sales Deal Analysis agent. Analyze open deals and propose Hebrew follow-ups. PLACEHOLDER.',
   '{
      "type": "object",
      "properties": {
        "deals": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "deal_id": {"type": "string"},
              "stage": {"type": "string"},
              "recommended_action": {"type": "string"},
              "draft_message_he": {"type": "string"}
            },
            "required": ["deal_id", "recommended_action"]
          }
        }
      },
      "required": ["deals"],
      "additionalProperties": false
    }'::jsonb,
   '[{"position": "system_end", "ttl": "1h"}]'::jsonb),

  ('inventory', 1,
   'You are the Inventory agent. Use extended thinking for demand forecasting. PLACEHOLDER.',
   '{
      "type": "object",
      "properties": {
        "low_stock": {"type": "array", "items": {"type": "object"}},
        "demand_forecast": {"type": "array", "items": {"type": "object"}},
        "underperforming": {"type": "array", "items": {"type": "object"}}
      },
      "additionalProperties": false
    }'::jsonb,
   '[{"position": "system_end", "ttl": "1h"}]'::jsonb),

  ('hot_leads', 1,
   'You are the Hot Leads Scoring agent. Use BUCKETED output (cold/warm/hot/burning) ' ||
   'NOT freeform 0-100 — small models cluster around 50/70/85. PLACEHOLDER.',
   '{
      "type": "object",
      "properties": {
        "lead_id": {"type": "string"},
        "bucket": {"type": "string", "enum": ["cold", "warm", "hot", "burning"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "signals": {
          "type": "object",
          "properties": {
            "recency": {"type": "integer", "minimum": 0, "maximum": 25},
            "engagement": {"type": "integer", "minimum": 0, "maximum": 25},
            "fit": {"type": "integer", "minimum": 0, "maximum": 25},
            "intent": {"type": "integer", "minimum": 0, "maximum": 25}
          },
          "required": ["recency", "engagement", "fit", "intent"]
        },
        "recommended_first_message_he": {"type": "string"}
      },
      "required": ["lead_id", "bucket", "signals"],
      "additionalProperties": false
    }'::jsonb,
   '[{"position": "system_end", "ttl": "5m"}]'::jsonb);

-- ============================================================================
-- LINK each agent to its v1 prompt as the default
-- ============================================================================

update public.agents a
   set default_prompt_id = (
     select id from public.agent_prompts p
     where p.agent_id = a.id and p.version = 1
   );

-- ============================================================================
-- VERIFICATION (run manually after seed completes)
-- ============================================================================

-- select count(*) from public.agents;        -- should be 9
-- select count(*) from public.agent_prompts; -- should be 9
-- select id, name_he, default_model, default_thinking_budget, default_cache_ttl, icon
--   from public.agents order by display_order;

-- ============================================================================
-- DONE — 9 agents seeded with research-validated config.
-- Schema 2.0 is now live and ready for Day 2 application code.
-- ============================================================================
