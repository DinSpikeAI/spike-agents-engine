-- ═══════════════════════════════════════════════════════
-- WhatsApp Pre-flight check for Sprint 2 Batch 2C
-- ═══════════════════════════════════════════════════════
--
-- Run this BEFORE starting Batch 2C. Verifies that the
-- DEMO_TENANT has everything needed for outbound sends:
--   1. integrations row exists for WhatsApp
--   2. status = 'connected'
--   3. metadata has phone_number_id, access_token, display_phone_number
--   4. access_token looks plausible (not empty, expected length)
--   5. There's at least one inbound event in last 24h (so we
--      have a customer in the 24h window to test against)
--
-- If any check fails, the section header will say "❌ FAIL".
-- 2C will not work until those are resolved.
--
-- Doesn't modify any data. Read-only.

-- ─── Check 1: integrations row exists ────────────────────────
SELECT
  CASE 
    WHEN COUNT(*) = 0 THEN '❌ FAIL: No integration row for DEMO_TENANT'
    WHEN COUNT(*) > 1 THEN '⚠️  WARN: Multiple integration rows (should be exactly 1)'
    ELSE '✅ OK: 1 integration row found'
  END AS check_1_integration_exists
FROM public.integrations
WHERE tenant_id = '15ef2c6e-a064-49bf-9455-217ba937ccf2'
  AND provider = 'whatsapp';

-- ─── Check 2: status = 'connected' ──────────────────────────
SELECT
  CASE
    WHEN status = 'connected' THEN '✅ OK: status=connected'
    ELSE '❌ FAIL: status=' || status || ' (need: connected)'
  END AS check_2_status
FROM public.integrations
WHERE tenant_id = '15ef2c6e-a064-49bf-9455-217ba937ccf2'
  AND provider = 'whatsapp'
LIMIT 1;

-- ─── Check 3: metadata has required fields ──────────────────
SELECT
  CASE
    WHEN metadata->>'phone_number_id' IS NULL OR metadata->>'phone_number_id' = '' 
      THEN '❌ FAIL: phone_number_id missing'
    WHEN metadata->>'access_token' IS NULL OR metadata->>'access_token' = '' 
      THEN '❌ FAIL: access_token missing'
    WHEN metadata->>'display_phone_number' IS NULL OR metadata->>'display_phone_number' = '' 
      THEN '⚠️  WARN: display_phone_number missing (optional but recommended)'
    ELSE '✅ OK: all required metadata fields present'
  END AS check_3_metadata
FROM public.integrations
WHERE tenant_id = '15ef2c6e-a064-49bf-9455-217ba937ccf2'
  AND provider = 'whatsapp'
LIMIT 1;

-- ─── Check 4: access_token plausible length ────────────────
-- Meta WhatsApp Cloud API access tokens are typically 200+ chars.
-- A System User token can be 200-400 chars. If it's much shorter,
-- it's likely a test placeholder and won't work.
SELECT
  CASE
    WHEN LENGTH(metadata->>'access_token') < 50 
      THEN '❌ FAIL: access_token suspiciously short (' || LENGTH(metadata->>'access_token') || ' chars). Likely test placeholder.'
    WHEN LENGTH(metadata->>'access_token') < 150 
      THEN '⚠️  WARN: access_token shorter than typical (' || LENGTH(metadata->>'access_token') || ' chars). Verify it works.'
    ELSE '✅ OK: access_token length plausible (' || LENGTH(metadata->>'access_token') || ' chars)'
  END AS check_4_token_length
FROM public.integrations
WHERE tenant_id = '15ef2c6e-a064-49bf-9455-217ba937ccf2'
  AND provider = 'whatsapp'
LIMIT 1;

-- ─── Check 5: at least one inbound event in last 24h ──────────
-- The 24h window check in 2C requires a recent inbound message.
-- If there's none, you can't test the success path locally.
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN '❌ FAIL: No inbound events in last 24h. Send yourself a WhatsApp from a test phone first.'
    ELSE '✅ OK: ' || COUNT(*) || ' inbound events in last 24h'
  END AS check_5_recent_inbound
FROM public.events
WHERE tenant_id = '15ef2c6e-a064-49bf-9455-217ba937ccf2'
  AND provider = 'whatsapp'
  AND event_type = 'whatsapp_message_received'
  AND received_at >= NOW() - INTERVAL '24 hours';

-- ─── Bonus: list distinct customers in last 24h ────────────────
-- Useful to know which test phone you can use as an "approved
-- target" when manually testing 2C.
SELECT
  payload->>'contact_name' AS customer_name,
  payload->>'contact_phone' AS customer_phone,
  COUNT(*) AS messages_in_24h,
  MAX(received_at) AS most_recent
FROM public.events
WHERE tenant_id = '15ef2c6e-a064-49bf-9455-217ba937ccf2'
  AND provider = 'whatsapp'
  AND event_type = 'whatsapp_message_received'
  AND received_at >= NOW() - INTERVAL '24 hours'
GROUP BY payload->>'contact_name', payload->>'contact_phone'
ORDER BY most_recent DESC
LIMIT 10;

-- ─── If all checks pass → ready for 2C ─────────────────────────
-- If anything fails → resolve before starting 2C session.
