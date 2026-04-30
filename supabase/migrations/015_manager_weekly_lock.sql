-- supabase/migrations/015_manager_weekly_lock.sql
--
-- Day 10.1 — Weekly lock for Manager Agent.
--
-- Business rule:
--   1. Manager produces a report (status: unread).
--   2. Owner views the report → it becomes "read".
--   3. AT THE MOMENT OF READING, a 7-day lock starts.
--   4. The lock prevents new Manager runs for 7 days from the read time.
--   5. After 7 days, owner may run Manager again.
--
-- Edge cases:
--   - If a report is unread, owner CANNOT run a new one (avoids piling up
--     unviewed reports). Owner must read the pending one first.
--   - If a tenant has never run Manager, no lock — first run is free.
--
-- Schema changes:
--   - read_at: timestamp of first view by owner. NULL until viewed.
--   - read_by_user_id: which member viewed it.
--   - next_eligible_run_at: read_at + 7 days. NULL until read.
--   These are populated atomically when the owner first opens the report
--   page, via the markManagerReportRead() server action.

ALTER TABLE manager_reports
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_by_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS next_eligible_run_at TIMESTAMPTZ;

-- Fast lookup: "is there an unread report for this tenant?"
-- Used by the run-manager-button gating logic.
CREATE INDEX IF NOT EXISTS idx_manager_reports_unread
  ON manager_reports (tenant_id, created_at DESC)
  WHERE read_at IS NULL;

-- Fast lookup: "when is the next run eligible for this tenant?"
-- Used by the lock-state query.
CREATE INDEX IF NOT EXISTS idx_manager_reports_eligible
  ON manager_reports (tenant_id, next_eligible_run_at DESC)
  WHERE next_eligible_run_at IS NOT NULL;

COMMENT ON COLUMN manager_reports.read_at IS
  'When the owner first opened this report. NULL = unread. Setting this triggers a 7-day lock on creating new reports.';

COMMENT ON COLUMN manager_reports.next_eligible_run_at IS
  'Computed at read time as read_at + interval ''7 days''. While now() < this value, manager is locked. NULL until read.';
