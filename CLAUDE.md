# CLAUDE.md — Spike Engine Briefing

> **For Claude (the AI coding assistant) reading this:** This file is your briefing. Read it in full before responding to the user. Do not ask the user to re-explain the project. When this file conflicts with your training data, **this file wins**.
>
> **Last updated:** 2026-05-03 (end of session 3) — Sub-stages 1.1, 1.2, 1.3, 1.3.5, and 1.4 complete. Full real-time WhatsApp pipeline + internal Demo UI working end-to-end. Verified Hebrew output. ~10s end-to-end latency, ~₪0.04 per hot lead.

---

## 0. TL;DR

- **What:** Multi-tenant SaaS in **Hebrew RTL** for Israeli SMBs (salons, restaurants, clinics, retail, 3–15 location chains). 8 customer-facing AI agents draft proposals; the business owner approves before anything sends. A 9th internal agent (`cleanup`) does housekeeping — never visible to the user.
- **Founder / sole dev:** Dean Moshe (`din6915@gmail.com`). Bootstrap mode. Hebrew speaker.
- **The Iron Rule above all others:** **"AI מסמן, בעלים מחליט"** — AI flags, owner decides. Drafts only. Never auto-send.
- **Marketing tagline:** **"שמונה סוכנים. שקט אחד."** ("Eight agents. One quiet.") — refers to the 8 customer-facing agents.
- **Stack:** Next.js 16.2.4 (Turbopack) + React 19.2.4 + Tailwind v4 + TypeScript · Supabase (Frankfurt) · `@anthropic-ai/sdk` (Sonnet 4.6 + Haiku 4.5) · Resend · Vercel · `@vercel/functions` for waitUntil background tasks.
- **Repo:** https://github.com/DinSpikeAI/spike-agents-engine
- **Local dev:** `C:\Users\Din\Desktop\spike-engine`
- **Domain:** `app.spikeai.co.il` (production) · `localhost:3000` (dev).
- **State (May 2026):** Stage 1 of WhatsApp integration almost done. Sub-stages 1.1, 1.2, 1.3, 1.3.5, 1.4 complete. Full pipeline works end-to-end: WhatsApp → events.insert → Watcher + Hot Leads (parallel) → if hot/burning, Sales QuickResponse cascade → Hebrew draft. Internal Demo UI at `/dashboard/demo` for prospect demos. Pre-launch — no real customers yet.
- **Don't propose:** NPS surveys · schedule optimization for staff · contract review · crypto/Web3 · "senior manager of agents" · OpenAI fallback · standalone mobile app · 360dialog or other BSP middlemen.
- **Next step:** Sub-stage 1.4.5 (sidebar link) OR Sub-stage 1.5 (Polish — withRetry on 5 remaining agents, anti-AI sweep, PII audit, Hot Leads cron safety net).

---

## 1. Iron Rules (Non-Negotiable)

### 1.1 "AI מסמן, בעלים מחליט"
- Every customer-facing agent action produces a `drafts` row.
- Owner approves drafts via `/dashboard/approvals` before anything sends.
- **Auto-send forbidden** — even with the user's permission in chat.
- Cleanup agent: never notifies, never creates drafts, never appears in user UI.

### 1.2 The Word "בוט" Is Forbidden
Use **"סוכן AI"** or **"סוכן"**. Applies everywhere.

### 1.3 Anthropic Only
All LLM calls through `@anthropic-ai/sdk` via `src/lib/anthropic.ts` (server-only). No OpenAI, Gemini, Cohere, Mistral, local models. Strategic.

### 1.4 Hebrew RTL Only
All user-facing UI: `dir="rtl"` and Hebrew. English only in: code, commits, comments, internal logs, this file. No `i18n` abstraction.

### 1.5 Safety Pipeline Before LLM
Full pipeline at `src/lib/safety/`. Every customer-facing agent's untrusted input passes through it before reaching Anthropic. Enforced by `run-agent-safe.ts`.

| Module | Purpose |
|--------|---------|
| `pii-scrubber.ts` | Phones, emails, IDs, credit cards, addresses (Hebrew-aware). תיקון 13. |
| `defamation-guard.ts` | לשון הרע detection for review responses. |
| `gender-lock.ts` | Hebrew זכר/נקבה agreement. |
| `prompt-injection-guard.ts` | `detectInjectionAttempt()` against untrusted text. |

`sanitizeUntrustedInput()` chains: `scrubPii → wrapUntrustedInput → detectInjectionAttempt`. Never call Anthropic directly with untrusted text.

### 1.6 Israeli Regulation Built In
- **סעיף 30א** anti-spam: no marketing without prior opt-in
- **לשון הרע**: handled in Reviews safety pipeline
- **תיקון 13** privacy: handled by PII scrubber

### 1.7 Drafts Have Expiry
Default 72h. Sales follow-up + Sales QuickResponse: 24h. Cleanup agent enforces.

### 1.8 Gender Lock Mandatory in Hebrew Output
Tenants have `business_owner_gender`. Used by Sales (both entry points) today; Reviews/Social/Manager pending in 1.5.

### 1.9 Anti-AI-Signature Hygiene (Watcher 1.3 + Sales QR 1.3.5; full sweep in 1.5)

