-- =================================================================
-- Spike Engine — Legal Compliance Migration
-- =================================================================
-- מיגרציה זו יוצרת את הטבלאות הנדרשות לתיעוד הסכמות משפטיות וניהול
-- בקשות DSAR. נדרש לפי תיקון 13 + סעיף 30א + תקנות אבטחת מידע 2017.
--
-- הוראות להפעלה:
-- 1. הריץ את הקובץ הזה דרך Supabase SQL Editor או psql
-- 2. ודא שה-RLS policies הופעלו (Row Level Security)
-- 3. בדוק שה-INDEXES נוצרו (חיוני לביצועים בקריאת היסטוריית הסכמות)
-- =================================================================

BEGIN;

-- =================================================================
-- TABLE: consent_log
-- =================================================================
-- תיעוד כל הסכמה משפטית של משתמש (ToS, Privacy, AUP, DPA, Cookie)
-- שמירה: 7 שנים (תקופת התיישנות תיקון 13 לתביעות אזרחיות)
-- ראיה ל: סעיף 7A לחוק לשון הרע, סעיף 30א, תיקון 13

CREATE TABLE IF NOT EXISTS public.consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHO consented (NULL allowed for anonymous cookie banner consent)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- WHAT they consented to
  document_type TEXT NOT NULL CHECK (document_type IN (
    'terms_of_service',
    'privacy_policy',
    'acceptable_use_policy',
    'data_processing_agreement',
    'cookie_policy',
    'marketing_consent'
  )),
  document_version TEXT NOT NULL CHECK (length(document_version) <= 20),

  -- THE consent itself
  consented BOOLEAN NOT NULL,

  -- HOW they consented
  consent_method TEXT NOT NULL CHECK (consent_method IN (
    'checkbox_signup',
    'checkbox_settings_update',
    'cookie_banner',
    'tos_update_modal',
    'api_acceptance'
  )),

  -- EVIDENCE for audit trail
  ip_address TEXT,
  user_agent TEXT CHECK (length(user_agent) <= 500),

  -- WHEN
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- IMMUTABILITY: once written, never updated. Trigger below enforces.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INDEXES for common queries
CREATE INDEX IF NOT EXISTS idx_consent_log_user_id
  ON public.consent_log(user_id);

CREATE INDEX IF NOT EXISTS idx_consent_log_user_doc
  ON public.consent_log(user_id, document_type, consented_at DESC);

CREATE INDEX IF NOT EXISTS idx_consent_log_consented_at
  ON public.consent_log(consented_at DESC);

-- IMMUTABILITY trigger - prevent UPDATE/DELETE on consent records
-- (consents are append-only audit log; new consent = new row)
CREATE OR REPLACE FUNCTION prevent_consent_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'consent_log records are immutable; insert a new row instead'
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_update_consent_log ON public.consent_log;
CREATE TRIGGER prevent_update_consent_log
  BEFORE UPDATE ON public.consent_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_consent_log_modification();

DROP TRIGGER IF EXISTS prevent_delete_consent_log ON public.consent_log;
CREATE TRIGGER prevent_delete_consent_log
  BEFORE DELETE ON public.consent_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_consent_log_modification();

-- RLS: users can read their own consents, never modify
ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own consents" ON public.consent_log;
CREATE POLICY "Users can read own consents"
  ON public.consent_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT only via service role (the API route uses service_role key)
-- No public INSERT policy = only service_role can insert. Good.

COMMENT ON TABLE public.consent_log IS
  'Immutable audit log of all legal consents (ToS, Privacy, AUP, DPA, Cookie). Required for Amendment 13 + §30A evidence. Retention: 7 years.';

-- =================================================================
-- TABLE: dsar_log
-- =================================================================
-- תיעוד בקשות נושא מידע (Data Subject Access Requests)
-- חובה לפי תיקון 13 §13 + §14 — מענה תוך 30 יום

