-- ═══════════════════════════════════════════════════════════════
-- Migration 008 — Day 3 Runtime Columns
-- ═══════════════════════════════════════════════════════════════
-- Adds columns needed by the agent runner infrastructure.
-- Idempotent: safe to run multiple times (uses IF NOT EXISTS).
--
-- Date: 2026-04-28 (Day 3)
-- Author: Day 3 mock-first agent infrastructure
-- ═══════════════════════════════════════════════════════════════

-- 1. trigger_source — how was this run initiated?
--    Values: 'manual' | 'scheduled' | 'webhook'
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS trigger_source TEXT;

-- 2. cost_estimate_ils — pre-call cost estimate (reserve_spend)
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS cost_estimate_ils NUMERIC;

-- 3. cost_actual_ils — post-call actual cost (settle_spend)
--    NOTE: existing 'cost_ils' is kept as legacy (will be dropped in Day 4 cleanup)
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS cost_actual_ils NUMERIC;

-- 4. is_mocked — was this a mock run (Day 3) or real Anthropic call (Day 4+)?
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS is_mocked BOOLEAN DEFAULT false;

-- ═══════════════════════════════════════════════════════════════
-- Add CHECK constraint on trigger_source (only after column exists)
-- ═══════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'agent_runs'
      AND constraint_name = 'agent_runs_trigger_source_check'
  ) THEN
    ALTER TABLE public.agent_runs
      ADD CONSTRAINT agent_runs_trigger_source_check
      CHECK (trigger_source IS NULL OR trigger_source IN ('manual', 'scheduled', 'webhook'));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- Verify
-- ═══════════════════════════════════════════════════════════════
-- Run this after migration to confirm:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'agent_runs' AND column_name IN
--   ('trigger_source', 'cost_estimate_ils', 'cost_actual_ils', 'is_mocked')
-- ORDER BY column_name;
