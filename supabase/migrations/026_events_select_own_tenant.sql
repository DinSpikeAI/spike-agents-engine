-- supabase/migrations/026_events_select_own_tenant.sql
--
-- Sub-stage 1.15.3 / Sprint 2 Batch 2C — discovered during end-to-end
-- test of the Growth approve flow, immediately after migration 025
-- unblocked the integrations lookup.
--
-- ──────────────────────────────────────────────────────────────────
-- WHY
-- ──────────────────────────────────────────────────────────────────
-- The `events` table previously had only ONE RLS policy:
--
--   events_admin_all (cmd: ALL):
--     USING (is_super_admin())
--
-- This means: only super_admin users can SELECT/INSERT/UPDATE/DELETE
-- on events. No regular tenant user can read events for their own
-- tenant.
--
-- Symptom: `wasContactedInLast24h` (private helper in actions/growth.ts,
-- shipped with 2C) queries `events` user-scoped to check if the
-- recipient phone has an inbound `whatsapp_message_received` in the
-- trailing 24h. With the old policy, RLS silently filters every row
-- out — the query returns 0 rows even when matching events exist.
-- The function is conservative-on-empty and returns `false`, so the
-- flow lands on the "outside 24h window" branch and surfaces "אושר.
-- הלקוח לא פנה ב-24 השעות האחרונות..." to the user.
--
-- This was discovered when the Meta-test fake event we injected for
-- testing was visible service-role but invisible user-scoped, even
-- though the candidate's phone matched and the event was 30 minutes
-- old (well within the 24h window). Confirmed via SET LOCAL ROLE
-- authenticated + the same query.
--
-- Why this didn't surface before: webhook ingestion uses the admin
-- client (service_role) so writes aren't affected. Reads of events
-- by application code happened only in agent runs (via Inngest, also
-- admin client). The Growth approve flow is the first user-scoped
-- reader, hence the gap.
--
-- ──────────────────────────────────────────────────────────────────
-- FIX
-- ──────────────────────────────────────────────────────────────────
-- Add a tenant-scoped SELECT policy. Users can read events for their
-- own tenant (resolved via current_tenant_id() — see migration 024
-- for that function's definition). Inserts/updates/deletes remain
-- restricted to super_admin via events_admin_all (so webhook
-- ingestion via service_role still works, and there's no path for
-- a regular user to forge events).
--
-- The new policy is PERMISSIVE (the default), meaning it combines
-- with events_admin_all using OR — a row is visible if EITHER
-- policy allows it. So super_admins continue to see everything,
-- and tenant users see their own tenant's events.
--
-- ──────────────────────────────────────────────────────────────────

CREATE POLICY events_select_own_tenant ON public.events
  FOR SELECT
  USING (tenant_id = (SELECT current_tenant_id()));

-- ── PostgREST schema cache ──────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