CREATE TABLE IF NOT EXISTS public.dsar_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request metadata
  requester_email TEXT NOT NULL,
  requester_phone TEXT,
  requester_name TEXT,

  -- Type of request
  request_type TEXT NOT NULL CHECK (request_type IN (
    'access',           -- §13 PPL
    'correction',       -- §14 PPL
    'deletion',         -- post-Amendment 13
    'objection',        -- §17ה - direct marketing opt-out
    'data_portability', -- GDPR (for EU subjects)
    'unknown'
  )),

  -- B2B vs B2B2C - Spike's role differs
  request_role TEXT NOT NULL CHECK (request_role IN (
    'b2b_account_holder',     -- Spike is Controller; respond directly
    'b2b2c_end_consumer'      -- Spike is Holder; redirect to SMB Controller
  )),

  -- If B2B2C, which customer SMB does this end-consumer belong to?
  related_customer_id UUID,

  -- Request content
  request_scope TEXT NOT NULL,

  -- Identity verification
  identity_verified BOOLEAN NOT NULL DEFAULT false,
  identity_verification_method TEXT CHECK (identity_verification_method IN (
    'email_otp',
    'sms_otp',
    'email_and_sms_otp',
    'id_upload',
    'existing_channel_verification',
    'redirected_to_controller',
    'pending'
  )),

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
    'received',
    'identity_pending',
    'redirected',
    'in_progress',
    'fulfilled',
    'partially_fulfilled',
    'refused',
    'expired'
  )),

  -- Response details (filled when status moves to fulfilled/refused)
  response_summary TEXT,
  refusal_reason TEXT,
  refusal_statutory_basis TEXT, -- e.g., "PPL §13(c) - trade secret"

  -- Timestamps
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  identity_verified_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),

  -- Handler (currently Dean only)
  handled_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Free-form notes (internal, never shared with requester)
  internal_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsar_log_email
  ON public.dsar_log(requester_email);

CREATE INDEX IF NOT EXISTS idx_dsar_log_status_due
  ON public.dsar_log(status, due_at)
  WHERE status NOT IN ('fulfilled', 'refused', 'expired');

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_dsar_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dsar_log_updated_at_trigger ON public.dsar_log;
CREATE TRIGGER dsar_log_updated_at_trigger
  BEFORE UPDATE ON public.dsar_log
  FOR EACH ROW
  EXECUTE FUNCTION update_dsar_log_updated_at();

ALTER TABLE public.dsar_log ENABLE ROW LEVEL SECURITY;

-- Only authenticated admins can read DSARs (via service role)
-- No regular user policies — DSARs handled via admin dashboard

COMMENT ON TABLE public.dsar_log IS
  'Tracking of Data Subject Access Requests under PPL §13/§14 (post-Amendment 13). 30-day response SLA. Retention: 7 years from resolution.';

-- =================================================================
-- TABLE: unsubscribe_log
-- =================================================================
-- תיעוד בקשות הסרה משיווק (סעיף 30א)
-- ₪1,000 חשיפה סטטוטורית פר הודעה אם לא מכובדת

CREATE TABLE IF NOT EXISTS public.unsubscribe_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Recipient identifier (one of these must be present)
  email TEXT,
  phone TEXT,

  -- Channel
  channel TEXT NOT NULL CHECK (channel IN (
    'email',
    'whatsapp',
    'sms',
    'instagram_dm'
  )),

  -- Source (where the unsubscribe came from)
  source TEXT NOT NULL CHECK (source IN (
    'unsubscribe_link',    -- recipient clicked the link
    'reply_keyword',       -- "הסר", "STOP", etc.
    'manual_admin',        -- admin manually added
    'do_not_contact'       -- regulatory request
  )),

  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Metadata
  ip_address TEXT,
  notes TEXT,

  CONSTRAINT email_or_phone_required
    CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unsubscribe_email_channel
  ON public.unsubscribe_log(email, channel)
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unsubscribe_phone_channel
  ON public.unsubscribe_log(phone, channel)
  WHERE phone IS NOT NULL;

ALTER TABLE public.unsubscribe_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.unsubscribe_log IS
  '§30א opt-out registry. Honored across all channels. Retention: indefinite (consent withdrawal is permanent).';

-- =================================================================
-- HELPFUL VIEWS
-- =================================================================

-- View: latest consent per user per document type
CREATE OR REPLACE VIEW public.user_current_consents AS
SELECT DISTINCT ON (user_id, document_type)
  user_id,
  document_type,
  document_version,
  consented,
  consented_at,
  consent_method
FROM public.consent_log
WHERE user_id IS NOT NULL
ORDER BY user_id, document_type, consented_at DESC;

GRANT SELECT ON public.user_current_consents TO authenticated;

COMMENT ON VIEW public.user_current_consents IS
  'Latest consent state per user per document type. Use this for live UX (showing whether re-consent is needed).';

-- View: overdue DSAR requests (red flag dashboard)
CREATE OR REPLACE VIEW public.overdue_dsars AS
SELECT
  id,
  requester_email,
  request_type,
  request_role,
  status,
  received_at,
  due_at,
  EXTRACT(DAY FROM (now() - due_at))::INT as days_overdue
FROM public.dsar_log
WHERE
  status NOT IN ('fulfilled', 'refused', 'expired')
  AND due_at < now()
ORDER BY due_at ASC;

COMMENT ON VIEW public.overdue_dsars IS
  'DSARs past 30-day statutory deadline. Should always be empty.';

-- =================================================================
-- DONE
-- =================================================================

COMMIT;

-- Verification query (run after migration to confirm all created):
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('consent_log', 'dsar_log', 'unsubscribe_log');
