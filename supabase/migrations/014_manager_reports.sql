-- supabase/migrations/014_manager_reports.sql
--
-- Day 10 — Manager Agent persistence.
--
-- The Manager Agent runs daily (or on demand) and produces a structured
-- "manager report" covering 4 areas:
--   1. Quality Audit — sampled drafts review (defamation + brand-tone)
--   2. System Health — agent_runs failure analysis, cost anomalies
--   3. Growth Metrics — approval rate, time-to-approval, blazing-leads-stale
--   4. Recommendation — single actionable suggestion per run
--
-- Reports are persisted so the owner can review history (compare this week
-- vs last week, etc.) and so the Manager itself can detect trends across
-- its own past runs.
--
-- Storage strategy: the full structured report goes in `report` jsonb.
-- We pull a few key signals out into typed columns for fast filtering
-- (recommendation_type, has_critical_issues) without parsing JSON.

CREATE TABLE IF NOT EXISTS manager_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_run_id UUID REFERENCES agent_runs(id),

  -- Window analyzed (e.g., past 7 days)
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,

  -- Headline counts (extracted from report for fast queries)
  agents_succeeded INTEGER NOT NULL DEFAULT 0,
  agents_failed INTEGER NOT NULL DEFAULT 0,
  drafts_sampled INTEGER NOT NULL DEFAULT 0,
  drafts_flagged INTEGER NOT NULL DEFAULT 0,
  has_critical_issues BOOLEAN NOT NULL DEFAULT FALSE,

  -- Cost telemetry for the window
  cost_window_ils NUMERIC(10, 4),
  cost_anomaly BOOLEAN NOT NULL DEFAULT FALSE,

  -- Recommendation summary (full text in report.recommendation)
  recommendation_type TEXT CHECK (recommendation_type IN (
    'prompt_tweak',
    'scheduling',
    'configuration',
    'no_action_needed'
  )),
  recommendation_target_agent TEXT,

  -- The full structured report
  report JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE manager_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_reports FORCE ROW LEVEL SECURITY;

CREATE POLICY manager_reports_select_for_members
  ON manager_reports
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- Index for "latest report per tenant" query
CREATE INDEX IF NOT EXISTS idx_manager_reports_per_tenant
  ON manager_reports (tenant_id, created_at DESC);

-- Index for critical reports (alert UI)
CREATE INDEX IF NOT EXISTS idx_manager_reports_critical
  ON manager_reports (tenant_id, created_at DESC)
  WHERE has_critical_issues = TRUE;

COMMENT ON TABLE manager_reports IS
  'Daily/on-demand reports from the Manager Agent (Sonnet 4.6 + thinking 8000). Covers 4 responsibilities: Quality Audit, System Health, Growth Metrics, Recommendation.';

COMMENT ON COLUMN manager_reports.report IS
  'Full structured report. Schema: { status_summary, quality_findings, system_health, growth_metrics, recommendation }. See manager/schema.ts.';

COMMENT ON COLUMN manager_reports.has_critical_issues IS
  'TRUE if any agent has 3+ consecutive failures, or cost anomaly detected, or any draft was flagged for high defamation risk in the window.';
