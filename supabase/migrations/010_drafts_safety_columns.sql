-- supabase/migrations/010_drafts_safety_columns.sql
-- 
-- Day 7 — Safety layer for the drafts table.
-- 
-- Drafts table already exists (status: pending/approved/rejected/expired/sent,
-- approved_by, approved_at, content jsonb, expires_at). We extend it with the
-- safety signals required by the Israeli Compliance Protocol:
--
--   1. action_type — encodes "AI marks, owner decides" iron rule:
--      - never_auto: discounts, refunds, public commitments → blocked from autosend
--      - requires_approval: outbound (review reply, DM, email) → human gate
--      - autosend_safe: internal-only (morning brief, watcher alerts in dashboard)
--
--   2. defamation_risk + flagged_phrases — output of the Haiku classifier
--      that runs on every reviews_agent draft (Israeli Defamation Law 5725-1965)
--
--   3. contains_pii + pii_scrubbed — tracks whether end-customer PII was
--      detected in input and whether scrubber neutralized it before LLM call
--
--   4. rejected_at + rejection_reason — closes the audit loop. Existing
--      schema has approved_at but no rejection trail.
--
--   5. recipient_hash + recipient_label — separate the displayable recipient
--      ("יוסי לוי" for the owner UI) from the hashable identifier (for
--      do_not_contact lookups + privacy minimization in logs).

ALTER TABLE drafts
  ADD COLUMN IF NOT EXISTS action_type TEXT
    CHECK (action_type IN ('never_auto', 'requires_approval', 'autosend_safe')),

  ADD COLUMN IF NOT EXISTS defamation_risk TEXT
    CHECK (defamation_risk IN ('low', 'medium', 'high')),

  ADD COLUMN IF NOT EXISTS defamation_flagged_phrases TEXT[],

  ADD COLUMN IF NOT EXISTS contains_pii BOOLEAN DEFAULT FALSE,

  ADD COLUMN IF NOT EXISTS pii_scrubbed BOOLEAN DEFAULT FALSE,

  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,

  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,

  ADD COLUMN IF NOT EXISTS recipient_hash TEXT,

  ADD COLUMN IF NOT EXISTS recipient_label TEXT;

-- Index for the Approval Inbox query: tenant's pending drafts ordered by creation.
CREATE INDEX IF NOT EXISTS idx_drafts_pending_per_tenant
  ON drafts (tenant_id, created_at DESC)
  WHERE status = 'pending';

-- Index for defamation review: high-risk drafts surfaced for owner attention.
CREATE INDEX IF NOT EXISTS idx_drafts_high_risk
  ON drafts (tenant_id, defamation_risk, created_at DESC)
  WHERE defamation_risk = 'high';

-- Comment the columns for future Claude/dev sessions reading the schema.
COMMENT ON COLUMN drafts.action_type IS
  'Encodes the iron rule: never_auto (no autosend ever), requires_approval (human gate), autosend_safe (internal only).';

COMMENT ON COLUMN drafts.defamation_risk IS
  'Output of post-generation Haiku classifier per Israeli Defamation Law (5725-1965). high → blocked from approval queue.';

COMMENT ON COLUMN drafts.contains_pii IS
  'TRUE if PII (israeli_id, phone, email, iban, credit_card) was detected in the source content before LLM processing.';

COMMENT ON COLUMN drafts.recipient_hash IS
  'Hashed recipient identifier for do_not_contact joins. Never sent to LLM. Use sha256(channel || normalized_recipient).';

COMMENT ON COLUMN drafts.recipient_label IS
  'Display-only label for the owner UI (e.g., "יוסי לוי"). May contain the data point name.';