**Forbidden punctuation:**
- em-dash (—) — strongest AI tell. Replace with period/comma/hyphen.
- en-dash (–) mid-sentence
- hashtags (#)
- multiple emojis (≤1 per message)

**Forbidden Hebrew phrases:**
- "תודה על פנייתך"
- "שמחים שיצרת קשר"
- "נחזור אליך בהקדם"
- "אנחנו כאן בשבילך"
- "צוות מקצועי שמחכה לך"
- "ההזדמנות שחיכית לה"

**Forbidden structure:**
- More than 3-4 sentences (WhatsApp/DM context)
- Openings like "מחפש/ת..." or "אני יודע ש..."

**Israeli-specific tone (1.3.5 prompt design):**
- Empathy on complaints, brevity on info requests
- Use display_name from WhatsApp profile
- Don't refer customers to competitors — leave the door open
- "Persistent" aggressiveness: "אני פנוי עכשיו, אפשר להרים אליך צלצול?" (NOT "אתקשר בעוד 10 דקות")

**Forbidden hallucination** (Watcher 1.3 fix):
- Names, numbers, dates, prices, contact details that did not appear in source event
- Fallbacks: "פונה חדש", "לקוח קיים", "מקור: WhatsApp"

**Implementation status:**
- ✅ Watcher prompt (1.3): name hallucination ban + 5 fallback phrases
- ✅ Sales QuickResponse prompt (1.3.5): all anti-AI rules + 7 scenarios + vertical-specific tone
- 🔵 Defense-in-depth post-processing regex (deferred to 1.5)
- 🔵 Reviews + Social + Manager + Morning + Inventory prompts (deferred to 1.5)

---

## 2. Working with Dean

### 2.1 Communication
- Hebrew in chat. English in code/commits/comments. Brevity preferred.

### 2.2 Brutal Honesty
- Bad idea → say it. Plan flaw → point it out before executing. "I don't know" preferred over confident guess.
- Push back when proposals contradict CLAUDE.md.
- **Never write "Dean provided X" without verification.** A prior session falsely attributed a Sales prompt to Dean. Verify before documenting.

### 2.3 PowerShell File Workflow
1. Generate full file in `/mnt/user-data/outputs/`
2. `present_files`
3. Dean downloads to `~/Downloads/`
4. `Move-Item -Force "$HOME\Downloads\file.tsx" "src\..."` from `C:\Users\Din\Desktop\spike-engine`
5. `npx tsc --noEmit`
6. If clean: `git add -A && git commit -m "..." && git push`

Always full file. When 2 files share the same name, use distinct names in `/outputs/` and rename in Move-Item.

### 2.4 Don't Relitigate Settled Decisions
- 9 agents stay 9 (8 customer-facing + 1 cleanup)
- Hebrew RTL permanent
- Drafts-only permanent
- Anthropic-only permanent
- Pricing: Solo ₪290 / Pro ₪690 / Chain ₪1,490 + ₪990 setup. NO freemium.
- Meta Cloud API direct (not BSPs). Decided 2026-05-02.
- See §13 "What NOT to Build"

### 2.5 Three Options + Recommendation
For decisions: 3 concrete options + trade-offs + Claude's recommendation.

### 2.6 Don't Be a Therapist
- Don't ask if Dean is tired. Don't suggest he sleep.
- Exception: clean sub-stage boundaries fine to offer "continue or pause".
- **Don't say "good night" if it's 7am.** No time-of-day assumptions.

### 2.7 Bootstrap Mode
- Only paid expense: Anthropic API
- WhatsApp Business API direct = $0/month (vs €49/mo BSP)
- Cost per inbound HOT WhatsApp message: ~₪0.04. Cold/warm: ~₪0.027
- 100 msg/day with 30% hot rate: ~₪95/month, ~28% margin on Solo
- **Anthropic credits state (2026-05-03):** Console balance ~$4.20, auto-reload disabled. ~100 hot lead demos before exhaustion. Top up before first prospect demo.
- Dean has Pro ($20/mo for chat) AND Console credits (pay-per-token for production). Same Mastercard ••4113. Separate products.

### 2.8 Verify Before Documenting
**Always check schema before INSERTs:**
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = '<table>' AND table_schema = 'public';
```

After migrations:
```sql
NOTIFY pgrst, 'reload schema';
```

PostgREST `PGRST204` errors after `ALTER TABLE` indicate schema cache lag.

Verification applies to Claude's own claims too. Never write "Dean said X" without grep'ing transcript.

### 2.9 Known Display Bug
Claude.ai sometimes wraps `INTEGRATION-NOTES.md` and `localhost` as malformed links. PowerShell handles `localhost` (treats as array literal), but type manually if confusing.

### 2.10 PowerShell Gotchas
- **Tee-Object does NOT block.** Running `npm run dev | Tee-Object` returns control. Typing any command kills dev. **Always 2 terminals.**
- **Add-Content does NOT add newline.** Breaks `.env.local`. Use notepad or prepend `` `n ``.
- **Verify env after appending:** `Get-Content .env.local | Select-String "<KEY>"`.
- **Test connection first:** `Test-NetConnection -ComputerName localhost -Port 3000 -InformationLevel Quiet` returns True/False.
- **Stale .next cache (1.4 lesson):** tsc errors `routes.d.ts is not a module` → stop dev, `Remove-Item -Recurse -Force .next`, restart dev.
- **Turbopack SST file errors** (`Persisting failed: Unable to write SST file 00000037.sst`): happens when `.next` mutated while dev running. Stop, clean, restart.

### 2.11 Sub-stage Iteration Rhythm
- 5-15 min plan + verification ask
- 30-60 min code + self-audit
- 5-15 min Move-Item + tsc + manual test
- 5-10 min debug if needed
- 5 min commit + push
- **Total: ~1.5-2.5 hours typical.** UI-heavy (1.4) ran 4-5 hours due to design iteration.

**Prompt-engineering** sub-stages: 30 min draft → review → calibration BEFORE code.

**UI** sub-stages: read globals.css + 1-2 existing components BEFORE code (§2.12).

### 2.12 Design Tokens & Patterns First (Sub-stage 1.4 lesson — 2026-05-03)

**Before any new UI code, read:**
1. `src/app/globals.css` — Calm Frosted tokens
2. **At least one existing styled component** (e.g., `kpi-strip.tsx`, agent grid in `src/app/dashboard/page.tsx`)

**Mandatory.** Sub-stage 1.4 took 4 design attempts because Claude designed before reading globals.css. Each iteration produced generic shadcn-default styling. After reading: design fit immediately.

**The pattern Spike uses:**
- `<Glass>` + `<Glass deep>` from `@/components/ui/glass` are card primitives
- `<AppleBg>` from `@/components/ui/apple-bg` is page background
- Colors via CSS variables in inline `style={{}}` — **NOT** Tailwind classes like `bg-rose-500`
- Typography in arbitrary pixels: `text-[15.5px]`, `text-[12.5px]`, `tracking-[-0.025em]`
- Hover utility: `agent-card` class
- Section headers: `section-divider` for fading horizontal lines
- Tile gradients per category: routine (blue) / content (lilac) / insight (green)
- System colors (`--color-sys-blue`, `--color-sys-green`, `--color-sys-pink`, `--color-sys-amber`) for **status only**, never decoration

**Don't:**
- Use `bg-rose-500`, `text-emerald-700`, `border-sky-500` for design (only sys-* for status pills)
- Use shadcn defaults `bg-card`, `bg-muted` (use Glass)
- Mix plain shadcn primitives with Calm Frosted

---

## 3. Tech Stack

### 3.1 Frontend
- Next.js 16.2.4 with Turbopack (breaking changes from Next 14/15)
- React 19.2.4
- Tailwind v4 with PostCSS (most design tokens in CSS variables, not Tailwind theme)
- TypeScript 5.x strict
- shadcn/ui in `src/components/ui/` (used sparingly — Spike has its own primitives)
- lucide-react for icons
- sonner for toasts

### 3.2 Backend / DB
- Supabase project ref `ihzahyzejqpjxwouxuhj`, Frankfurt
- `@supabase/ssr` cookie auth
- 3 clients in `src/lib/supabase/`: server.ts, client.ts, admin.ts
- `createAdminClient()` is service-role, **server-only**

### 3.3 LLM
- `@anthropic-ai/sdk` via singleton `src/lib/anthropic.ts` (server-only)
- Cost tracking in `src/lib/anthropic-pricing.ts` → `cost_ledger`
- Retry: `src/lib/with-retry.ts` (Sub-stage 1.3) wraps `anthropic.messages.create`
- Models hardcoded per agent: `const MODEL = "..." as const;`
- `AgentModel` type permits: `"claude-haiku-4-5" | "claude-sonnet-4-6" | "claude-opus-4-7"`. Opus 4.7 declared but unused — reserved future slot.

### 3.4 Email & Auth
- Resend (sender `auth.spikeai.co.il`)
- Supabase OTP code (see §8)

### 3.5 Background Tasks
- `@vercel/functions` for `waitUntil()` in webhook + Hot Leads cascade
- Vercel Cron (5 jobs in `vercel.json`):
  - `/api/cron/reset-monthly-spend` (1 0 1 * *)
  - `/api/cron/social` (30 5 * * 0-4)
  - `/api/cron/sales` (30 7 * * 0-4)
  - `/api/cron/inventory` (30 5 * * 0,3)
  - `/api/cron/watcher` (0 * * * *) — Sub-stage 1.2

### 3.6 Hosting
- Vercel auto-deploys from `main`
- Cron auth: `Authorization: Bearer ${CRON_SECRET}`. Open in dev (CRON_SECRET unset).

---

## 4. Repository Layout (Audited 2026-05-03)

```
spike-engine/
├── src/
│   ├── app/
│   │   ├── (auth)/login/        # OTP-only
│   │   ├── auth/callback/
│   │   ├── onboarding/
│   │   ├── dashboard/
│   │   │   ├── page.tsx         # ⚠️ Read for UI patterns
│   │   │   ├── approvals/
│   │   │   ├── inventory/
│   │   │   ├── leads/
│   │   │   ├── manager/
│   │   │   ├── demo/            # Sub-stage 1.4
│   │   │   │   ├── page.tsx
│   │   │   │   └── actions.ts
│   │   │   └── actions.ts       # 1430 lines — refactor liability
│   │   ├── api/
│   │   │   ├── webhooks/whatsapp/route.ts   # 1.1+1.2+1.3
│   │   │   ├── cron/watcher/route.ts        # 1.2
│   │   │   └── demo/status/route.ts         # 1.4
│   │   └── globals.css          # ⚠️ READ FIRST when designing UI
│   ├── components/
│   │   ├── ui/
│   │   │   ├── glass.tsx        # ⚠️ THE primitive
│   │   │   ├── apple-bg.tsx     # ⚠️ THE page bg
│   │   │   └── mascot.tsx
│   │   ├── dashboard/
│   │   └── demo/
│   │       ├── demo-panel.tsx
│   │       └── pipeline-status.tsx
│   └── lib/
│       ├── anthropic.ts         # Singleton (server-only)
│       ├── anthropic-pricing.ts
│       ├── with-retry.ts        # 1.3
│       ├── supabase/
│       ├── auth/                # require-onboarded.ts → { userId, userEmail, tenantId }
│       ├── safety/              # ⚠️ pipeline
│       ├── admin/               # auth.ts (isAdminEmail)
│       ├── webhooks/whatsapp/
│       ├── demo/types.ts        # ⚠️ NEUTRAL module (no "use server") — 1.4
│       └── agents/
│           ├── types.ts
│           ├── config.ts
│           ├── run-agent.ts
│           ├── run-agent-safe.ts
│           ├── morning/
│           ├── watcher/         # + INTEGRATION-NOTES.md
│           ├── reviews/
│           ├── hot_leads/       # 537 lines, 1.3.5 cascade
│           ├── social/
│           ├── sales/           # ⚠️ TWO entry points — see §6.8
│           │   ├── prompt.ts
│           │   ├── prompt-quick-response.ts  # 1.3.5
│           │   ├── run.ts                    # 848 lines
│           │   ├── schema.ts
│           │   └── schema-quick-response.ts  # 1.3.5
│           ├── manager/
│           └── inventory/
├── supabase/
│   └── migrations/              # 20 files. Latest: 020
├── tests/fixtures/
│   ├── whatsapp-test-payload.json   # warm
│   └── whatsapp-hot-payload.json    # 1.3.5 hot
├── public/mascot/                   # NOTE: phone-right.png appeared broken in 1.4
├── vercel.json
├── CLAUDE.md
└── package.json
```

`cleanup` agent declared in types.ts/config.ts but no folder. Implementation likely in cron handler.

---

## 5. Database Schema (Verified 2026-05-03)

### 5.1 events Table

| Column | Type | NOT NULL | Default |
|--------|------|----------|---------|
| `id` | text | YES | (none — must be supplied) |
| `tenant_id` | uuid | NO | null |
| `provider` | text | NO | null |
| `event_type` | text | NO | null |
| `payload` | jsonb | NO | null |
| `received_at` | timestamptz | NO | now() |

`id` is text PK supplied by caller — natural idempotency key. For webhooks: `wamid.HBgL...`. For demo: `wamid.DEMO_${ts}_${random}`.

**event_type values (snake_case):**
`lead_received`, `review_received`, `low_stock`, `message_received`, `appointment_upcoming`, `calendar_change`, `dm_received`, `payment_failed`, `routine_update`, `urgent_message`, `whatsapp_message_received`.

**Naming rule:** `<domain>_<action>` snake_case. NOT dot notation.

### 5.2 hot_leads Table (19 cols)

Key columns:
- `id`, `tenant_id`, `agent_run_id`
- `source`, `source_handle`, `display_name`, `raw_message` (PII)
- `received_at`, `score_features` (jsonb), `bucket`, `reason`, `suggested_action`
- `status` (default 'classified')
- `event_id` text — added migration 020, idempotency key

Idempotency: partial UNIQUE `idx_hot_leads_tenant_event_id` on `(tenant_id, event_id) WHERE event_id IS NOT NULL`.

**Verified bucket values:** `cold` · `warm` · `hot` · `burning` · `spam_or_unclear`. Sales QR cascade triggers on `hot` and `burning` only.

### 5.3 drafts Table

Sales writes **two distinct draft types**:

| draft.type | Created by | When | TTL |
|------------|------------|------|-----|
| `sales_followup` | `runSalesAgent` (cron) | Stuck leads (3+ days) | 24h |
| `sales_quick_response` | `runSalesQuickResponseOnEvent` (webhook cascade) | Fresh hot/burning | 24h |

`drafts.context` for `sales_quick_response`: `trigger='webhook'`, `event_id`, `lead_display_name`. `event_id` is idempotency key.

### 5.4 Other Core Tables

| Table | Purpose |
|-------|---------|
| `tenants` | id, name, vertical, business_owner_gender, config (JSONB) |
| `user_settings` | onboarding_completed_at, active_tenant_id |
| `memberships` | user↔tenant |
| `agents` | master list (9) |
| `agent_prompts` | versioned |
| `tenant_agents` | per-tenant enable + config |
| `agent_runs` | every execution |
| `integrations` | third-party (`credentials` JSONB does NOT exist — schema not yet finalized) |
| `notifications` | in-app alerts |
| `cost_ledger` | Anthropic spend |
| `idempotency_keys` | duplicate-run prevention |
| `audit_log` | sensitive actions |
| `manager_reports` | weekly summaries |
| `inventory_snapshots` | parsed CSVs |

### 5.5 Tenant Config

- `name` — business
- `vertical` — `general | clinic | financial | restaurant | retail | services | beauty | education`
- `business_owner_gender` — Hebrew grammar
- `config` (JSONB): `owner_name`, `business_name`, `onboarding_completed_at`, plus per-agent:
  - `config.sales` — `toneOfVoice`, `whatsappBusinessNumber`, `availabilityLink`, `servicesPricingDisclose`, `followUpAggressiveness`
  - `config.social` — `toneOfVoice` (Sales falls back if its own unset)

### 5.6 The Events Contract

Every customer-facing agent reads from `events.payload.summary` (Hebrew). Canonical contract:

```json
{
  "id": "wamid.HBgL...",
  "tenant_id": "uuid",
  "provider": "whatsapp",
  "event_type": "whatsapp_message_received",
  "payload": {
    "summary": "הודעת WhatsApp נכנסה מ-X: <message>",
    "source": "whatsapp",
    "whatsapp_message_id": "wamid.HBgL...",
    "contact_name": "...",
    "contact_phone": "+972-50-...",
    "raw_message": "...",
    "message_type": "text",
    "received_at": 1714658400
  }
}
```

Watcher reads `summary`. Hot Leads reads `raw_message`. Sales QR reads `raw_message`, `contact_name`, `contact_phone`.

For deep webhook integration guidance: `src/lib/agents/watcher/INTEGRATION-NOTES.md`.

### 5.7 Demo Data
- **Demo tenant ID:** `15ef2c6e-a064-49bf-9455-217ba937ccf2`
- **Demo tenant name:** `spikeAi`, vertical `retail`
- **Demo user:** Dean Moshe, `din6915@gmail.com`, ID `69ea2326-a5cf-4c53-a9ec-866b70e1060f`

### 5.8 PostgREST Schema Cache Lag
After `ALTER TABLE`: `NOTIFY pgrst, 'reload schema';` then verify with `information_schema.columns`.

---

## 6. The Agents

### 6.1 The 8 Customer-Facing Agents

| # | Agent | Model | Trigger | Output | withRetry? |
|---|-------|-------|---------|--------|-----------|
| 1 | Manager | sonnet-4-6 | Weekly cron (Sun) | `manager_reports` | No (1.5+) |
| 2 | Morning | haiku-4-5 | Daily cron 07:00 IL | drafts (`morning_brief`) | No (1.5+) |
| 3 | Watcher | haiku-4-5 | Real-time webhook + hourly cron | dashboard alerts | ✅ (1.3) |
| 4 | Reviews | sonnet-4-6 | New review event | drafts (`review_response`) | No (1.5+) |
| 5 | Hot Leads | haiku-4-5 | Real-time webhook | Classify → cascades to Sales QR on hot/burning | ✅ (1.3) |
| 6 | Social | sonnet-4-6 | Cron 05:30 (no Sat) | drafts (`social_post`) | No (1.5+) |
| 7 | Sales | sonnet-4-6 + adaptive thinking | **TWO entry points** §6.8 | `sales_followup` / `sales_quick_response` | ✅ (1.3) |
| 8 | Inventory | sonnet-4-6 | Cron 05:30 Sun/Wed | drafts (`inventory_analysis`) | No (1.5+) |

### 6.2 Cleanup (Internal)
- AgentId: `cleanup`. Not customer-facing.
- Housekeeping: expire drafts, archive runs, expire idempotency_keys.
- Never notifies / creates drafts / runs LLM.
- No folder. Implementation likely in cron handler. **TODO: locate.**

### 6.3 Models — Hardcoded
```typescript
const MODEL = "claude-haiku-4-5" as const;  // each run.ts
```

### 6.4 Agent Run Lifecycle
`runAgent()`:
1. Cost estimation
2. Spend cap pre-flight
3. `agent_runs` row status='running'
4. `reserve_spend` RPC
5. Executor (Anthropic + safety)
6. `settle_spend` / `refund_spend`
7. `cost_ledger`

Two wrappers:
- `runAgent` — bare (Watcher)
- `runAgentSafe` — adds safety pipeline (Reviews, Hot Leads, Sales, Social)

**Never call Anthropic directly.**

### 6.5 Watcher Strategy (1.2)
Real-time webhook + hourly cron safety net. Together = 100% coverage.

### 6.6 Hot Leads Strategy (1.3 + 1.3.5)
Two entry points:
1. `runHotLeadsAgent(tenantId, leads, triggerSource, eventIdByLeadId?)` — batch
2. `runHotLeadsOnEvent(tenantId, eventId)` — single event from webhook
   - Pre-flight idempotency `(tenant_id, event_id)`
   - Build MockLead from event.payload
   - Call `runHotLeadsAgent` with map → populates `hot_leads.event_id`
   - **NEW (1.3.5):** if bucket ∈ {hot, burning}, fire `runSalesQuickResponseOnEvent` via `waitUntil()`. Cold/warm/spam don't cascade.

Bias firewall: LLM sees behavior features + scrubbed message. `display_name` and `source_handle` never reach model.

### 6.7 LLM Retry (1.3)
`with-retry.ts`: 3 attempts, 1s/2s/4s exponential + jitter.
- Retryable: APIConnectionError, 429, 500-504, 529
- Non-retryable: 400/401/403/404/422
- Wraps: Watcher, Hot Leads, Sales (both)
- Pending in 1.5: Reviews, Social, Manager, Morning, Inventory

### 6.8 Sales — TWO Entry Points (1.3.5)

#### Path A: `runSalesAgent` — Stuck leads
- Cron `/api/cron/sales` 07:30 or manual
- Prompt: `prompt.ts` — rich follow-up
- Schema: `schema.ts` — multi-field
- Query: `bucket IN ('warm','hot','burning') AND status='classified' AND received_at < NOW() - INTERVAL '3 days'`
- Output: `drafts` `type='sales_followup'`
- Adaptive thinking 2048 tokens

#### Path B: `runSalesQuickResponseOnEvent` — Fresh hot leads (NEW 1.3.5)
- Trigger: Hot Leads cascade
- Prompt: `prompt-quick-response.ts` — short, Israeli-tone
- Schema: `schema-quick-response.ts` — minimal `{ message_text, expected_response_probability }`
- Idempotency: `(tenant_id, agent_id='sales', type='sales_quick_response', context.event_id)`
- Output: `drafts` `type='sales_quick_response'`
- No adaptive thinking (speed)

**Verified Hebrew output (2026-05-03):** for hot lead "אני צריך דחוף לקבוע פגישה היום. רוצה לבדוק את הטיפול. תקציב 2000 שקל. מתי אתם פנויים?" → drafted **"אהלן מוחמד, שמח לשמוע. היום אפשר לסדר משהו. מתי בדיוק נוח לך?"** — natural Hebrew, 3 sentences, no em-dash, uses display_name.

---

## 7. Design System — "Calm Frosted" (Direction D)

Apple-style: layered tints, frosted glass, system colors. **"Calm is the brand."**

Tokens in `src/app/globals.css`. **READ THIS FILE before designing any UI.** §2.12.

### 7.1 Tokens

```css
/* Base mist (page bg) */
--color-mist-blue: #E9EEF8;
--color-mist-lilac: #EFE9F4;
--color-mist-mint: #E5EEF0;

/* Glass */
--color-glass: rgba(255,255,255,0.72);
--color-glass-deep: rgba(255,255,255,0.86);
--color-glass-soft: rgba(255,255,255,0.55);

/* Borders */
--color-hairline: rgba(15,20,30,0.08);

/* Ink (text) */
--color-ink: #0F1620;     /* primary */
--color-ink-2: #3F4654;   /* secondary */
--color-ink-3: #727988;   /* tertiary, captions */

/* System — STATUS ONLY, never decoration */
--color-sys-blue: #0A84FF;        --color-sys-blue-soft: rgba(10,132,255,0.12);
--color-sys-green: #30B36B;       --color-sys-green-soft: rgba(48,179,107,0.14);
--color-sys-pink: #D6336C;
--color-sys-amber: #E0A93D;

/* Category accents */
--color-cat-routine: rgba(184,206,255,0.20);  --color-cat-routine-fg: rgba(10,70,160,0.85);
--color-cat-content: rgba(214,189,233,0.22);  --color-cat-content-fg: rgba(120,60,160,0.85);
--color-cat-insight: rgba(178,221,206,0.24);  --color-cat-insight-fg: rgba(20,120,80,0.90);
```

### 7.2 Primitives
- `<Glass>` / `<Glass deep>` — card surfaces
- `<AppleBg>` — page background
- `<Mascot>` — Spike character. PNGs: laptop, phone-left, phone-right. **Verify file exists before referencing.**

### 7.3 Utility Classes
- `.agent-card` — hover lift + shadow
- `.agent-tile` — gentle scale on parent hover
- `.section-divider` — fading horizontal line
- `.mascot-float` — gentle 4s up/down idle
- `.spike-scroll` — minimal scrollbar

### 7.4 Typography
- Hero number: `text-[32px] font-semibold leading-none tracking-[-0.035em]`
- Section title: `text-[17px] font-semibold tracking-[-0.01em]`
- Card title: `text-[15.5px] font-semibold tracking-tight`
- Role/sub: `text-[11.5px]` ink-3
- Body: `text-[12.5px] leading-[1.55]`
- Eyebrow: `text-[11px] uppercase tracking-[0.08em]`

### 7.5 Color Use
```tsx
// ✅ CSS variables in inline style
<div style={{ color: "var(--color-ink)", background: "var(--color-glass)" }}>

// ❌ Tailwind preset colors
<div className="bg-card text-foreground">
<span className="text-blue-500">
```

**Tagline:** **"שמונה סוכנים. שקט אחד."**

---

## 8. Auth Flow (OTP)

### 8.1 Supabase Dashboard
- Site URL: `https://app.spikeai.co.il`
- Redirect URLs: production + `http://localhost:3000/auth/callback`
- Email OTP length: 6 digits

### 8.2 Two Templates
Both use `{{ .Token }}` only (no `{{ .ConfirmationURL }}`):
1. Magic Link (existing users)
2. Confirm signup (new users)

### 8.3 Verification Code
```typescript
const { error } = await supabase.auth.verifyOtp({
  email: cleanEmail,
  token: cleanToken,
  type: "email",  // ⚠️ ONLY 'email'. Don't add fallbacks.
});
```

### 8.4 The Bug That Took a Day
"code expired" with fresh code → mismatch between Supabase OTP length (8 digits) and form `maxLength={6}`. Form silently truncated. Both templates set to 6-digit fixed it.

### 8.5 Login UI
OTP-only. Copy says **"קוד אימות"**, never "קישור".

### 8.6 `requireOnboarded()` Returns
```typescript
interface OnboardedContext {
  userId: string;
  userEmail: string;
  tenantId: string;
}
```
**NOT** `{ user, tenant }`. Caused 6 tsc errors in 1.4 first attempt.

---

## 9. Mobile UX

### 9.1 Architecture
- Desktop (≥768px): Sidebar fixed-right 232px. Main `md:mr-[232px]`.
- Mobile (<768px): MobileHeader + MobileDrawer + BottomNav.

### 9.2 Adaptive
- KpiStrip: `snap-x` mobile, `sm:grid sm:grid-cols-3` desktop
- WhatsAppFab: `bottom-[78px] sm:bottom-[22px]`

### 9.3 Don't
- `lg:` instead of `md:` (use 768px breakpoint)
- `/mobile` route (adaptive in-place)
- PWA / standalone app (§13)

---

## 10. WhatsApp Pipeline

### 10.1 Architecture

```
Meta Cloud API → POST /api/webhooks/whatsapp
                       │
                       ↓
                events.insert (idempotent via PK = wamid.*)
                       │
            ┌──────────┴──────────┐
            ↓                     ↓
    waitUntil(Watcher)    waitUntil(Hot Leads)
            │                     │
            ↓                     ↓
    Dashboard alerts      hot_leads.insert
                                  │
                          bucket ∈ {hot, burning}?
                                  │
                                  ↓
                       waitUntil(Sales QuickResponse)
                                  │
                                  ↓
                         drafts.insert
                                  │
                                  ↓
                       Owner sees in /approvals
```

### 10.2 BSP Decision: Meta Direct
Decided 2026-05-02. $0/month vs €49/mo BSPs. Trade-off: build Embedded Signup ourselves in Stage 2 (1-2 days).

### 10.3 Webhook: `POST /api/webhooks/whatsapp`
1. Read raw body
2. Verify signature (Stage 1: bypassed if `WHATSAPP_APP_SECRET` unset)
3. Parse via `extractMessages()`
4. Per message: resolve tenant (header override → DEMO_TENANT_ID fallback), build summary, insert events with PK = whatsappMessageId
5. After inserts: `waitUntil(runWatcherAgent)` per tenant + `waitUntil(runHotLeadsOnEvent)` per fresh event
6. Always 200

### 10.4 Watcher Cron
`/api/cron/watcher`. Schedule `0 * * * *`. Auth `Bearer ${CRON_SECRET}`.

### 10.5 Required ENV
```
WHATSAPP_VERIFY_TOKEN     # Stage 1: any string
WHATSAPP_APP_SECRET       # Stage 1: unset (signature bypass)
CRON_SECRET               # Required production. Local: 8ac0dea1-a612-478a-a115-9accb2b3a21c
```

### 10.6 Verified Performance (2026-05-03)

| Stage | Latency | Cost |
|-------|---------|------|
| POST → 200 | ~1.7s | — |
| events.insert | <100ms | — |
| Watcher complete | ~8-9s | ~₪0.012 |
| Hot Leads complete | ~9-10s | ~₪0.015 |
| Sales QR (cascade) | +6s | ~₪0.013 |
| **End-to-end (hot lead → draft)** | **~15-16s** | **~₪0.040** |

Per-message:
- Cold/warm/spam: ~₪0.027
- Hot/burning: ~₪0.040

Idempotency layers:
1. `events.id` PRIMARY KEY (text)
2. `hot_leads.event_id` partial UNIQUE
3. `drafts` filter on `(tenant_id, agent_id, type, event_id)`

### 10.7 Schema Discoveries
1. `events.event_type` (not `events.type`)
2. `integrations.credentials` does NOT exist
3. `events.id` is text NOT NULL no default
4. PostgREST cache lag → `NOTIFY pgrst, 'reload schema';`

### 10.8 Sub-stage 1.3 Details (commits `f59df9b`, `0b8d788`, `1ac925a`)
1. Hot Leads webhook trigger + idempotency (migration 020)
2. Retry logic on LLM calls (with-retry.ts)
3. Watcher prompt fix + Sales withRetry

### 10.9 Sub-stage 1.3.5 Details (commit `aec0d9a`)
1. Sales QuickResponse — new path (3 new files)
2. Hot Leads → Sales cascade

Prompt iterated draft → review → calibration with Dean. Final: 7 scenarios with before/after AI vs human examples + Israeli-tone calibration.

### 10.10 Sub-stage 1.4 Details (commit `69d066c`)

Internal Demo UI at `/dashboard/demo`. Admin allowlist (`din6915@gmail.com`).

**6 files:**
- `src/app/dashboard/demo/page.tsx` — Server Component, full chrome
- `src/app/dashboard/demo/actions.ts` — `runDemoTemplate(template)` synthesizes events.insert + waitUntil
- `src/app/api/demo/status/route.ts` — GET endpoint, polled every 1s
- `src/lib/demo/types.ts` — **NEW shared module (neutral, not "use server")** — DEMO_TEMPLATES, types
- `src/components/demo/demo-panel.tsx` — Client Component, state machine
- `src/components/demo/pipeline-status.tsx` — Client Component, visual progress

**4 prebuilt templates:**
- `hot_lead`: מוחמד אבו ראס · "...דחוף...היום...תקציב 2000 שקל..." → bucket=hot, cascade
- `question`: דנה לוי · "...לבדוק מחירים..." → bucket=warm, no cascade
- `complaint`: שרה כהן · "...לא הייתי מרוצה..." → bucket=cold/spam
- `review`: יוסי כהן · "...שירות מעולה..." → bucket=cold/spam

**Polling architecture:** UI fetches `/api/demo/status?event_id=X` every 1s. Stops when watcher terminal AND sales_qr terminal (or 60s timeout).

**Why direct events.insert vs HTTP roundtrip:** action does insert + waitUntil rather than POST to `/api/webhooks/whatsapp`. Avoids `NEXT_PUBLIC_BASE_URL`, signature setup. Functionally identical.

**Calm Frosted styling:** Glass cards, agent-card hover, AppleBg, dashboard chrome (Sidebar + MobileHeader). Tile gradients per template. WhatsApp-style bubble (white, asymmetric corner `rounded-tr-sm` for RTL incoming-message tail).

**The big lesson:** "use server" files can ONLY export async functions. Constants/types render as `undefined` when imported by client components. tsc doesn't catch this — runtime does. **Solution:** shared types in neutral module (no "use server"/"use client"). Caused the 1.4 first-iteration runtime crash.

**Verified end-to-end (2026-05-03):** clicked hot_lead → events.insert → Watcher (~9s) → Hot Leads bucket=hot (~10s) → cascade → Sales QR drafted **"אהלן מוחמד, שמח לשמוע. היום אפשר לסדר משהו. מתי בדיוק נוח לך?"** → all 3 stages green.

### 10.11 Pending — Sub-stage 1.4.5 (Showcase) — NEXT

Two paths:

**(A) Quick: Admin-only sidebar link.**
- ~15 min
- Read `src/components/dashboard/sidebar.tsx` + `mobile-drawer.tsx`
- Add conditional item with `isAdminEmail()` check
- Commit: `feat(sidebar): admin link to /dashboard/demo`

**(B) Bigger: Reposition as "Showcase" for all users.**
- ~30 min
- Move `/dashboard/demo` → `/dashboard/showcase`
- Remove `DEMO_ALLOWED_EMAILS` allowlist
- Add to sidebar as "תראה איך זה עובד" / "מדריך"
- Update copy: "Demo" → "כך Spike עוזר לך"

**Dean's stated preference (end of session 3):** "תפריט" — wants it in sidebar. Did not explicitly choose A vs B. Suggest A first, B later when there are real users.

### 10.12 Pending — Sub-stage 1.5 (Polish)

Priority order:
1. Wrap remaining 5 agents in `withRetry` (Morning, Reviews, Social, Manager, Inventory)
2. Add Hot Leads cron safety net (mirrors Watcher cron)
3. Add Sales QuickResponse cron safety net
4. Anti-AI-signature post-processing regex in run.ts of Watcher / Hot Leads / Reviews / Social / Sales (defense-in-depth)
5. Reviews / Social / Manager / Morning / Inventory prompt: anti-AI audit (1.3.5 lessons)
6. PII scrubber audit on Israeli phone formats
7. Update `INTEGRATION-NOTES.md` with actual webhook protocol
8. Final tsc + Vercel build pass

Estimated: 4-6 hours.

### 10.13 Pending — Sub-stage 1.6 (Onboarding Banner — Optional)

After 1.5: dashboard banner for users with 0 agent_runs:
> "לא הרצת עדיין שום סוכן. רוצה לראות איך Spike עובד? → ל-Showcase"

Disappears after first run. Only useful if Showcase exists (1.4.5 must come first).

---

## 11. Current Status (May 2026)

### 11.1 What Works ✅
- All 8 customer-facing agents on real DB events
- Cleanup agent on cron
- Login (OTP code-only)
- Onboarding (4 fields)
- Dashboard with 3 agent categories + KPI strip
- Mobile UX (drawer + bottom nav)
- Approvals · Inventory · Leads · Manager
- Full safety pipeline
- **1.1:** WhatsApp Cloud API webhook receiver
- **1.2:** Watcher auto-trigger + hourly cron
- **1.3:** Hot Leads parallel + idempotency + LLM retry + Watcher prompt fix
- **1.3.5:** Sales QuickResponse + Hot Leads cascade
- **1.4:** Internal Demo UI at `/dashboard/demo`

### 11.2 Pending — Not Blocking 🚧
- 7 sidebar pages 404: הסוכנים שלי, דוחות, התראות, מרכז בקרה, אמון ופרטיות, הגדרות, מרכז ניהול
- `actions.ts` 1430 lines — split
- Race in `inventory-upload-zone` + `run-inventory-button`
- Cleanup agent location undocumented
- 2 moderate npm audit vulnerabilities
- `integrations` table schema not yet finalized
- Anti-AI audit on 5 agents

### 11.3 Pending — Critical for Demo 🔴
- 1.4.5 (sidebar / showcase)
- 1.5 (polish)
- First real customer integration

### 11.4 Pending — Pre-Production Deploy ⚠️
- Set `CRON_SECRET` in Vercel env (Production + Preview)
- Set `WHATSAPP_VERIFY_TOKEN` in Vercel
- Open Meta Business Manager + start verification (2-10 days async)
- Eventually: `WHATSAPP_APP_SECRET` (Stage 2)
- **Anthropic credits:** auto-reload disabled, $4.20 balance. Top up before first prospect demo.

---

## 12. Strategic Roadmap

### 12.1 Pricing (Decided)
| Tier | Price/mo | Setup | Target |
|------|----------|-------|--------|
| Solo | ₪290 | ₪990 | עוסק יחיד |
| Pro | ₪690 | ₪990 | small business with employees |
| Chain | ₪1,490 | ₪990 | 3-15 locations |

14-day trial. NO freemium. 17% annual discount.

### 12.2 Stage 1 — WhatsApp First Integration (current)
- 1.1 ✅ Webhook receiver
- 1.2 ✅ Watcher real-time + cron
- 1.3 ✅ Hot Leads parallel + idempotency + retry + prompt fix
- 1.3.5 ✅ Sales QuickResponse + cascade
- 1.4 ✅ Internal Demo UI
- **1.4.5 🔵 NEXT — sidebar link / Showcase**
- **1.5 🔵 — Polish**
- 1.6 🔵 — Onboarding banner (optional)

### 12.3 Stage 2 — Production WhatsApp
1. Meta verification (parallel during 1.4.5/1.5)
2. Embedded Signup UI for tenants
3. `integrations` table schema design
4. Outgoing message templates
5. Real `phone_number_id` → `tenant_id` mapping
6. Set `WHATSAPP_APP_SECRET` (no longer bypass)

Estimated: 5-7 days.

### 12.4 Stage 3 — Next 30 Days (post Stage 2)
1. **Trust Agent v0.5** (~10d) — תיקון 13 + DPO checklist. Killer differentiator. **Solo**.
2. **Cash Flow Agent v0.5** (~14d) + GreenInvoice. Highest pain. **Pro**.
3. **VAT Agent** — חשבונית ישראל. **Pro**.
4. **Chain HQ Agent** — multi-location. **Chain**.
5. **Win-Back Agent** — re-engage lapsed. **Pro**.

### 12.5 Tier Mapping
- **Solo:** Trust agent
- **Pro:** Cash Flow + GreenInvoice, Win-Back, VAT, Manager
- **Chain:** Chain HQ + everything in Pro

### 12.6 Distribution Hidden Opportunities
- vcita inTandem partnership (OEM)
- Voicenter voice channel (Hebrew TTS/STT)
- Israeli franchises (Roladin, Aroma, Cofizz, Re/Max)

---

## 13. What NOT to Build

| Idea | Why not |
|------|---------|
| NPS / CSAT surveys | Commodity. vcita / Birdeye / Podium do it. |
| Schedule optimization for staff | Israeli labor law = lawyer territory. |
| Contract review | "Legal advice" liability. |
| Competitor scraping | TOS violation. |
| Senior Manager Agent (AI flagging AIs) | AI flagging AI = bias amplification. **Push back if proposed.** |
| Crypto / Web3 | Not relevant to ICP. |
| Standalone mobile app | Not before 100 paying customers. |
| Open-source release | Distraction from revenue. |
| OpenAI / Gemini integration | Violates Iron Rule 1.3. |
| Email-as-product | Mailchimp / ActiveCampaign exist. |
| Calendar booking | Calendly / vcita won. |
| Generic chatbot widget | That's the "בוט" we don't sell. |
| 360dialog / BSP middleman | Direct Meta = $0. |
| Refer customers to competitors | Decided 1.3.5. Hurts retention. |

---

## 14. Israeli Market Context

### 14.1 Why This Market
- 850K+ SMBs in Israel
- WhatsApp adoption: ~99%, daily active: ~98%
- Hebrew-first underserved (vcita, HubSpot, Salesforce English-only or weak Hebrew)
- 3-15 location chains: white space
- תיקון 13 (Aug 2025) — universal compliance need
- חשבונית ישראל (Jan 2025) — current pain

### 14.2 Competition
| Competitor | Strength | Spike's Advantage |
|------------|----------|-------------------|
| vcita | 850K SMBs, English AI Receptionist | Hebrew-native |
| HubSpot Breeze | $0.50/conv, strong CRM | Israeli regulation built in |
| Salesforce Agentforce | Enterprise pedigree | No Hebrew; expensive |
| Toast IQ / GlossGenius | Vertical-specific | We span verticals |
| Birdeye / Podium | Reviews + messaging | We're drafts only (compliance) |
| Wix.AI | Wix install base | **Underestimated. Watch.** |
| Lindy AI | Multi-agent | English-first, no IL regulation |

---

## 15. Common Pitfalls

### 15.1 Don't Do These
- ❌ Use "בוט". Use "סוכן AI" / "סוכן".
- ❌ Suggest auto-send "for transactional".
- ❌ Propose i18next / English version.
- ❌ "OpenAI is cheaper" — Anthropic-only is strategic.
- ❌ Add analytics SaaS without checking. Bootstrap mode.
- ❌ Manually edit 1000-line file. Generate full file.
- ❌ Tell Dean to take a break (except sub-stage boundaries).
- ❌ Tell Dean "good night" at 7am.
- ❌ Hallucinate names from `events.payload`.
- ❌ Hallucinate facts in CLAUDE.md ("Dean provided X" without verification).
- ❌ Build a feature without `expires_at` in `drafts`.
- ❌ Skip safety pipeline. Use `runAgentSafe`.
- ❌ Propose "senior agent monitoring agents". Rejected. Redirect to retry/alerts.
- ❌ Suggest pivoting to en-US.
- ❌ "Complete" `src/lib/agents/cleanup/` with stub.
- ❌ Treat "9 agents" as typo. Intentional.
- ❌ Use em-dash (—) in agent output.
- ❌ Add BSP middleman.
- ❌ Dot notation in `event_type`. Snake_case.
- ❌ Refer customers to competitors. Leave door open.
- ❌ "אתקשר בעוד X דקות" for persistent. Israeli-stressful.
- ❌ Confuse `runSalesAgent` with `runSalesQuickResponseOnEvent`.
- ❌ Trigger Sales QR on cold/warm/spam. Cascade is hot/burning only.
- ❌ **Build new UI without reading `globals.css` first.** §2.12.
- ❌ **Use Tailwind preset colors (`bg-rose-500`) for design.** Use CSS variables in `style={{}}`. Tailwind for layout/sizing only.
- ❌ **Put constants/types in "use server" file.** Renders as `undefined` in client imports. Use neutral module. §10.10.
- ❌ Assume `requireOnboarded()` returns `{ user, tenant }`. It returns `{ userId, userEmail, tenantId }`.
- ❌ Reference `/mascot/phone-right.png` without verifying file exists.

### 15.2 Schema Audit Before INSERTs
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = '<table>' AND table_schema = 'public';
```

After migrations: `NOTIFY pgrst, 'reload schema';`

### 15.3 Web Search
- Repo: `https://github.com/DinSpikeAI/spike-agents-engine` (public)
- `web_fetch` cannot read GitHub `tree/` or `commits/` (robots.txt). Use `git log` from user.

### 15.4 Code Generation
- Read full file before editing
- Produce full file as output (or `str_replace` on fresh-from-disk + show full final)
- Self-diff: requested changes present, **only** those
- 2+ files of same name: distinct names in `/outputs/`, rename in Move-Item

### 15.5 PowerShell
- 2 terminals (dev + commands)
- `Test-NetConnection` before POSTs
- Tee-Object pipeline doesn't block
- Add-Content doesn't add newline
- Verify env after appending
- localhost wraps in chat
- Stale .next cache → `Remove-Item -Recurse -Force .next` + restart dev
- Turbopack SST file errors → same fix

### 15.6 UI Design Workflow
**Before any UI:**
```powershell
Get-Content "src\app\globals.css"
Get-Content "src\components\dashboard\kpi-strip.tsx"
Get-Content "src\app\dashboard\page.tsx"
```

If skipped: expect 3-4 design iterations. §2.12.

### 15.7 Iteration Speed
- 1.1: ~2h (20-min schema-mismatch debug)
- 1.2: ~1.5h
- 1.3: ~3h (3 parts)
- 1.3.5: ~2h (1h prompt design)
- 1.4: ~4-5h (UI iteration heavy due to skipping §2.12)

For prompt sub-stages: 30 min draft → review → calibration before code.
For UI sub-stages: read globals.css + 1-2 components before code.

---

## 16. Commit Conventions

Conventional commits, English subject, Hebrew body OK.
Format: `<type>(<scope>): <subject>`
Scopes: `auth`, `mobile`, `design`, `morning`, `watcher`, `reviews`, `hot_leads`, `social`, `sales`, `inventory`, `manager`, `cleanup`, `approvals`, `onboarding`, `ui`, `db`, `safety`, `whatsapp`, `webhooks`, `agents`, `demo`, `sidebar`.

---

## 17. Onboarding a New Claude Conversation

If you are Claude reading this for the first time:

1. ✅ Read this file completely. Then re-read §1, §2, §6.6, §6.8, §10.
2. ❌ Do not re-ask Dean to summarize the project.
3. ❌ Do not suggest building anything from §13.
4. ✅ Ask Dean: "מה הצעד הבא?" if he hasn't said.
5. ✅ Push back if request violates §1 or §13.
6. ✅ Confirm you've read this file in your first reply, in 2-3 lines max.

**Sample first reply:**
> קראתי את CLAUDE.md. Spike Engine — 8 סוכני AI מול לקוח + cleanup פנימי, drafts-only, עברית RTL, Anthropic only. ה-pipeline המלא של WhatsApp פועל end-to-end (1.1-1.4 הושלמו). הצעד הבא הוא 1.4.5 (sidebar link) או 1.5 (Polish). מה אתה רוצה לעשות?

---

## 18. Appendix

### 18.1 Migrations (20 files)
- `001_reset.sql` · `002_schema.sql` · `003_rls.sql`
- `016_seed_watcher_events.sql` (15 events)
- `017_seed_review_events.sql` (4 reviews)
- `018_seed_lead_events.sql` (5 leads)
- `019_onboarding_columns.sql`
- `020_hot_leads_event_idempotency.sql` — 1.3 — event_id + UNIQUE
- (Some numbers skipped between 003 and 016)

### 18.2 Selected Commits (recent first)
| Hash | What |
|------|------|
| `69d066c` | feat(demo): Sub-stage 1.4 — internal Demo UI |
| `b500423` | docs: update CLAUDE.md through 1.3.5 |
| `aec0d9a` | feat(agents): Sales QuickResponse + Hot Leads cascade (1.3.5) |
| `1ac925a` | feat(agents): Watcher prompt fix + Sales withRetry (1.3 part 3) |
| `0b8d788` | feat(agents): exponential-backoff retry (1.3 part 2) |
| `f59df9b` | feat(hot_leads): event-triggered classification (1.3 part 1) |
| `cc85952` | feat(whatsapp): trigger Watcher on inbound (1.2) |
| `aaa2f1d` | feat(webhooks): WhatsApp Cloud API receiver (1.1) |
| `2869988` | docs: update CLAUDE.md with 1.1+1.2 findings |
| `a2288b5` | docs: rebuild CLAUDE.md from filesystem audit |
| `208ea50` | fix(auth): use only 'email' type for verifyOtp |
| `91731e4` | feat(mobile): hi-tech mobile UX |
| `dac7eb9` | feat(design): Phase 1+2 polish |

### 18.3 Links
- Repo: https://github.com/DinSpikeAI/spike-agents-engine
- Production: https://app.spikeai.co.il
- Supabase: ref `ihzahyzejqpjxwouxuhj`

### 18.4 Where to Find Things
- Calm Frosted tokens → `src/app/globals.css`
- Dashboard chrome reference → `src/app/dashboard/page.tsx`
- Glass primitive → `src/components/ui/glass.tsx`
- Webhook receiver → `src/app/api/webhooks/whatsapp/route.ts`
- Sales QR prompt → `src/lib/agents/sales/prompt-quick-response.ts`
- Hot Leads cascade logic → `src/lib/agents/hot_leads/run.ts` lines ~488-525
- Demo shared types → `src/lib/demo/types.ts`
- requireOnboarded → `src/lib/auth/require-onboarded.ts`

---

**End of CLAUDE.md.**

If something here is wrong or outdated, the priority is to update **this file first**, then the code. This file is a load-bearing document.
