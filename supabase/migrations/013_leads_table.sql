-- supabase/migrations/013_leads_table.sql
--
-- Day 9 — Leads & hot_leads classification.
--
-- The hot_leads agent does CLASSIFICATION (not drafting).
-- Output: bucket (cold/warm/hot/blazing) per inbound lead.
--
-- Why a dedicated table (not drafts):
--   - drafts has lifecycle: pending → approved → sent (outbound action)
--   - leads has lifecycle: new → classified → contacted/dismissed (inbound)
--   - Different fields, different queries, different UI
--
-- The hot_leads table stores:
--   - The raw inbound message (what the prospect said)
--   - The CONTEXT shown to owner (full name, channel, time)
--   - The FEATURES extracted by code (NOT the LLM) — these are what
--     bias audits will analyze. No name, no demographic — only behavior.
--   - The bucket assigned by the LLM (Haiku 4.5 with bucketed enum)
--   - The reason (Hebrew explanation for the owner)

CREATE TABLE IF NOT EXISTS hot_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Provenance: which agent run classified this lead
  agent_run_id UUID REFERENCES agent_runs(id),

  -- Source identity (display only — the LLM does NOT see the name)
  source TEXT NOT NULL,           -- 'whatsapp', 'instagram_dm', 'website_form', 'email'
  source_handle TEXT,             -- @username, phone (hashed for storage), email
  display_name TEXT,              -- "יוסי לוי" — owner sees this. LLM does NOT.

  -- The actual message content (what the prospect wrote)
  raw_message TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,

  -- Behavior features extracted by code (NOT LLM). These are bias-audit-safe.
  -- score_features is JSONB so we can evolve without migrations.
  -- Required keys (bias audit checks for presence):
  --   response_time_minutes, message_length_tokens, intent_keywords_count,
  --   urgency_signals_count, has_specific_product, mentioned_budget
  score_features JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Classification output (LLM result)
  bucket TEXT CHECK (bucket IN ('cold', 'warm', 'hot', 'blazing', 'spam_or_unclear')),
  reason TEXT,                    -- Hebrew explanation for owner
  suggested_action TEXT,          -- Hebrew CTA: 'התקשר תוך 30 דק', 'שלח email תוך 24h', etc.

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'classified' CHECK (status IN (
    'new',           -- received, not yet classified
    'classified',    -- LLM has assigned a bucket
    'contacted',     -- owner has reached out
    'converted',     -- became a customer
    'dismissed',     -- owner dismissed (not a real lead, or not interested)
    'expired'        -- too old, no action taken
  )),

  -- Action tracking
  contacted_at TIMESTAMPTZ,
  contacted_by_user_id UUID REFERENCES auth.users(id),
  dismissed_at TIMESTAMPTZ,
  dismissed_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS — same pattern as drafts
ALTER TABLE hot_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE hot_leads FORCE ROW LEVEL SECURITY;

CREATE POLICY hot_leads_select_for_members
  ON hot_leads
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- Indexes for the leads board
CREATE INDEX IF NOT EXISTS idx_hot_leads_per_tenant_bucket
  ON hot_leads (tenant_id, bucket, received_at DESC)
  WHERE status IN ('new', 'classified');

CREATE INDEX IF NOT EXISTS idx_hot_leads_blazing
  ON hot_leads (tenant_id, received_at DESC)
  WHERE bucket = 'blazing' AND status = 'classified';

-- Documentation
COMMENT ON TABLE hot_leads IS
  'Classification of inbound leads (WhatsApp DMs, Instagram DMs, contact forms, emails). The LLM receives ONLY behavior features (no name, no demographic) — bias audit constraint per Day 9 plan.';

COMMENT ON COLUMN hot_leads.score_features IS
  'Behavior-only features extracted by code (not LLM). Required keys: response_time_minutes, message_length_tokens, intent_keywords_count, urgency_signals_count, has_specific_product, mentioned_budget. Used by monthly bias audit to check bucket distribution across name-clusters.';

COMMENT ON COLUMN hot_leads.display_name IS
  'Display name shown to the owner in the UI. NEVER passed to the LLM. This is the bias firewall.';

COMMENT ON COLUMN hot_leads.bucket IS
  'Bucketed enum (not 0-100 score). Haiku 4.5 clusters around 50/70/85 in freeform — bucketing is mandatory for quality.';
