# CLAUDE.md — Spike Engine Briefing

> **For Claude (the AI coding assistant) reading this:** This file is your briefing. Read it in full before responding to the user. Do not ask the user to re-explain the project. When this file conflicts with your training data, **this file wins**.
>
> **Last updated:** 2026-05-02 — Sub-stages 1.1, 1.2, and 1.3 complete. WhatsApp webhook pipeline is live end-to-end in development with idempotency, retry logic, and quality fixes.

---

## 0. TL;DR

- **What:** Multi-tenant SaaS in **Hebrew RTL** for Israeli SMBs (salons, restaurants, clinics, retail, 3–15 location chains). 8 customer-facing AI agents draft proposals; the business owner approves before anything sends. A 9th internal agent (`cleanup`) does housekeeping — never visible to the user.
- **Founder / sole dev:** Dean Moshe (`din6915@gmail.com`). Bootstrap mode. Hebrew speaker.
- **The Iron Rule above all others:** **"AI מסמן, בעלים מחליט"** — AI flags, owner decides. Drafts only. Never auto-send.
- **Marketing tagline:** **"שמונה סוכנים. שקט אחד."** ("Eight agents. One quiet.") — refers to the 8 customer-facing agents. The cleanup agent is backstage.
- **Stack:** Next.js 16.2.4 (Turbopack) + React 19.2.4 + Tailwind v4 + TypeScript · Supabase (Frankfurt) · `@anthropic-ai/sdk` (Sonnet 4.6 + Haiku 4.5; Opus 4.7 declared as future option) · Resend · Vercel · `@vercel/functions` for waitUntil background tasks.
- **Domain:** `app.spikeai.co.il` (production) · `localhost:3000` (dev).
- **State (May 2026):** Stage 1 of WhatsApp integration in progress. Sub-stages 1.1, 1.2, 1.3 complete. Pipeline verified end-to-end at <1s latency on happy path, with idempotency and retry. Pre-launch — **no real customers yet**, demo-driven path to first customer.
- **Don't propose:** NPS surveys · schedule optimization for staff · contract review · crypto/Web3 · a "senior manager of agents" · OpenAI fallback · standalone mobile app · 360dialog or other BSP middlemen (we use Meta Cloud API direct).
- **Next step:** Sub-stage 1.3.5 — Anti-AI signatures audit + Sales prompt rewrite + Hot Leads → Sales cascade trigger (deferred from 1.3 because it requires the new prompt).

---

## 1. Iron Rules (Non-Negotiable)

These are **product invariants**, not preferences. Every PR respects them. Push back against the user if asked to violate one.

### 1.1 "AI מסמן, בעלים מחליט" — AI Flags, Owner Decides
- Every customer-facing agent action produces a `drafts` row.
- The business owner approves drafts via `/dashboard/approvals` before anything reaches a customer.
- **Auto-send is forbidden** — even with the user's permission in chat.
- **Allowed exception:** owner pre-approves a static template in Settings ("we'll get back to you within an hour"). This is an owner choice, not AI autonomy.
- The internal `cleanup` agent has its own rule: it **never** notifies, **never** creates drafts, **never** appears in user UI.

### 1.2 The Word "בוט" Is Forbidden
- Never. Use **"סוכן AI"** or **"סוכן"**.
- Applies to UI strings, error messages, marketing copy, internal logs, comments, commit messages.

### 1.3 Anthropic Only
- All LLM calls go through `@anthropic-ai/sdk` via the singleton at `src/lib/anthropic.ts` (server-only).
- No OpenAI, no Gemini, no Cohere, no Mistral, no local models.
- Strategic positioning, not a cost decision.

### 1.4 Hebrew RTL Only
- All user-facing UI is `dir="rtl"` and Hebrew.
- English exists only in: code, commits, comments, internal logs, this file.
- No `i18n` abstraction yet. Strings are inline.

### 1.5 Safety Pipeline Before LLM
A full safety pipeline at `src/lib/safety/`. Every customer-facing agent's untrusted input passes through it before reaching Anthropic. Enforced by `run-agent-safe.ts` wrapper.

| Module | File | Purpose |
|--------|------|---------|
| **PII Scrubber** | `pii-scrubber.ts` | Redacts phones, emails, ID numbers, credit cards, addresses with placeholder tokens (Hebrew-aware). Required by **תיקון 13** (Aug 2025). |
| **Defamation Guard** | `defamation-guard.ts` | Detects לשון הרע signals before drafting review responses. |
| **Gender Lock** | `gender-lock.ts` | Enforces Hebrew grammatical agreement (זכר/נקבה). |
| **Prompt Injection Guard** | `prompt-injection-guard.ts` | `detectInjectionAttempt()` against untrusted text. |
| **README** | `README.md` | Internal documentation. |

`sanitizeUntrustedInput()` in `run-agent-safe.ts` chains: `scrubPii → wrapUntrustedInput → detectInjectionAttempt`. **Never** call Anthropic directly with untrusted text.

### 1.6 Israeli Regulation Built In
- **סעיף 30א לחוק התקשורת** (anti-spam): no marketing message without prior opt-in.
- **לשון הרע** (defamation): handled in the Reviews safety pipeline.
- **תיקון 13** (privacy): handled by the PII scrubber.

