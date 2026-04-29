-- supabase/migrations/011_tenants_compliance_columns.sql
--
-- Day 7 — Compliance fields for the tenants table.
--
-- Required for:
--   1. business_owner_gender — Hebrew gender lock (avoid male/female/plural mismatch
--      in agent output). Locked at onboarding; injected into every system prompt.
--
--   2. business_id_number — ת.ז. (individual) or ח.פ. (company). Required for
--      §30A Spam Law footer on every outbound agent message.
--
--   3. business_address + business_phone — also §30A footer requirements.
--
--   4. consent_status — tracks whether the tenant has obtained §11A consent
--      from end-customers. While 'pending', all agents lock to draft-only mode.
--
--   5. dpa_accepted_at + dpa_accepted_by — Data Processing Agreement timestamp.
--      Records the legal exhibit that customer (controller) acknowledged Spike
--      Engine's processor role and the prohibited-inputs list.
--
--   6. accessibility_acknowledged_at — IS 5568 accessibility statement
--      acknowledgment in onboarding.
--
-- All new columns are nullable to allow incremental backfill via the Day 8
-- onboarding wizard. No data is destroyed.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS business_owner_gender TEXT
    CHECK (business_owner_gender IN ('male', 'female', 'plural')),

  ADD COLUMN IF NOT EXISTS business_id_number TEXT,

  ADD COLUMN IF NOT EXISTS business_id_type TEXT
    CHECK (business_id_type IN ('teudat_zehut', 'hp_number', 'osek_morshe', 'osek_patur')),

  ADD COLUMN IF NOT EXISTS business_address TEXT,

  ADD COLUMN IF NOT EXISTS business_phone TEXT,

  ADD COLUMN IF NOT EXISTS consent_status TEXT
    CHECK (consent_status IN ('pending', 'partial', 'full'))
    DEFAULT 'pending',

  ADD COLUMN IF NOT EXISTS dpa_accepted_at TIMESTAMPTZ,

  ADD COLUMN IF NOT EXISTS dpa_accepted_by UUID REFERENCES auth.users(id),

  ADD COLUMN IF NOT EXISTS dpa_version TEXT,

  ADD COLUMN IF NOT EXISTS accessibility_acknowledged_at TIMESTAMPTZ,

  ADD COLUMN IF NOT EXISTS vertical TEXT
    CHECK (vertical IN (
      'general', 'clinic', 'financial', 'restaurant',
      'retail', 'services', 'beauty', 'education'
    ))
    DEFAULT 'general';

-- Comments
COMMENT ON COLUMN tenants.business_owner_gender IS
  'Hebrew gender lock: male/female/plural. Injected into every system prompt to keep gendered language consistent across long completions.';

COMMENT ON COLUMN tenants.business_id_number IS
  'ת.ז. (individual) or ח.פ. (company registration number). Required for §30A Spam Law compliance on every outbound message footer.';

COMMENT ON COLUMN tenants.consent_status IS
  'pending = no end-customer consent collected yet, all agents locked to draft_only. partial = some channels covered. full = §11A obligations met across all configured channels.';

COMMENT ON COLUMN tenants.dpa_accepted_at IS
  'Legal exhibit. Customer (controller) acknowledged Spike Engine processor role and prohibited-inputs list. Required before any agent runs in production.';

COMMENT ON COLUMN tenants.vertical IS
  'Business vertical. Drives agent gating: clinic blocks healthcare-data ingestion, financial blocks investment-advice phrasing.';
