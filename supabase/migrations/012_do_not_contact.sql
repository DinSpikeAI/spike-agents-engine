-- supabase/migrations/012_do_not_contact.sql
--
-- Day 7 — §30A Spam Law compliance.
--
-- Israel's Communications Law (Bezeq), 1982, §30A requires:
--   - One-click unsubscribe via the same channel
--   - Honored within 3 business days
--   - Penalties up to ₪202,000 per breach + ₪1,000 per recipient class action
--
-- This table is the source of truth for "do not message this person on this
-- channel". Every outbound agent run MUST check this BEFORE generating a draft.
--
-- Privacy: recipient_hash is sha256(channel || normalized_recipient).
-- Never store plaintext phone/email/handle here.

CREATE TABLE IF NOT EXISTS do_not_contact (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN (
    'whatsapp', 'sms', 'email', 'instagram_dm', 'phone_call'
  )),
  recipient_hash TEXT NOT NULL,

  -- When and why
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT, -- 'one_click_unsubscribe', 'manual_owner_action', 'sender_complaint'

  -- The legal exhibit: who recorded the unsubscribe
  recorded_by_user_id UUID REFERENCES auth.users(id),
  source TEXT, -- 'inbound_email_unsubscribe_link', 'whatsapp_stop_keyword', 'dashboard'

  PRIMARY KEY (tenant_id, channel, recipient_hash)
);

ALTER TABLE do_not_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE do_not_contact FORCE ROW LEVEL SECURITY;

-- RLS: members of the tenant can read; only service_role can write
-- (writes happen from server actions or webhook handlers).
CREATE POLICY do_not_contact_select_for_members
  ON do_not_contact
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- Service-role has implicit access; no INSERT/UPDATE/DELETE policy for
-- regular users. The unsubscribe endpoint runs as server action.

CREATE INDEX IF NOT EXISTS idx_do_not_contact_lookup
  ON do_not_contact (tenant_id, channel, recipient_hash);

COMMENT ON TABLE do_not_contact IS
  '§30A Israeli Spam Law compliance. Every outbound agent run must check (tenant_id, channel, recipient_hash) BEFORE generating a draft. Honoring unsubscribes is a legal requirement within 3 business days; this table is the source of truth.';

COMMENT ON COLUMN do_not_contact.recipient_hash IS
  'sha256(channel || normalized_recipient). Never store plaintext. For phone: digits only with +972 prefix. For email: lowercased.';
