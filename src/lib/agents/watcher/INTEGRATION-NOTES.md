# Watcher Integration Notes

How to add a real event source so the Watcher agent (and the Hot Leads + Sales QR cascade) picks it up automatically.

**Updated 2026-05-03 (end of Stage 1)** — reflects the full pipeline now in production: webhook → events → Watcher + Hot Leads (parallel) → Sales QR cascade on hot/burning leads.

---

## The contract

The Watcher reads from `public.events`. Anything you insert into that table — from any source — gets picked up by the next Watcher run, classified by the LLM, and shown to the owner in the dashboard.

But `events` is also what **Hot Leads** and **Sales QR** read. Hot Leads runs in parallel with Watcher on every WhatsApp event. If Hot Leads classifies the event as `hot` or `burning`, it cascades to Sales QR which drafts a first-response WhatsApp message.

So inserting one row into `events` triggers up to 3 agents.

### Required shape

```sql
INSERT INTO public.events (id, tenant_id, provider, event_type, payload, received_at)
VALUES (
  'unique-id-string',                              -- text PK, see "Idempotency"
  '15ef2c6e-a064-49bf-9455-217ba937ccf2',          -- tenant uuid
  'whatsapp',                                      -- provider
  'whatsapp_message_received',                     -- event_type (snake_case)
  jsonb_build_object(
    'summary', 'הודעת WhatsApp מיוסי כהן: שואל לגבי המחיר של החבילה הגדולה',
    'source', 'whatsapp',
    'whatsapp_message_id', 'wamid.HBgL...',
    'contact_name', 'יוסי כהן',
    'contact_phone', '+972-50-123-4567',
    'raw_message', 'היי, כמה עולה החבילה הגדולה?',
    'message_type', 'text',
    'received_at', extract(epoch from now())::int
  ),
  now()
);
```

---

## Field consumption per agent

Different agents read different fields. Inserting all of them is forward-compatible.

### Watcher (`payload.summary` — required)
- **`payload.summary`** — Hebrew, 1-2 sentences. This is what the LLM classifies. **If `summary` is missing or not a string, the event is silently dropped.** This is a hard requirement.
- **`provider`** — shown to the LLM as the event source ("whatsapp", "google_business", "website_form", "instagram"). Falls back to `event_type` if missing.
- **`received_at`** — used for chronological sorting and the lookback window (24h).

### Hot Leads (`payload.raw_message` — required for classification)
- **`payload.raw_message`** — The actual customer message text, used for behavior feature extraction (intent keywords, urgency signals, budget mentions, product patterns). Falls back to `summary` if missing.
- **`payload.contact_name`** — Used for `display_name` in `hot_leads` table (seen by owner in dashboard). Falls back to "לקוח חדש".
- **`payload.contact_phone`** — Used for `source_handle` in `hot_leads` table. Falls back to "".
- **`payload.source`** — preferred source field; falls back to `provider`, then "whatsapp".
- **PII Note:** the LLM never sees `display_name` or `contact_phone`. It sees only the scrubbed message + extracted features.

### Sales QR (cascade trigger)
Activates only when Hot Leads classifies the event as `bucket='hot'` or `'burning'`. Reads the same fields Hot Leads does, but generates a quick-response WhatsApp draft that lands in `/dashboard/approvals`.

---

## Common patterns

### Pattern 1: WhatsApp Cloud API webhook (production path)

The current production webhook is at `/api/webhooks/whatsapp/route.ts`. It:

1. Receives POST from Meta Cloud API
2. Verifies HMAC-SHA256 signature (when `WHATSAPP_APP_SECRET` is set)
3. Parses the WhatsApp envelope via `extractMessages()` from `src/lib/webhooks/whatsapp/parser.ts`
4. Resolves `tenant_id` (header override → DEMO_TENANT_ID fallback)
5. Builds `summary` Hebrew string
6. Inserts into `events` with PK = `wamid.HBgL...` (the WhatsApp message ID)
7. Fires `waitUntil(runWatcherAgent)` per tenant
8. Fires `waitUntil(runHotLeadsOnEvent)` per fresh event
9. Returns 200 always (per Meta requirement)

Performance: ~1.7s POST → 200 response, ~15-16s end-to-end to first draft on hot leads, ~₪0.04/hot-lead-with-cascade or ~₪0.027/cold-warm.

### Pattern 2: Generic webhook receiver

Build a `summary` string from the incoming webhook payload, then insert into `events` with a deterministic id (e.g., `wa-{message_id}`) so retries don't duplicate.

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { waitUntil } from "@vercel/functions";
import { runWatcherAgent } from "@/lib/agents/watcher/run";
import { runHotLeadsOnEvent } from "@/lib/agents/hot_leads/run";

