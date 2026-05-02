-- supabase/migrations/020_hot_leads_event_idempotency.sql
--
-- Idempotency for event-triggered Hot Leads classifications.
--
-- BACKGROUND:
--   When a WhatsApp webhook fires runHotLeadsOnEvent and that path retries
--   (cron safety net catches a missed real-time trigger, or Vercel waitUntil
--   restarts), we'd otherwise insert a duplicate hot_leads row for the same
--   underlying event. The PRIMARY KEY on hot_leads.id is gen_random_uuid(),
--   so it can't serve as the natural idempotency key the way events.id does.
--
-- DESIGN:
--   Add a nullable event_id text column referencing events.id. Enforce
--   uniqueness per (tenant_id, event_id) only when event_id is non-null,
--   via a partial unique index. Existing rows (manual leads, seed data,
--   demo dashboard inserts) have event_id NULL and stay unaffected.
--
-- IDEMPOTENCY CONTRACT:
--   - First call to runHotLeadsOnEvent(tenant, event_X): SELECT finds no
--     match → LLM runs → INSERT succeeds.
--   - Second call: SELECT finds existing row → return early, skip LLM.
--   - Race (two concurrent calls): both SELECT empty → both run LLM → first
--     INSERT succeeds, second fails on this UNIQUE index (Postgres 23505),
--     which we catch in code as "skipped duplicate".
--   The race wastes one LLM call (~₪0.001) but never duplicates rows.

ALTER TABLE public.hot_leads
  ADD COLUMN IF NOT EXISTS event_id text;

COMMENT ON COLUMN public.hot_leads.event_id IS
  'References events.id when this lead was created from an event (webhook). NULL for manual or seed leads.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_hot_leads_tenant_event_id
  ON public.hot_leads (tenant_id, event_id)
  WHERE event_id IS NOT NULL;

COMMENT ON INDEX public.idx_hot_leads_tenant_event_id IS
  'Idempotency: prevents duplicate hot_leads rows from re-triggers on the same event. Partial — only enforces when event_id is set.';
