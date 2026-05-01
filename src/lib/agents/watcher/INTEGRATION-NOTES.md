\# Watcher Integration Notes



How to add a real event source so the Watcher agent picks it up automatically.



\## The contract



The Watcher reads from public.events. Anything you insert into that table — from any source — gets picked up by the next Watcher run, classified by the LLM, and shown to the owner.



Required shape:



&#x20;   insert into public.events (id, tenant\_id, provider, event\_type, payload, received\_at)

&#x20;   values (

&#x20;     'unique-id-string',

&#x20;     '15ef2c6e-a064-49bf-9455-217ba937ccf2',

&#x20;     'whatsapp',

&#x20;     'message\_received',

&#x20;     jsonb\_build\_object(

&#x20;       'summary', 'הודעת WhatsApp מיוסי: שאל לגבי המחיר של החבילה הגדולה',

&#x20;       'sender', 'יוסי כהן',

&#x20;       'phone', '050-1234567'

&#x20;     ),

&#x20;     now()

&#x20;   );



\## What the Watcher actually uses



Of all the fields, only three are consumed by the agent:



1\. payload.summary — Hebrew, 1-2 sentences. This is what the LLM classifies. If summary is missing or not a string, the event is silently dropped.

2\. provider — shown to the LLM as the event source ("whatsapp", "google\_business", "website\_form", "instagram", etc.). Falls back to event\_type if missing.

3\. received\_at — used for chronological sorting and the lookback window.



Everything else in payload is preserved for other agents to use later (Reviews reads rating, Sales reads phone, etc.).



\## Common patterns



\### Webhook receiver (Next.js route handler)



Build a summary string from the incoming webhook payload, then insert into events with a deterministic id (e.g., wa-{message\_id}) so retries don't duplicate.



\### Contact form on a customer's site



The customer embeds a form that POSTs to your endpoint. Server-side, you build a summary string from name + message and insert into events.



\### Manual test row from psql



Useful for verifying a new agent before integrations exist:



&#x20;   insert into public.events (id, tenant\_id, provider, event\_type, payload, received\_at)

&#x20;   values (

&#x20;     'test-' || gen\_random\_uuid()::text,

&#x20;     '<tenant-uuid>',

&#x20;     'manual',

&#x20;     'test',

&#x20;     jsonb\_build\_object('summary', 'הודעה לבדיקה ידנית של הסוכן'),

&#x20;     now()

&#x20;   );



\## Lookback window



The Watcher loads events from the last 24 hours, capped at 50 rows. If a tenant generates more, only the most recent 50 are processed. For high-volume tenants, future work: paginate, or run hourly with a 1h window.



\## Idempotency



id is the primary key. Always use a deterministic ID derived from the source event (e.g., wa-{message\_id}, gbp-{review\_id}, form-{submission\_id}). On retry from a webhook, you'll get a unique-violation error — handle with ON CONFLICT (id) DO NOTHING or catch and ignore.



\## Cleanup



Old events stay in the table forever unless manually cleaned. For now this is fine — events is small and indexed by (tenant\_id, received\_at desc). Add a nightly cleanup job once table size becomes a real concern (\~6+ months out).