export async function POST(req: Request) {
  const body = await req.json();
  const db = createAdminClient();

  const eventId = `myprovider-${body.id}`;
  const tenantId = await resolveTenantId(body); // your logic

  const summary = `הודעה מ-${body.from}: ${body.text.slice(0, 120)}`;

  const { error } = await db
    .from("events")
    .insert({
      id: eventId,
      tenant_id: tenantId,
      provider: "myprovider",
      event_type: "message_received",
      payload: {
        summary,
        source: "myprovider",
        raw_message: body.text,
        contact_name: body.from,
        contact_phone: body.phone,
      },
      received_at: new Date().toISOString(),
    });

  // Idempotency: 23505 = duplicate key, the row already exists. Safe.
  if (error && error.code !== "23505") {
    console.error("[myprovider] events insert failed:", error);
  }

  // Fire-and-forget cascade
  waitUntil(runWatcherAgent(tenantId, "webhook"));
  waitUntil(runHotLeadsOnEvent(tenantId, eventId));

  return Response.json({ ok: true });
}
```

### Pattern 3: Contact form on a customer's site

The customer embeds a form that POSTs to your endpoint. Server-side, you build a summary and insert into events. Use `provider='website_form'` so the LLM treats it accordingly.

### Pattern 4: Manual test row from the Supabase SQL Editor

Useful for verifying a new agent before integrations exist:

```sql
INSERT INTO public.events (id, tenant_id, provider, event_type, payload, received_at)
VALUES (
  'test-' || gen_random_uuid()::text,
  '<tenant-uuid>',
  'manual',
  'test',
  jsonb_build_object(
    'summary', 'הודעה לבדיקה ידנית של הסוכן',
    'raw_message', 'היי, רוצה לקבוע פגישה'
  ),
  now()
);
```

This will trigger Watcher on the next cron run (`0 6 * * *` UTC daily). For Hot Leads / Sales QR cascade, you must explicitly call `runHotLeadsOnEvent(tenantId, eventId)` — the cron-fallback only catches webhook events that already failed.

---

## Lookback windows

| Path | Window | Cap |
|------|--------|-----|
| Watcher (cron, fallback) | 24 hours | 50 events |
| Hot Leads + Sales QR (recovery cron) | 48 hours | 50 events |
| Real-time (webhook waitUntil) | n/a | unbounded |

If a tenant generates >50 events/day, the cron fallback won't catch all orphans on the first day — but the next day's run picks up the carryover (window overlap).

---

## Idempotency

`events.id` is the primary key (`text NOT NULL` with no default). Always use a deterministic ID derived from the source event:

- `wamid.HBgL...` — WhatsApp Cloud API native ID
- `gbp-{review_id}` — Google Business Profile review
- `form-{submission_id}` — website form

On webhook retry: you'll get a unique-violation (Postgres error code `23505`). Catch it as success. The Hot Leads recovery cron uses `(tenant_id, event_id)` partial UNIQUE index on `hot_leads`, and Sales QR checks `drafts.context->>'event_id'` before inserting — so duplicate cascades are safe at every layer.

---

## Cleanup

The cleanup cron at `/api/cron/cleanup` runs daily at `0 0 * * *` UTC. It:

1. Sets `status='expired'` on pending drafts past their `expires_at`
2. Counts old `agent_runs` (older than 90 days, count-only — archival deferred)
3. Deletes expired `idempotency_keys` (uses each row's own `expires_at` column)

Old `events` rows stay forever for now (the table is small and indexed). When tenants accumulate ~500K+ events each, add an archival job. Not urgent.

---

## Recovery cron

The recovery cron at `/api/cron/hot-leads-sales-recovery` runs daily at `0 2 * * *` UTC. It scans the last 48 hours for:

- Events without a matching `hot_leads` row → triggers `runHotLeadsOnEvent`
- Hot/burning leads without a `sales_quick_response` draft → triggers `runSalesQuickResponseOnEvent`

Cap: 50 events per stage per run. Always returns HTTP 200 (avoids Vercel cron retry).

Safety net for: webhook timeouts, network blips, Anthropic API outages, `waitUntil` task killed before completion.

---

## Vercel Hobby tier note

Hobby plan limits: max 1 cron run/day per project. All current crons are daily-or-less to fit:

- `/api/cron/reset-monthly-spend` — `1 0 1 * *` (monthly)
- `/api/cron/social` — `30 5 * * 0-4` (Sun-Thu)
- `/api/cron/sales` — `30 7 * * 0-4` (Sun-Thu)
- `/api/cron/inventory` — `30 5 * * 0,3` (Sun, Wed)
- `/api/cron/watcher` — `0 6 * * *` (daily)
- `/api/cron/cleanup` — `0 0 * * *` (daily)
- `/api/cron/hot-leads-sales-recovery` — `0 2 * * *` (daily)

When upgrading to Pro tier, the Watcher cron should be restored to `0 * * * *` (hourly) for sub-hour catchup of missed webhooks.
