# Spike Engine

Hebrew-RTL multi-tenant SaaS for Israeli SMBs. Nine customer-facing AI agents plus one internal cleanup agent automate the operational long tail: reviews, leads, social posts, sales follow-ups, inventory snapshots, growth campaigns, daily briefings, and weekly digests.

**Core principle: AI מסמן, בעלים מחליט** — AI flags, owner decides. Every customer-facing message is drafted by an AI agent and approved by the business owner via an [אשר] button before it ships. The only carve-out is owner-self loopback: the owner's own daily summary, weekly digest, and real-time critical alerts on WhatsApp are auto-delivered because the owner is both the producer and the recipient.

## Status

Pre-launch. Code-complete for design partner #1. External blockers only:
- עוסק מורשה (Israeli sole-proprietor registration)
- Meta Business verification
- Business phone number

## Architecture

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack, React 19) |
| Backend | Server Actions + Vercel serverless / cron jobs |
| Database | Supabase Postgres, Frankfurt EU region, RLS for tenant isolation |
| AI | Anthropic Claude — Sonnet 4.6 for generation, Haiku 4.5 for classification |
| Messaging | Meta WhatsApp Cloud API (direct, no BSP middleware) |
| Auth | Supabase Auth (magic link + password) |
| Queue | Inngest v4 (currently synchronous; deferred to a future sprint) |
| Hosting | Vercel (Hobby tier currently) |

## Agents

| Agent | Trigger | Output | Recipient |
|---|---|---|---|
| Morning | Daily 07:00 IL | Hebrew daily summary | Owner via WhatsApp |
| Watcher | Webhook + daily 09:00 IL | Critical/high alerts | Owner via WhatsApp |
| Reviews | New review event | Draft review reply | Owner approves → Google |
| Hot Leads | Webhook | Lead bucket classification | Cascade to Sales Quick-Response |
| Social | Daily 08:30 IL (Sun-Thu) | 3 post drafts | Owner copy-pastes to IG/FB |
| Sales | 2 entry points (stuck-lead cron + QR webhook) | Hebrew draft messages | Owner approves → customer |
| Inventory | Sun/Wed 08:30 IL | Inventory snapshot + summary | Owner via dashboard |
| Manager | Sunday 08:00 IL | Weekly health digest | Owner via WhatsApp |
| Growth | Sunday + on-demand | Reactivation drafts | Owner approves → customer |
| Cleanup | Daily 03:00 IL | Internal maintenance | None (platform-internal) |

All customer-facing agents inject the owner-authored **business voice brief** (`tenants.config.business_brief`) into their system prompts, so drafts already match the owner's tone on first generation — no manual editing required.

## Project structure

```
src/
  app/
    api/cron/                Vercel cron jobs (9 routes)
    api/webhooks/whatsapp/   Meta WhatsApp inbound webhook
    dashboard/               Owner UI (approvals, alerts, reports, settings)
    onboarding/              New-tenant flow
  lib/
    agents/                  One folder per agent: run.ts + prompt.ts + schema.ts
    safety/                  PII scrubber, defamation guard, prompt-injection guard, gender lock, business-brief
    whatsapp/                Send + helpers (extracted from per-action duplicates)
    quotas/                  Per-tenant spend caps + reservation RPCs
    supabase/                Admin + server + browser clients
  components/                React UI components (dashboard, approvals, settings)
supabase/
  migrations/                Numbered SQL migrations
CLAUDE.md                    Operational source of truth — read before non-trivial changes
vercel.json                  Cron schedules (UTC)
```

## Local development

```bash
npm install
cp .env.example .env.local            # then fill in keys (see below)
npm run dev                           # http://localhost:3000
```

Required environment variables:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser-safe, RLS-enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (server-only, bypasses RLS) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `CRON_SECRET` | Random string; required Bearer token for production cron endpoints |
| `META_WHATSAPP_APP_SECRET` | HMAC secret for webhook signature verification |

## Pre-push gates

```bash
rm -rf .next
npx tsc --noEmit
npm run build
```

Both must pass before commit. See `CLAUDE.md` §15.27 for context — `tsc` alone is insufficient because Turbopack-specific issues only surface during `next build`.

## Deployment

Production: `app.spikeai.co.il` on Vercel.
Cron schedules in `vercel.json`. Hobby tier provides a flexible 1-hour window for cron execution.

## Security

- **Tenant isolation:** Postgres Row Level Security enforces `tenant_id` filtering at the database level. The application code cannot bypass it.
- **Server-side auth:** all mutations go through Next.js Server Actions with CSRF protection; the browser never holds the service-role key.
- **Webhooks:** Meta WhatsApp webhooks are verified with HMAC-SHA256 against `META_WHATSAPP_APP_SECRET` before any processing.
- **Cron endpoints:** require `Authorization: Bearer ${CRON_SECRET}`; unauthenticated requests are rejected with 401.
- **PII:** customer phone numbers, emails, IDs, and credit card numbers are scrubbed from text **before** it reaches Claude — the LLM never sees raw PII.
- **Prompt injection:** untrusted customer text is wrapped in sentinel tags; the prompt-injection guard tells Claude explicitly to treat wrapped content as data, not instructions.
- **Defamation:** every draft review reply is re-checked by Haiku 4.5 for defamation risk before reaching the owner.
- **Data residency:** all data in Supabase Frankfurt (EU) — GDPR-aligned.

## Internal documentation

`CLAUDE.md` is the operational source of truth — architecture decisions, sprint history, lessons learned, known issues, and the running backlog. It is intentionally verbose; read it before making non-trivial changes.

## License

Proprietary. © Spike Engine.
