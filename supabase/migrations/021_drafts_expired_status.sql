-- supabase/migrations/021_drafts_expired_status.sql
--
-- Sub-stage 1.5.4 — Cleanup cron support
--
-- Adds 'expired' value to drafts.status enum, ONLY IF status is backed
-- by an enum type. If drafts.status is plain text, this migration is
-- a safe no-op (the DO block detects the type and exits early).
--
-- This migration is idempotent: running it twice is harmless. If
-- 'expired' already exists, it does nothing.
--
-- HOW TO DECIDE WHETHER TO RUN THIS:
--   SELECT data_type FROM information_schema.columns
--   WHERE table_name='drafts' AND column_name='status';
--
--   - If data_type = 'text' → skip this migration. The cleanup cron
--     will work without it because text columns accept any string.
--   - If data_type = 'USER-DEFINED' → run this migration FIRST,
--     then deploy the cleanup cron. Otherwise the cron will fail with
--     "invalid input value for enum".

DO $$
DECLARE
  enum_type_name text;
BEGIN
  -- Find the enum type backing drafts.status (if any).
  -- typtype='e' means enum.
  SELECT t.typname INTO enum_type_name
  FROM pg_attribute a
  JOIN pg_class c ON a.attrelid = c.oid AND c.relname = 'drafts'
  JOIN pg_type t ON a.atttypid = t.oid
  WHERE a.attname = 'status' AND t.typtype = 'e';

  IF enum_type_name IS NULL THEN
    RAISE NOTICE 'drafts.status is not an enum type — no migration needed.';
    RETURN;
  END IF;

  -- Idempotent: skip if 'expired' already in the enum.
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = enum_type_name AND e.enumlabel = 'expired'
  ) THEN
    RAISE NOTICE '''expired'' already exists in enum %, skipping.', enum_type_name;
    RETURN;
  END IF;

  -- Add the value.
  EXECUTE format('ALTER TYPE %I ADD VALUE %L', enum_type_name, 'expired');
  RAISE NOTICE 'Added ''expired'' to enum %.', enum_type_name;
END $$;

-- Reload PostgREST schema cache so Supabase clients see the new enum value.
NOTIFY pgrst, 'reload schema';