### 1.7 Drafts Have Expiry
- Every draft has `expires_at`. Default: 72 hours (Day 17 audit fix #6). Sales follow-up drafts: 24 hours.
- The cleanup agent enforces draft expiry on cron.

### 1.8 Gender Lock Is Mandatory in Hebrew Output
- Tenants have `business_owner_gender` (זכר / נקבה).
- Implementation: `src/lib/safety/gender-lock.ts`. Used by Sales today; Reviews/Social/Manager next.

### 1.9 Anti-AI-Signature Hygiene (Implemented in Sub-stage 1.3 for Watcher; full sweep in 1.3.5)
Hebrew SMB owners can identify AI-generated content immediately. Specific anti-patterns to scrub from all drafts before owner approval:

**Forbidden punctuation:**
- em-dash (—) — **the strongest AI tell**. Replace with period, comma, or hyphen (-).
- en-dash (–) mid-sentence.
- hashtags (#).
- multiple emojis (≤1 per message).

**Forbidden Hebrew phrases (AI clichés):**
- "תודה על פנייתך"
- "שמחים שיצרת קשר"
- "נחזור אליך בהקדם"
- "אנחנו כאן בשבילך"
- "צוות מקצועי שמחכה לך"
- "ההזדמנות שחיכית לה"

**Forbidden structure:**
- Drafts longer than 3 sentences (WhatsApp / DM context).
- Openings like "מחפש/ת..." or "אני יודע ש...".

**Forbidden hallucination** (Sub-stage 1.3 — Watcher prompt fix):
- Names, numbers, dates, prices, contact details that did not appear in the source event.
- Fallback phrases per scenario when data is missing: "פונה חדש", "לקוח קיים", "מקור: WhatsApp", "פרטי לקוח ב-CRM", etc.
- Generic descriptions are not first names. "פונה" is not "דנה".

Defense-in-depth: **post-processing regex** in each agent's `run.ts` (not just in the prompt) since Claude can still emit em-dashes despite explicit instructions. Implementation deferred to Sub-stage 1.3.5 across Sales, Reviews, Social.

---

## 2. Working with Dean

### 2.1 Communication
- **Hebrew in chat. Always.**
- English in code, commits, comments, error messages.
- Brevity preferred.

### 2.2 Brutal Honesty Over Diplomacy
- Bad idea → say it's bad. Don't soften.
- Plan has a flaw → point it out **before** executing.
- **"I don't know"** is preferred over a confident guess.
- **Push back when proposals contradict CLAUDE.md.** Sub-stage 1.3 example: Dean asked for "Manager monitors Hot Leads"; this conflicted with §13 (Senior Manager Agent rejected). The correct response was to surface the conflict, propose alternatives, get explicit decision — not to silently implement.

### 2.3 PowerShell File Workflow
1. Claude generates the **full file** in `/mnt/user-data/outputs/`.
2. Claude calls `present_files`.
3. Dean downloads to `~/Downloads/`.
4. Dean runs `Move-Item -Force "$HOME\Downloads\file.tsx" "src\..."` from `C:\Users\Din\Desktop\spike-engine`.
5. `npx tsc --noEmit` to type-check.
6. If clean: `git add -A && git commit -m "..." && git push`.
7. Vercel auto-deploys.
8. Dean tests at `app.spikeai.co.il`.

**Always produce the full file.** No partial patches on 1000-line files.

When two route.ts files are needed in the same delivery (e.g., webhook + cron), name them differently in `/outputs/` (e.g., `webhook-route.ts`, `cron-watcher-route.ts`) and have Move-Item rename them on placement to `route.ts`. This avoids Downloads collision.

### 2.4 Don't Relitigate Settled Decisions
- **9 agents stay 9** (8 customer-facing + 1 cleanup).
- **Hebrew RTL** is permanent.
- **Drafts-only** is permanent.
- **Anthropic-only** is permanent.
- **Pricing tiers**: Solo ₪290 / Pro ₪690 / Chain ₪1,490 + ₪990 setup + 14-day trial. NO freemium.
- **Meta Cloud API direct** (not 360dialog or other BSPs) — decided 2026-05-02.
- The "what not to build" list (§13).

### 2.5 Three Options + Recommendation
1. Three concrete options.
2. Trade-offs of each.
3. Claude's clear recommendation with reasoning.

### 2.6 Don't Be a Therapist
- Don't ask if Dean is tired.
- Don't suggest he sleep or take a break unless he himself stops.
- **Exception:** at major milestone boundaries (sub-stage transitions), it's fine to offer "continue or pause" — but only at clean stopping points, not mid-task.

### 2.7 Bootstrap Mode
- Only paid expense: Anthropic API.
- WhatsApp Business API direct = $0/month infrastructure (vs €49/mo for 360dialog BSP). Service conversations free unlimited since July 2025.
- Verified Sub-stage 1.3 cost: **~₪0.027 per inbound WhatsApp message** (Watcher ₪0.012 + Hot Leads ₪0.015). At 100 messages/day per tenant: ~₪80/month, ~28% margin on Solo tier.

### 2.8 Verify Before Documenting
This file was rebuilt on 2026-05-02 because the prior summary contained inferences that didn't match the codebase. **If you find a fact in this file that contradicts the code: trust the code, then update this file.**

When integrating with an existing schema: **always run a quick `SELECT column_name FROM information_schema.columns` query before writing INSERTs.** Sub-stage 1.1 wasted ~20 minutes debugging two schema-mismatch errors (`type` vs `event_type`, `integrations.credentials` not existing) that a 30-second SQL audit would have caught. Sub-stage 1.3 hit this again — `hot_leads.event_id` migration didn't actually run despite "Success" message; the `PGRST204` error revealed it. Always verify with `SELECT column_name FROM information_schema.columns WHERE column_name = 'X'` after a migration.

### 2.9 Known Display Bug (Not Real)
Claude.ai's chat sometimes wraps `INTEGRATION-NOTES.md` and similar dotted strings as malformed links. The file actually exists at `src/lib/agents/watcher/INTEGRATION-NOTES.md`. Only chat display is broken. **Same bug affects `localhost`** — gets wrapped as `[localhost](http://localhost)` in pasted commands. PowerShell handles it (treats as array literal), but type `localhost` manually if it confuses syntax.

### 2.10 PowerShell Gotchas (learned the hard way)
- **`Tee-Object` does NOT block the prompt.** Running `npm run dev 2>&1 | Tee-Object -FilePath "dev.log"` returns control to the prompt, but if you type ANY new command in the same terminal, the dev process gets killed. Always run dev in one terminal and POSTs from a separate terminal.
- **`Add-Content` does not add a newline before appended text.** To safely append a new env var, either prepend a newline (`-Value "`n$line"`) or use a text editor (`notepad .env.local`).
- **`Get-Content | Select-String "<KEY>"`** — always verify after appending env vars; one missed newline corrupts everything silently.
- **Test connection before POSTing:** `Test-NetConnection -ComputerName localhost -Port 3000 -InformationLevel Quiet` returns True/False. Use this before sending POSTs to avoid wasted debugging.

### 2.11 Sub-stage Iteration Rhythm (verified pattern from Sub-stages 1.1-1.3)
- **5-15 min:** plan + ask for verification data
- **30-60 min:** code + self-audit
- **5-15 min:** Move-Item + tsc + manual test
- **5-10 min:** debug if needed (target: <2 schema mismatches per sub-stage)
- **5 min:** commit + push
- **Total per sub-stage:** ~1.5-2.5 hours

**Sub-stages run together when same architectural pattern.** Sub-stage 1.3 was 3 parts (Hot Leads cascade + retry logic + prompt fix + Sales withRetry) — done in single session because all touched the same agent runtime + same withRetry pattern.

---

## 3. Tech Stack

### 3.1 Frontend
- **Next.js 16.2.4** with **Turbopack** (Next 16 has breaking changes from Next 14/15)
- **React 19.2.4**
- **Tailwind v4** with PostCSS
- **TypeScript 5.x** strict
- **shadcn/ui** in `src/components/ui/`
- **lucide-react** for icons
- **sonner** for toasts

### 3.2 Backend / DB
- **Supabase** project ref `ihzahyzejqpjxwouxuhj`, Frankfurt
- **`@supabase/ssr`** for cookie-based auth
- **`@supabase/supabase-js`** for client-side
- Three Supabase clients in `src/lib/supabase/`:
  - `server.ts` — Server Components
  - `client.ts` — Client Components
  - `admin.ts` — `createAdminClient()`, service-role, **server-only**

### 3.3 LLM
- **`@anthropic-ai/sdk`** via singleton at `src/lib/anthropic.ts` (server-only enforced)
- **Cost tracking** in `src/lib/anthropic-pricing.ts` → writes to `cost_ledger`
- **Retry logic** in `src/lib/with-retry.ts` (Sub-stage 1.3) — wraps `anthropic.messages.create` calls
- Models hardcoded per agent as `const MODEL = "..." as const;` in each `run.ts`
- The `AgentModel` type in `src/lib/agents/types.ts` permits:
  ```typescript
  type AgentModel = "claude-haiku-4-5" | "claude-sonnet-4-6" | "claude-opus-4-7";
  ```
  `claude-opus-4-7` is **declared but unused today** — reserved future-upgrade slot.

### 3.4 Email & Auth
- **Resend** (sender domain `auth.spikeai.co.il`, verified)
- Auth via Supabase OTP code (see §8). Magic links removed from UX 2026-05-02.

### 3.5 Background Tasks
- **`@vercel/functions`** (added Sub-stage 1.2) — for `waitUntil()` in webhook handlers. Extends function context past response so async work (LLM calls) doesn't get cut off when a quick HTTP response is required.
- **Vercel Cron** — see `vercel.json`. 5 cron jobs:
  - `/api/cron/reset-monthly-spend` (1 0 1 * *)
  - `/api/cron/social` (30 5 * * 0-4)
  - `/api/cron/sales` (30 7 * * 0-4)
  - `/api/cron/inventory` (30 5 * * 0,3)
  - `/api/cron/watcher` (0 * * * *) — added Sub-stage 1.2

### 3.6 Hosting
- **Vercel** auto-deploys from `main`
- Production: `app.spikeai.co.il` · Dev: `localhost:3000`
- Cron endpoints authenticate via `CRON_SECRET` env var (Bearer token). In dev, missing CRON_SECRET allows open access for testing.

---

## 4. Repository Layout (Audited 2026-05-02 evening)

```
spike-engine/
├── src/
│   ├── app/
│   │   ├── (auth)/login/        # page.tsx, login-form.tsx, actions.ts
│   │   ├── auth/callback/       # route.ts — OTP + token_hash callback
│   │   ├── onboarding/          # 4-field welcome (page, form, actions)
│   │   ├── dashboard/
│   │   │   ├── page.tsx         # 8 agent cards in 3 categories + KPI strip
│   │   │   ├── approvals/       # pending drafts page
│   │   │   ├── inventory/       # CSV upload + analysis
│   │   │   ├── leads/
│   │   │   ├── manager/
│   │   │   └── actions.ts       # 1430 lines — refactor liability
│   │   ├── api/
│   │   │   ├── webhooks/
│   │   │   │   └── whatsapp/route.ts   # Sub-stage 1.1+1.2+1.3 — Meta Cloud API receiver
│   │   │   └── cron/
│   │   │       └── watcher/route.ts    # Sub-stage 1.2 — hourly safety net
│   │   └── globals.css          # Calm Frosted design tokens
│   ├── components/
│   │   ├── ui/                  # glass.tsx, mascot.tsx, apple-bg.tsx, shadcn primitives
│   │   └── dashboard/
│   │       ├── sidebar.tsx          # desktop right-side, hidden on mobile
│   │       ├── topbar.tsx
│   │       ├── mobile-header.tsx    # mobile sticky 52px
│   │       ├── mobile-drawer.tsx    # mobile right-side drawer (RTL)
│   │       ├── bottom-nav.tsx       # mobile bottom 4 tabs
│   │       ├── kpi-strip.tsx
│   │       ├── whatsapp-fab.tsx     # bottom-78px mobile, 22px desktop
│   │       └── run-*-button.tsx
│   └── lib/
│       ├── anthropic.ts             # Singleton SDK client (server-only)
│       ├── anthropic-pricing.ts     # cost_ledger calculator
│       ├── with-retry.ts            # Sub-stage 1.3 — exponential backoff utility
│       ├── utils.ts
│       ├── supabase/                # server.ts, client.ts, admin.ts
│       ├── auth/                    # require-onboarded.ts guard
│       ├── safety/                  # ⚠️ The full safety pipeline (4 modules + README)
│       ├── admin/                   # auth.ts, queries.ts (11.7KB — likely backend for "מרכז ניהול")
│       ├── health/                  # score.ts (13.5KB) — tenant health scoring
│       ├── quotas/                  # check-cap.ts (5.9KB) — cost cap enforcement
│       ├── webhooks/
│       │   └── whatsapp/            # Sub-stage 1.1 — types.ts, parser.ts, signature.ts
│       └── agents/                  # The agent runtime (see §6)
│           ├── types.ts             # AgentId + AgentModel + RunInput types
│           ├── config.ts            # Static UI metadata (emoji, gradient, schedule, name_he)
│           ├── run-agent.ts         # Generic runner — writes agent_runs row
│           ├── run-agent-safe.ts    # ⚠️ Wrapper enforcing safety pipeline
│           ├── morning/             # prompt.ts + run.ts + schema.ts
│           ├── watcher/             # + hierarchy.ts + INTEGRATION-NOTES.md
│           ├── reviews/
│           ├── hot_leads/
│           ├── social/
│           ├── sales/
│           ├── manager/             # + data-collector.ts
│           └── inventory/           # + csv-parser.ts
├── supabase/
│   └── migrations/                  # 19 SQL files. Latest: 020_hot_leads_event_idempotency.sql
├── tests/
│   └── fixtures/
│       └── whatsapp-test-payload.json   # Sub-stage 1.1 — Meta-shaped test payload
├── public/
│   └── mascot/                      # 3 PNGs: laptop, phone-left, phone-right
├── vercel.json                      # 5 cron jobs (reset-spend, social, sales, inventory, watcher)
└── package.json
```

**Note on `cleanup` agent:** declared in `types.ts` and `config.ts`, **but has no dedicated folder** under `src/lib/agents/`. Implementation likely lives in a cron handler or `actions.ts`. To verify next time it's touched.

---

## 5. Database Schema (Verified 2026-05-02)

DB lives at Supabase project `ihzahyzejqpjxwouxuhj`.

### 5.1 events Table — VERIFIED Schema

This was wrong in earlier docs — corrected on 2026-05-02 by direct query:

| Column | Type | NOT NULL | Default |
|--------|------|----------|---------|
| `id` | text | YES | (none — must be supplied) |
| `tenant_id` | uuid | NO | null |
| `provider` | text | NO | null |
| `event_type` | text | NO | null |
| `payload` | jsonb | NO | null |
| `received_at` | timestamptz | NO | now() |

**Critical:** `id` is a TEXT PRIMARY KEY supplied by the caller — used as the **natural idempotency key**. For webhooks, use the upstream message ID (e.g., `wamid.HBgL...`). Retries collide on PK and surface as Postgres error 23505, which we catch as no-op.

**No separate `created_at` column** — `received_at` serves both purposes.

**Existing event_type values (snake_case convention — KEEP IT):**
- `lead_received`, `review_received`, `low_stock`, `message_received`,
  `appointment_upcoming`, `calendar_change`, `dm_received`, `payment_failed`,
  `routine_update`, `urgent_message`, `whatsapp_message_received` (added 1.1)

**Naming rule:** when adding new event types, use `<domain>_<action>` snake_case. NOT `<domain>.<action>` dot notation. Inconsistency causes silent SQL filter misses.

### 5.2 hot_leads Table — VERIFIED Schema (Sub-stage 1.3)

19 columns. Verified 2026-05-02:

| Column | Type | NOT NULL | Default |
|--------|------|----------|---------|
| `id` | uuid | YES | gen_random_uuid() |
| `tenant_id` | uuid | YES | — |
| `agent_run_id` | uuid | NO | — |
| `source` | text | YES | — |
| `source_handle` | text | NO | — |
| `display_name` | text | NO | — |
| `raw_message` | text | YES | — |
| `received_at` | timestamptz | YES | — |
| `score_features` | jsonb | YES | `'{}'::jsonb` |
| `bucket` | text | NO | — |
| `reason` | text | NO | — |
| `suggested_action` | text | NO | — |
| `status` | text | YES | `'classified'::text` |
| `contacted_at` | timestamptz | NO | — |
| `contacted_by_user_id` | uuid | NO | — |
| `dismissed_at` | timestamptz | NO | — |
| `dismissed_reason` | text | NO | — |
| `created_at` | timestamptz | YES | now() |
| `updated_at` | timestamptz | YES | now() |
| `event_id` | text | NO | — | (added migration 020)

**Idempotency (Sub-stage 1.3):** partial UNIQUE index `idx_hot_leads_tenant_event_id` on `(tenant_id, event_id) WHERE event_id IS NOT NULL`. Manual / seed leads have `event_id NULL` — unaffected. Webhook-triggered classifications use the source event's id, preventing duplicates from re-triggers.

### 5.3 Other Core Tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `tenants` | The business (one per customer) | `id`, `name`, `vertical`, `business_owner_gender`, `config` (JSONB containing `owner_name`, `business_name`, `onboarding_completed_at`, `sales` config sub-object, `social` config sub-object) |
| `user_settings` | Per-user prefs / feature flags | `user_id`, `tenant_id`, `onboarding_completed_at` |
| `memberships` | Many-to-many user↔tenant | `user_id`, `tenant_id`, `role` |
| `agents` | Master list (9 entries) | `id`, `slug`, `name_he`, `model` |
| `agent_prompts` | Versioned prompts | `agent_id`, `version`, `prompt_md` |
| `tenant_agents` | Per-tenant enablement + config | `tenant_id`, `agent_id`, `enabled` |
| `agent_runs` | Every execution | `id`, `tenant_id`, `agent_id`, `status`, `trigger_source`, `started_at`, `finished_at`, `cost_estimate_ils`, `cost_actual_ils`, `is_mocked`, `pii_scrubbed`, `injection_attempts_detected`, `error_message` |
| `drafts` | Awaiting owner approval | `id`, `tenant_id`, `agent_id`, `kind`, `content_he`, `status`, `expires_at`, `context` (JSONB containing `lead_id` for Sales drafts) |
| `integrations` | Third-party connections | `tenant_id`, `provider`, others. **Schema not yet fully audited — `credentials` JSONB column does NOT exist.** Stage 2 will revisit and document. |
| `notifications` | In-app alerts | `tenant_id`, `type`, `body_he`, `read_at` |
| `cost_ledger` | Anthropic spend tracking | `tenant_id`, `agent_run_id`, `cost_cents` |
| `system_alerts` | Admin-level | `severity`, `body`, `resolved_at` |
| `outbox` | Currently unused (drafts-only) | — |
| `idempotency_keys` | Prevent duplicate runs | `key`, `tenant_id`, `expires_at` |
| `audit_log` | Sensitive actions | `actor_id`, `action`, `target`, `payload` |
| `manager_reports` | Weekly summaries | `tenant_id`, `week_starts_on`, `content_md` |
| `manager_weekly_lock` | Mutex per week | `tenant_id`, `week_starts_on` |
| `inventory_snapshots` | Parsed CSV uploads | `tenant_id`, `uploaded_at`, `items` |

**Note on `leads` table:** earlier docs mentioned a `leads` table — verified 2026-05-02 that the actual table is `hot_leads`. No separate `leads` table exists.

### 5.4 Tenant Config

- `name` — business name
- `vertical` — constraint: `general | clinic | financial | restaurant | retail | services | beauty | education`
- `business_owner_gender` — required for Hebrew grammatical agreement
- `config` (JSONB) contains: `owner_name`, `business_name`, `onboarding_completed_at`, plus per-agent sub-objects:
  - `config.sales` — `toneOfVoice`, `whatsappBusinessNumber`, `availabilityLink`, `servicesPricingDisclose`, `followUpAggressiveness`
  - `config.social` — `toneOfVoice` (Sales falls back to this if its own is unset)

Watcher reads `config.owner_name` directly from the JSONB column. Don't expect `tenants.owner_name` as a top-level column.

### 5.5 The Events Contract — Read This Twice

**Every customer-facing agent reads from `events.payload.summary` (in Hebrew). This is the canonical contract.**

When a webhook integration writes to `events`:

```json
{
  "id": "wamid.HBgL...",                 // PRIMARY KEY — supply!
  "tenant_id": "uuid",
  "provider": "whatsapp",
  "event_type": "whatsapp_message_received",
  "payload": {
    "summary": "הודעת WhatsApp נכנסה מ-דנה לוי: שלום, רציתי לבדוק מחירים",
    "source": "whatsapp",
    "whatsapp_message_id": "wamid.HBgL...",
    "whatsapp_phone_number_id": "TEST_PHONE_NUMBER_ID_001",
    "contact_name": "דנה לוי",
    "contact_phone": "+972-50-...",       // PII — scrubbed before LLM
    "raw_message": "...",                 // PII — scrubbed before LLM
    "message_type": "text",
    "received_at": 1714658400
  }
}
```

**Rules:**
- `payload.summary` in Hebrew is **mandatory**.
- Agents do not read sub-fields of `payload` directly. They read `summary`.
- New integrations require **zero code changes** in agent files. Their only job: produce a good Hebrew `summary`.
- Sub-fields are for the dashboard UI and materializers (e.g., `events → hot_leads` row creation).

For deep guidance on hooking up a webhook to Watcher: see `src/lib/agents/watcher/INTEGRATION-NOTES.md` (real file, despite Claude.ai's display bug — see §2.9).

### 5.6 Demo Data
- **Demo tenant ID:** `15ef2c6e-a064-49bf-9455-217ba937ccf2`
- **Demo tenant name:** `spikeAi`, vertical `retail`
- **Demo user:** Dean Moshe, `din6915@gmail.com`, ID `69ea2326-a5cf-4c53-a9ec-866b70e1060f`

### 5.7 PostgREST Schema Cache Lag (learned the hard way)

After `ALTER TABLE` (e.g., adding a column), Supabase's REST API may continue returning `PGRST204` ("column not found in schema cache") for several minutes despite the column existing in Postgres. The `42703` from postgres followed by `PGRST204` from PostgREST is the signature.

**Fix:**
```sql
NOTIFY pgrst, 'reload schema';
```

Always run this immediately after any migration that adds a column. Verify with:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'X' AND column_name = 'Y';
```

---

## 6. The Agents — 8 Customer-Facing + 1 Internal

The product surface is 8 agents. The marketing tagline **"שמונה סוכנים. שקט אחד."** refers to these 8. A 9th internal agent (`cleanup`) handles housekeeping and never appears in user UI.

### 6.1 The 8 Customer-Facing Agents

All 8 run on real DB events as of May 2026. Models verified directly from each `src/lib/agents/<name>/run.ts`.

| # | Agent | `AgentId` | Model | Trigger | Output | withRetry? |
|---|-------|-----------|-------|---------|--------|-----------|
| 1 | **Manager** | `manager` | `claude-sonnet-4-6` | Weekly cron (Sunday) | `manager_reports` row | No (1.5+) |
| 2 | **Morning** | `morning` | `claude-haiku-4-5` | Daily cron (07:00 IL) | `drafts` (kind=`morning_brief`) | No (1.5+) |
| 3 | **Watcher** | `watcher` | `claude-haiku-4-5` | Real-time on `events` insert (webhook) + hourly cron safety net | Classification → routes to dashboard alerts | ✅ Yes (1.3) |
| 4 | **Reviews** | `reviews` | `claude-sonnet-4-6` | New review event | `drafts` (kind=`review_response`) | No (1.5+) |
| 5 | **Hot Leads** | `hot_leads` | `claude-haiku-4-5` | Real-time on `events` insert (webhook) | Classification: `cold` / `warm` / `hot` / `blazing` / `spam_or_unclear`. Persists to `hot_leads` table. | ✅ Yes (1.3) |
| 6 | **Social** | `social` | `claude-sonnet-4-6` | Cron 05:30 (skips Saturday — Day 17 fix #5) | `drafts` (kind=`social_post`) | No (1.5+) |
| 7 | **Sales** | `sales` | `claude-sonnet-4-6` + adaptive thinking | Stale lead detection cron (07:30) | `drafts` (kind=`sales_followup`) | ✅ Yes (1.3) |
| 8 | **Inventory** | `inventory` | `claude-sonnet-4-6` | Cron 05:30 Sun/Wed | `drafts` (kind=`inventory_analysis`) | No (1.5+) |

Each customer-facing agent folder has the same shape:
- `prompt.ts` — system prompt construction (Hebrew)
- `run.ts` — the executor (calls runAgent or runAgentSafe)
- `schema.ts` — JSON schema for `output_config.format` (structured output validation)

### 6.2 The Internal Agent — Cleanup

`AgentId: "cleanup"`. **Not customer-facing. Not part of the marketing 8.**

| Property | Value |
|----------|-------|
| **Purpose** | Housekeeping. Runs on cron. |
| **Responsibilities** | Expire old drafts (per Day 17 fix #6 expiry policy) · archive old `agent_runs` · expire `idempotency_keys` · likely cleanup of stale `notifications` |
| **NEVER** | …notifies the user · creates drafts · appears in `/dashboard/approvals` · runs an LLM call |
| **State** | Always `succeeded` or `no_op`. Never "awaiting approval". |
| **Implementation location** | **Not** in `src/lib/agents/cleanup/` (no folder exists). Likely in a cron handler or `actions.ts`. **TODO:** locate on next touch. |
| **Why no LLM** | SQL/cron agent. The "agent" abstraction is reused for unified observability (`agent_runs`, `cost_ledger`), not because it speaks to Claude. |

If a future user asks "why is `cleanup` listed in `types.ts` but has no folder?" — that's the answer. **Do not "complete" the folder structure with an empty stub.**

### 6.3 Models — How They're Configured

**Models are hardcoded per-agent**, not in DB, not in env. Each `run.ts` opens with:

```typescript
const MODEL = "claude-haiku-4-5" as const;  // or "claude-sonnet-4-6"
```

Changing a model is a code change, not a config change. To upgrade Sales to Opus when the time comes, edit `src/lib/agents/sales/run.ts` line 32.

**Distribution today (verified byte-by-byte 2026-05-02):**
- Haiku 4.5: `morning`, `watcher`, `hot_leads`
- Sonnet 4.6: `reviews`, `social`, `sales`, `manager`, `inventory`
- Opus 4.7: none yet — reserved future slot

### 6.4 Agent Run Lifecycle (via `runAgent`)

`runAgent()` is the canonical wrapper for every agent execution. It enforces:

1. **Cost estimation** (`estimateAgentRunCostIls(agentId)`)
2. **Spend cap pre-flight** (`assertWithinSpendCap`) — blocks if tenant over monthly cap
3. **`agent_runs` row** with status='running'
4. **`reserve_spend` RPC** — race-safe budget reservation
5. **Executor function** (per-agent — calls Anthropic, runs safety pipeline)
6. **`settle_spend` RPC** on success / `refund_spend` on failure
7. **`cost_ledger` row** appended

Two entry points:
- `runAgent` — bare wrapper, used by Watcher (no untrusted input)
- `runAgentSafe` (built on `runAgent`) — adds the safety pipeline (PII scrub + injection guard + sentinel wrapping). Used for Reviews, Hot Leads, Sales, Social.

**Never call Anthropic directly from agent code — always go through one of these wrappers.**

### 6.5 Watcher Trigger Strategy (Sub-stage 1.2)

Watcher runs in **two modes**:

1. **Real-time (webhook trigger):** when an event lands via webhook, the handler calls `runWatcherAgent(tenantId, "webhook")` via `waitUntil()`. This is fire-and-forget — failures are logged, not surfaced to the webhook caller (Meta).

2. **Hourly cron (safety net):** `/api/cron/watcher` runs every hour. Finds tenants with events in the last 24h and runs Watcher on each. This catches any real-time triggers that failed.

**Why both:**
- `waitUntil` works ~95% of the time but Vercel may cut function context if it gets stuck.
- Cron catches the 5% within an hour.
- Together: 100% coverage.

**runWatcherAgent signature:**
```typescript
runWatcherAgent(
  tenantId: string,
  triggerSource: "manual" | "scheduled" | "webhook" | "admin_manual" = "manual",
  context?: Partial<WatcherPromptContext>
): Promise<RunResult<WatcherAgentOutput>>
```

The `context` parameter is for tests — production never passes it. Watcher loads events from DB itself.

### 6.6 Hot Leads Trigger Strategy (Sub-stage 1.3)

Hot Leads has **two entry points** with shared prompt + schema:

1. **`runHotLeadsAgent(tenantId, leads, triggerSource, eventIdByLeadId?)`** — batch / manual / seed entry. Used by:
   - Manual triggers from owner dashboard
   - Seed scripts
   - Demo workflows
   - `runHotLeadsOnEvent` (internal delegation)

2. **`runHotLeadsOnEvent(tenantId, eventId)`** — single-event entry, used by webhook (parallel to Watcher). Pipeline:
   - SELECT existing `hot_leads` row by `(tenant_id, event_id)` — if exists, return early (idempotency)
   - Load event from DB
   - Build `MockLead` from `event.payload`
   - Call `runHotLeadsAgent(tenantId, [mockLead], "webhook", { [eventId]: eventId })`
   - The map tells `runHotLeadsAgent` to populate `hot_leads.event_id`, which (via partial UNIQUE index) prevents duplicate rows.

**Bias firewall preserved:** the LLM still receives only behavior features + scrubbed message. `display_name` and `source_handle` are kept aside for the DB row only. No demographic correlation possible.

**Empty-run protection:** if event has no `raw_message` or `summary`, returns `{ skipped: true, skipReason: "no_raw_message" }` before calling the LLM. Saves ₪0.001 per malformed event.

### 6.7 LLM Retry Strategy (Sub-stage 1.3)

`src/lib/with-retry.ts` — generic retry utility. Wraps any async call.

**Defaults:** 3 attempts, 1s/2s/4s exponential delays + 0-100ms jitter.

**Retryable:** `APIConnectionError`, `APIConnectionTimeoutError`, HTTP 429/500/502/503/504/529.

**Non-retryable:** HTTP 400/401/403/404/422 (broken request — retry won't help).

**Cost:** zero on happy path. Anthropic doesn't bill failed requests, so retries don't double-charge.

**Currently wraps `anthropic.messages.create`** in:
- Watcher (`src/lib/agents/watcher/run.ts`)
- Hot Leads (`src/lib/agents/hot_leads/run.ts`)
- Sales (`src/lib/agents/sales/run.ts`)

**Pending:** Reviews, Social, Manager, Morning, Inventory will be wrapped in Sub-stage 1.5 (Polish) or earlier if a real failure exposes the gap.

---

## 7. Design System — "Calm Frosted"

[unchanged from previous version — see §7.1-7.5 in 2026-05-02 audit]

Inspiration: Apple HIG + soft pastels. Tokens in `src/app/globals.css`.

**Tagline:** **"שמונה סוכנים. שקט אחד."** — the 8 customer-facing agents.

---

## 8. Auth Flow (OTP — Magic Links Removed)

### 8.1 Configuration in Supabase Dashboard
- **Site URL:** `https://app.spikeai.co.il`
- **Redirect URLs:** `https://app.spikeai.co.il/auth/callback` + `http://localhost:3000/auth/callback`
- **Email OTP length:** 6 digits

### 8.2 Two Templates Both Configured
Both templates in Supabase Dashboard → Authentication → Email Templates with the same code-only template:
1. **Magic Link** (existing users)
2. **Confirm signup** (new users — easy to forget)

Template body uses `{{ .Token }}` (the 6-digit code). The `{{ .ConfirmationURL }}` link is **not** included.

### 8.3 Verification Code in `actions.ts`

Use **only `type: "email"`** — this is critical:

```typescript
const { error } = await supabase.auth.verifyOtp({
  email: cleanEmail,
  token: cleanToken,
  type: "email",  // The only non-deprecated type for email OTP
});
```

**Do NOT add fallback to `magiclink` or `signup`** — those are deprecated in Supabase 2024+. Removed in commit `208ea50`.

### 8.4 The Bug That Took a Day to Diagnose

**Symptom:** "code expired" with a fresh code.

**Real cause:** Mismatch between Supabase OTP code length (was 8 digits in one template) and form `maxLength={6}`. Form silently truncated → server got 6 digits ≠ real token → "expired".

**Fix:** Both templates set to 6-digit OTP, single `type: "email"` call.

**If similar bug returns:** check Supabase Dashboard → Auth → Providers → Email → "Email OTP length" first. **Both templates.**

### 8.5 The Login UI (After 2026-05-02 Cleanup)
OTP-only. All copy says **"קוד אימות"**, never "קישור". Internal function names `sendMagicLink` / `handleSendLink` remain for backward compat.

---

## 9. Mobile UX (commit `91731e4`)

### 9.1 Architecture
- **Desktop (≥768px / `md:`):** Sidebar fixed-right at 232px. Main content `md:mr-[232px]`.
- **Mobile (<768px):** Sidebar replaced by 3 components:

| Component | Position | Purpose |
|-----------|----------|---------|
| `MobileHeader` | sticky top, 52px | logo + business name + notifications + hamburger |
| `MobileDrawer` | side-right (RTL) | full nav + profile, opens via hamburger |
| `BottomNav` | fixed bottom, ~56px + safe-area-inset | 4 tabs |

### 9.2 Adaptive Components
- `KpiStrip` — `snap-x snap-mandatory` mobile, `sm:grid sm:grid-cols-3` desktop
- `WhatsAppFab` — `bottom-[78px] sm:bottom-[22px]`
- `LoginPage` — Mascot `laptop` (360px) desktop; Mascot `phone-right` (140px) mobile

### 9.3 Don't Break These Patterns
- Use `md:` consistently (768px). Not `lg:`.
- No `/mobile` route — adaptive in-place.
- No PWA / standalone app — see §13.

---

## 10. WhatsApp Webhook Pipeline (Sub-stages 1.1, 1.2, 1.3 — completed 2026-05-02)

### 10.1 Architecture Overview

```
Meta Cloud API → POST /api/webhooks/whatsapp
                       │
                       ↓
                events.insert (idempotent via PK = wamid.*)
                       │
            ┌──────────┴──────────┐
            ↓                     ↓
    waitUntil(Watcher)    waitUntil(Hot Leads)   ← parallel
            │                     │
            ↓                     ↓
    Dashboard alerts      hot_leads.insert
                            (idempotent via
                             event_id UNIQUE)
                                  │
                                  ↓
                          Future: Sales draft
                          (Sub-stage 1.3.5)
```

Backups:
- `/api/cron/watcher` every hour (catches failed Watcher real-time triggers)
- Hot Leads cron safety net pending — Sub-stage 1.5

### 10.2 BSP Decision: Meta Cloud API Direct (Not 360dialog)

**Decided 2026-05-02.** We use Meta Cloud API directly, not 360dialog or any BSP middleman.

| Factor | Meta Direct | 360dialog (rejected) |
|--------|------------|----------------------|
| Setup cost | $0 | $0 |
| Monthly minimum | $0 | €49 (~₪200) |
| Per-message | Free for service conversations (since July 2025) | + their margin |
| Multi-tenancy | Embedded Signup widget per tenant | BSP becomes per-tenant tax |
| Vendor lock | None | Yes |

**Trade-off:** we build the Embedded Signup UI ourselves in Stage 2 (1-2 extra days). Worth it.

### 10.3 Webhook Endpoint: `POST /api/webhooks/whatsapp`

File: `src/app/api/webhooks/whatsapp/route.ts`.

**GET handler:** Meta verification handshake. Returns `hub.challenge` if `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN` env var.

**POST handler:**
1. Read raw body (needed for signature verification).
2. Verify Meta signature (`X-Hub-Signature-256`) — Stage 1 bypassed if `WHATSAPP_APP_SECRET` unset.
3. Parse payload via `extractMessages()` from `src/lib/webhooks/whatsapp/parser.ts`.
4. For each message:
   - Resolve tenant: header override → DEMO_TENANT_ID fallback (Stage 2 will add real `phone_number_id` mapping).
   - Build Hebrew summary via `buildHebrewSummary()`.
   - Insert into `events` with `id = whatsappMessageId` (PK = idempotency).
   - On 23505 (duplicate PK): skipped, not error.
   - Track tenant in `tenantsToTrigger: Set<string>` and event in `freshEvents: Array<{tenantId, eventId}>`.
5. After all inserts:
   - For each tenant in `tenantsToTrigger`: `waitUntil(runWatcherAgent(tenantId, "webhook"))`.
   - For each event in `freshEvents`: `waitUntil(runHotLeadsOnEvent(tenantId, eventId))`.
6. Always return 200 (5xx triggers Meta retry storms).

**Multi-tenancy (Stage 1):** All messages route to `DEMO_TENANT_ID` unless `X-Spike-Tenant-Override` header supplied. Stage 2 will reintroduce phone_number_id mapping against finalized `integrations` schema.

### 10.4 Watcher Cron: `GET /api/cron/watcher`

File: `src/app/api/cron/watcher/route.ts`. Schedule: `0 * * * *` (every hour).

1. Auth: `Authorization: Bearer ${CRON_SECRET}` required in production. Open in dev (where `CRON_SECRET` unset).
2. SELECT distinct `tenant_id` FROM events WHERE received_at >= now() - 24h.
3. For each tenant: `await runWatcherAgent(tenantId, "scheduled")`.
4. Return counts: `tenants_processed`, `succeeded`, `no_op`, `failed`.

Sequential (not parallel) — bounded by current scale. If volume grows, add p-limit concurrency.

### 10.5 Required Environment Variables

```
WHATSAPP_VERIFY_TOKEN     # Stage 1: any string. Stage 2: matches Meta App Dashboard
WHATSAPP_APP_SECRET       # Stage 1: unset (signature bypass). Stage 2: Meta app secret
CRON_SECRET               # Required in production for /api/cron/watcher
```

In `.env.local` for dev. Vercel env vars for production (Production + Preview scopes).

### 10.6 Verified Performance (2026-05-02)

- End-to-end webhook → response: **~1 second** on happy path
- End-to-end webhook → Watcher complete: **~8-9 seconds** (LLM call dominates)
- End-to-end webhook → Hot Leads complete: **~9-10 seconds** (LLM call dominates)
- Watcher cost per run: **~₪0.012** (~$0.003 with Haiku 4.5)
- Hot Leads cost per run: **~₪0.015** (~$0.004 with Haiku 4.5)
- **Combined per inbound message: ~₪0.027**
- At 100 messages/day per tenant: ~₪80/month, ~28% margin on Solo tier (₪290/month)
- Idempotency: PRIMARY KEY collision on retries → 23505 → counted as `skipped_duplicates`

### 10.7 Schema Discoveries from Sub-stage 1.1-1.3 Debug

Three schema mismatches caught only after running:

1. **Earlier docs said `events.type`. Real column is `events.event_type`.** Fixed in route handler. PostgREST error code `PGRST204` ("column not found in schema cache").

2. **Earlier docs said `integrations.credentials` JSONB.** Real column **does not exist**. Stage 2 will design and document the integrations schema. For now, all messages route to DEMO_TENANT_ID. Postgres error `42703` ("column does not exist").

3. **`events.id` is `text NOT NULL` with no default.** Use the upstream message ID as the natural idempotency key. Postgres error `23502` ("null value in column id").

4. **PostgREST schema cache lag (Sub-stage 1.3).** After migration 020 added `hot_leads.event_id`, the column existed in Postgres but PostgREST returned `PGRST204` for several minutes. Fixed by `NOTIFY pgrst, 'reload schema';`.

**Lesson learned:** before writing INSERTs against an existing schema, run:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = '<table>' AND table_schema = 'public'
ORDER BY ordinal_position;
```
30 seconds. Saves ~20 minutes per mismatch.

### 10.8 Sub-stage 1.3 Details (completed 2026-05-02)

**Three things shipped:**

1. **Hot Leads webhook trigger + idempotency** (commits `f59df9b` and migration 020):
   - New `runHotLeadsOnEvent(tenantId, eventId)` in `hot_leads/run.ts`
   - WhatsApp webhook fires it via `waitUntil` parallel to Watcher
   - Migration 020: `event_id text` column + partial UNIQUE index
   - Backward-compatible: `runHotLeadsAgent` accepts optional `eventIdByLeadId` map; manual/seed callers omit it

2. **Retry logic on LLM calls** (commit `0b8d788`):
   - New `src/lib/with-retry.ts` — generic 3-attempt exponential backoff utility
   - Wraps `anthropic.messages.create` in Watcher, Hot Leads, Sales
   - Retries on 429, 500-504, 529, network errors. Throws immediately on terminal errors.
   - Verified: zero overhead on happy path (974ms POST, identical to pre-retry)

3. **Watcher prompt fix + Sales withRetry** (commit pending):
   - Watcher prompt: explicit ban on hallucinated names/numbers/details with 5 concrete fallback phrases
   - Sales: same `withRetry` wrap as Watcher and Hot Leads

### 10.9 Pending — Sub-stage 1.3.5 (Anti-AI Signatures + Sales Cascade)

This sub-stage couples three things that share the same files:

1. **Sales prompt rewrite** to "מקצועי הענייני" style (sample provided by Dean):
   - Direct, professional, no flattery, no formality overdose
   - Forbidden punctuation (em-dash etc.) and forbidden Hebrew clichés
   - Max 3 sentences, single emoji, no hashtags
   - 6 example scenarios (price, cancellation, hours, complaint, positive review, unsupported service)
   - Verify Sales schema is `{ message_text: string }` only — currently it's a much richer object designed for follow-ups; must be confirmed compatible

2. **Cross-cutting anti-AI hygiene** in `run.ts` of Watcher / Hot Leads / Reviews / Social / Sales:
   - Post-processing regex defense-in-depth (em-dash → comma, etc.)
   - Forbidden phrases regex on first 2 sentences only (not global)

3. **Hot Leads → Sales cascade trigger:**
   - When Hot Leads classifies `bucket ∈ {hot, blazing}`, fire `waitUntil(runSalesOnEvent(tenantId, eventId))`
   - Requires either (a) extending Sales to handle fresh leads (skip 3-day filter when triggered by event) or (b) creating new `runSalesQuickResponse` function with the new prompt
   - Decision deferred to 1.3.5 — depends on prompt rewrite (#1)

**Why deferred from 1.3:** the current Sales prompt is for stuck-lead follow-ups (3+ days). Triggering Sales on a fresh hot lead with current code would always hit the `received_at < threeDaysAgo` filter and return no_op. Cascade is meaningful only with the new prompt designed for fresh inquiries.

**Estimated time:** 2-3 hours. Requires fresh prompt-engineering attention — schedule for early in a session.

### 10.10 Pending — Sub-stage 1.4 (Demo UI)

Internal-only `/dashboard/demo` page. 4 prebuilt WhatsApp templates (hot lead / question / complaint / review). Owner clicks "send" → POST to webhook → real-time pipeline visible.

**Demo is functional even without 1.3.5** — pipeline already works (Watcher alerts + Hot Leads classification visible in dashboards). 1.3.5 adds auto-drafted responses, which improves demo but isn't required.

### 10.11 Pending — Sub-stage 1.5 (Polish)

- Verify PII scrubber on Israeli phone formats (`05X-XXXXXXX`, `0501234567`, `+972 50 123 4567`, `+972501234567`)
- Wrap remaining 5 agents (Morning, Reviews, Social, Manager, Inventory) in `withRetry`
- Add Hot Leads cron safety net (mirrors Watcher cron — find events without hot_leads row, classify)
- Update INTEGRATION-NOTES.md with the actual webhook protocol
- Final tsc + Vercel build pass

---

## 11. Current Status (May 2026)

### 11.1 What Works ✅
- All 8 customer-facing agents on real DB events (Day 18)
- Cleanup agent on cron
- Login (OTP code-only, both templates configured)
- Onboarding (4 fields)
- Dashboard with 3 agent categories + KPI strip
- Mascot integration
- Mobile UX (drawer + bottom nav + adaptive)
- Approvals page · Inventory · Leads · Manager · Draft approve/reject
- `requireOnboarded` guard
- Modal portal fix
- Real KPIs from DB (Day 17 fix #2)
- Social skips Saturday (Day 17 fix #5)
- Draft expiry policy (Day 17 fix #6)
- Full safety pipeline: PII scrub + defamation guard + gender lock + injection guard
- **Sub-stage 1.1:** WhatsApp Cloud API webhook receiver, idempotent via PK
- **Sub-stage 1.2:** Watcher auto-triggers on inbound WhatsApp + hourly cron safety net
- **Sub-stage 1.3:** Hot Leads auto-classifies on webhook (parallel to Watcher) + idempotency on hot_leads + LLM retry on Watcher/Hot Leads/Sales + Watcher prompt no longer hallucinates names

### 11.2 Pending — Not Blocking 🚧
- **7 sidebar pages still 404:** הסוכנים שלי, דוחות, התראות, מרכז בקרה, אמון ופרטיות, הגדרות, מרכז ניהול
- `actions.ts` is 1430 lines — split into `actions/inventory.ts`, `actions/sales.ts`, etc.
- Race condition: `inventory-upload-zone` + `run-inventory-button`. Aria-live missing.
- Cleanup agent's exact location undocumented
- 2 moderate npm audit vulnerabilities — don't fix-force without inspecting
- `integrations` table schema not yet fully audited
- 5 agents not yet wrapped in `withRetry` (Morning, Reviews, Social, Manager, Inventory)

### 11.3 Pending — Critical for Demo 🔴
- Sub-stages 1.3.5 → 1.5 (see §10.9-10.11)
- First real customer integration (the whole point — Stage 2 follows Stage 1)

### 11.4 Pending — Pre-Production Deploy ⚠️
- Set `CRON_SECRET` in Vercel env vars (Production + Preview) — current local value: `8ac0dea1-a612-478a-a115-9accb2b3a21c`
- Set `WHATSAPP_VERIFY_TOKEN` in Vercel env vars
- Open Meta Business Manager + start Meta verification (2-10 day async process — Dean to do in parallel during Sub-stages 1.3.5-1.5)
- Eventually: set `WHATSAPP_APP_SECRET` in Vercel (Stage 2 — when Meta verification completes)

---

## 12. Strategic Roadmap

### 12.1 Pricing Tiers (Decided)
| Tier | Price/mo | Setup fee | Target |
|------|----------|-----------|--------|
| Solo | ₪290 | ₪990 | עוסק יחיד |
| Pro | ₪690 | ₪990 | small business with employees |
| Chain | ₪1,490 | ₪990 | 3-15 locations |

- 14-day trial. **No freemium.**
- 17% annual discount.

### 12.2 Stage 1 (this stage) — WhatsApp First Integration

**Sub-stage progression:**
- 1.1 ✅ — Webhook receiver
- 1.2 ✅ — Watcher real-time + cron safety net
- 1.3 ✅ — Hot Leads parallel + idempotency + retry + Watcher prompt fix + Sales withRetry
- 1.3.5 🔵 — Sales prompt rewrite + anti-AI signatures + Hot Leads → Sales cascade
- 1.4 🔵 — Demo UI (`/dashboard/demo`)
- 1.5 🔵 — PII scrubber audit + remaining agents withRetry + Hot Leads cron + docs

Currently 3 of 5+ sub-stages complete. Demo-ready expected after 1.4.

### 12.3 Next 30 Days After Stage 1 Demo
Once Stage 1 ships and demo works for prospects, in priority order:
1. **Stage 2:** Meta verification + Embedded Signup + outgoing message templates (~1 week)
2. **Trust Agent v0.5** — תיקון 13 Privacy Notice generator + DPO checklist (~10 days). Killer differentiator.
3. **Cash Flow / Collections Agent v0.5** + GreenInvoice integration (~2 weeks). Highest pain point.

### 12.4 Tier Mapping for Next Agents
- **Trust** → **Solo** (every business needs תיקון 13 compliance)
- **Cash Flow** → **Pro** (requires GreenInvoice integration)
- **VAT** → **Pro** (most sole proprietors have an accountant)
- **Chain HQ** → **Chain**
- **Win-Back** → **Pro**

---

## 13. What NOT to Build (Even If It Looks Smart)

| Idea | Why not |
|------|---------|
| **NPS / CSAT surveys** | Commodity. vcita / Birdeye / Podium do it. No differentiation. |
| **Schedule optimization for staff** | Israeli labor law (rest hours, overtime, vacation) is lawyer territory. Legal risk. |
| **Contract review** | Risk of "legal advice" liability. |
| **Competitor scraping** | TOS violation. Legal risk. |
| **Senior Manager Agent** (AI flagging other AIs) | AI flagging AI = bias amplification. Use monitoring + logs + evals. **Push back if Dean asks for this** — surfaced again in Sub-stage 1.3, redirected to retry logic + alerts. |
| **Crypto / Web3 / Blockchain** | Not relevant to ICP. |
| **Standalone mobile app** | Not before 100 paying customers. PWA enough. |
| **Open-source release** | Distraction from revenue. |
| **OpenAI / Gemini integration** | Violates Iron Rule 1.3. |
| **Email-as-product (newsletter agent)** | Mailchimp / ActiveCampaign exist. Not a wedge. |
| **Calendar booking agent** | Calendly / vcita won war. |
| **Generic chatbot widget** | That's the "בוט" we don't sell. |
| **360dialog or other BSP middleman** | Direct Meta Cloud API is $0/month. BSP adds ₪200+/month per tenant. |

---

## 14. Israeli Market Context

### 14.1 Why This Market, Why Now
- **850K+ SMBs** in Israel
- **WhatsApp adoption: ~99%**, daily active: ~98%
- **Hebrew-first underserved:** competitors (vcita PickMyCall, HubSpot, Salesforce) are English-only or weak Hebrew
- **3-15 location chains:** white space — too small for enterprise, too complex for solo SaaS
- **תיקון 13** effective Aug 2025 → every SMB now has unmet compliance need
- **חשבונית ישראל החדשה** (Jan 2025) → tax compliance is a current pain

### 14.2 Competition Map
| Competitor | Strength | Spike's Advantage |
|------------|----------|-------------------|
| **vcita** | Brand, 850K SMBs, English AI Receptionist | Hebrew-native; they bolt on |
| **HubSpot Breeze** | $0.50/conversation pricing, strong CRM | Israeli regulation built in |
| **Salesforce Agentforce SMB** | Enterprise pedigree | No Hebrew; expensive |
| **Toast IQ / GlossGenius** | Vertical-specific | We span verticals; US-centric |
| **Birdeye / Podium** | Reviews + messaging | We do drafts only; they autosend (compliance risk) |
| **Wix.AI Smart Manager** | Wix install base | **Underestimated. Watch closely.** |
| **Lindy AI** | Multi-agent orchestration | English-first, no IL regulation |

### 14.3 Hidden Opportunities
- **vcita inTandem partnership** — they OEM. Possible distribution.
- **Voicenter voice channel** — Hebrew TTS/STT.
- **B2B2B for Israeli franchises** — Roladin, Aroma, Cofizz, Re/Max.

---

## 15. Common Pitfalls for Future Claude

### 15.1 Don't Do These
- ❌ Use the word "בוט". Use "סוכן AI" or "סוכן".
- ❌ Suggest auto-send "just for transactional" without explicit owner pre-approval flow.
- ❌ Propose adding `i18next` / English version. Hebrew is the moat.
- ❌ Suggest "for this case OpenAI is cheaper" — Anthropic-only is strategic.
- ❌ Propose adding analytics SaaS without checking. Bootstrap mode.
- ❌ Ask Dean to manually edit a 1000-line file. Generate the full file.
- ❌ Output emojis in production UI strings.
- ❌ Tell Dean to take a break. He sets his own pace. (Exception: clean sub-stage boundaries.)
- ❌ Hallucinate names from `events.payload` (Watcher's known bug — fixed in 1.3 prompt).
- ❌ Build a feature without `expires_at` if it lives in `drafts`.
- ❌ Skip the safety pipeline. Use `runAgentSafe`, never raw Anthropic.
- ❌ Propose a "senior agent that monitors other agents". Already rejected. Redirect to retry/alerts/logs.
- ❌ Suggest pivoting to en-US / global SaaS. The bet is Israel.
- ❌ Try to "complete" `src/lib/agents/cleanup/` with a stub folder.
- ❌ Treat "9 agents" mentions in source comments as a typo. Intentional — 8 customer-facing + 1 internal.
- ❌ Use em-dash (—) in any agent draft output. Hebrew SMBs identify it as AI.
- ❌ Add a BSP middleman (360dialog, Twilio, Vonage). Use Meta Cloud API direct.
- ❌ Use dot notation in `event_type` (`whatsapp.message`). Use snake_case (`whatsapp_message_received`).
- ❌ Trigger Sales on a fresh hot_leads classification with the current Sales prompt. The current prompt expects 3+ day stuck leads. Cascade waits for 1.3.5 prompt rewrite.

### 15.2 Schema Audit Before INSERTs
**Always run `information_schema.columns` query before writing INSERTs against an existing table.**

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = '<table>' AND table_schema = 'public'
ORDER BY ordinal_position;
```

**After migrations that add columns**, run:
```sql
NOTIFY pgrst, 'reload schema';
```

Otherwise PostgREST returns `PGRST204` ("column not found in schema cache") for several minutes.

### 15.3 When Claude Searches the Web
- Repository: `https://github.com/DinSpikeAI/spike-agents-engine` (public)
- `web_fetch` cannot read GitHub `tree/` or `commits/` pages — disallowed by robots.txt. Use `git log` from the user.

### 15.4 When Generating Code
- Always read the **full file** before editing.
- Always produce the **full file** as output.
- Self-diff after generating: confirm requested changes are present, **and only those**.
- When delivering 2+ files of the same name (e.g., 2 `route.ts`), use distinct names in `/outputs/` and rename in `Move-Item`. Avoids Downloads collision.

### 15.5 PowerShell Workflow (verified Sub-stages 1.1-1.3)
- **Always 2 terminals:** dev in one, POSTs in the other.
- **Always test connection first:** `Test-NetConnection -ComputerName localhost -Port 3000 -InformationLevel Quiet` returns True/False.
- **Tee-Object pipeline does NOT block:** typing any command in the dev terminal kills the dev process. Don't.
- **Add-Content does NOT add newline:** breaks `.env.local`. Use notepad or prepend `` `n ``.
- **Verify env after appending:** `Get-Content .env.local | Select-String "<KEY>"` should show one line, not corrupted.
- **localhost in Claude.ai chat:** wrapped as `[localhost](http://localhost)`. PowerShell handles it but type manually if confused.

### 15.6 Iteration Speed Calibration
- Sub-stage 1.1 took ~2 hours including 20-minute schema-mismatch debug.
- Sub-stage 1.2 took ~1.5 hours (no surprises).
- Sub-stage 1.3 took ~3 hours across 3 parts (Hot Leads cascade, retry, prompt fix + Sales withRetry).
- **When Dean says "go faster":** reduce preamble, but never skip data-verification (3-line `Get-Content` saves 20-minute debug).
- **When Dean says "do everything":** still ask for the data you don't have. "Verify before documenting" applies to Claude's code-generation too.

---

## 16. Commit Conventions

- **Conventional commits**, English subject, Hebrew body allowed.
- Format: `<type>(<scope>): <subject>`
- Scopes: `auth`, `mobile`, `design`, `morning`, `watcher`, `reviews`, `hot_leads`, `social`, `sales`, `inventory`, `manager`, `cleanup`, `approvals`, `onboarding`, `ui`, `db`, `safety`, `whatsapp`, `webhooks`, `agents`.

---

## 17. Onboarding a New Claude Conversation

If you are Claude reading this for the first time in a new conversation:

1. ✅ Read this file completely. Then re-read §1, §2, §10.
2. ❌ Do not re-ask Dean to summarize the project.
3. ❌ Do not suggest building anything from §13.
4. ✅ Ask Dean: "מה הצעד הבא?" if he hasn't said.
5. ✅ Push back if a request seems to violate §1 or §13.
6. ✅ Confirm you've read this file in your first reply, in 2-3 lines max.

**Sample first reply:**
> קראתי את CLAUDE.md. מבין שאנחנו ב-Spike Engine, 8 סוכני AI מול לקוח + cleanup פנימי, drafts-only, עברית-RTL. WhatsApp pipeline (1.1+1.2+1.3) פעיל ב-dev עם Watcher, Hot Leads, retry, ו-idempotency. הצעד הבא 1.3.5 — Sales prompt rewrite + anti-AI signatures + Hot Leads → Sales cascade. מה אתה רוצה לעשות?

---

## 18. Appendix — References

### 18.1 Migration History (19 files numbered 001–020)
- `001_reset.sql` · `002_schema.sql` · `003_rls.sql` — initial schema, RLS, auth
- `016_seed_watcher_events.sql` — 15 Watcher seed events
- `017_seed_review_events.sql` — 4 Reviews seed
- `018_seed_lead_events.sql` — 5 diverse leads
- `019_onboarding_columns.sql` — onboarding fields on tenants
- `020_hot_leads_event_idempotency.sql` — Sub-stage 1.3 — event_id column + partial UNIQUE index
- (One number skipped between 003 and 016 — historical artifact)

### 18.2 Selected Commits (most recent first)
| Hash | What |
|------|------|
| (pending) | feat(agents): Watcher prompt fix + Sales withRetry (Sub-stage 1.3 part 3) |
| `0b8d788` | feat(agents): exponential-backoff retry on LLM calls (Sub-stage 1.3 part 2) |
| `f59df9b` | feat(hot_leads): event-triggered classification (Sub-stage 1.3 part 1) |
| `cc85952` | feat(whatsapp): trigger Watcher on inbound messages (Sub-stage 1.2) |
| `9018a16` | chore: gitignore local dev.log |
| `aaa2f1d` | feat(webhooks): WhatsApp Cloud API receiver (Sub-stage 1.1) |
| `a2288b5` | docs: rebuild CLAUDE.md from filesystem audit |
| `208ea50` | fix(auth): use only 'email' type for verifyOtp |
| `91731e4` | feat(mobile): hi-tech mobile UX |
| `dac7eb9` | feat(design): Phase 1+2 polish |

### 18.3 External Links
- Repo: https://github.com/DinSpikeAI/spike-agents-engine
- Production: https://app.spikeai.co.il
- Supabase project: ref `ihzahyzejqpjxwouxuhj`

---

**End of CLAUDE.md.**

If something here is wrong or outdated, the priority is to update **this file first**, then the code. This file is a load-bearing document.
