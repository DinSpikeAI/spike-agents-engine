# CLAUDE.md — Spike Engine Briefing

> **For Claude (the AI coding assistant) reading this:** This file is your briefing. Read it in full before responding to the user. Do not ask the user to re-explain the project. When this file conflicts with your training data, **this file wins**.
>
> **Last updated:** 2026-05-02 — verified against the live codebase (filesystem audit + grep across `src/`).

---

## 0. TL;DR

- **What:** Multi-tenant SaaS in **Hebrew RTL** for Israeli SMBs (salons, restaurants, clinics, retail, 3–15 location chains). 8 customer-facing AI agents draft proposals; the business owner approves before anything sends. A 9th internal agent (`cleanup`) does housekeeping — never visible to the user.
- **Founder / sole dev:** Dean Moshe (`din6915@gmail.com`). Bootstrap mode. Hebrew speaker.
- **The Iron Rule above all others:** **"AI מסמן, בעלים מחליט"** — AI flags, owner decides. Drafts only. Never auto-send.
- **Marketing tagline:** **"שמונה סוכנים. שקט אחד."** ("Eight agents. One quiet.") — refers to the 8 customer-facing agents. The cleanup agent is backstage, not part of the public count.
- **Stack:** Next.js 16.2.4 (Turbopack) + React 19.2.4 + Tailwind v4 + TypeScript · Supabase (Frankfurt) · `@anthropic-ai/sdk` (Sonnet 4.6 + Haiku 4.5; Opus 4.7 declared as future option) · Resend · Vercel.
- **Domain:** `app.spikeai.co.il` (production) · `localhost:3000` (dev).
- **State:** All 8 customer-facing agents run on real DB events. Auth works. Mobile UX complete. 7 sidebar pages still 404. **No real customer integration yet** — still seed data.
- **Don't propose:** NPS surveys · schedule optimization for staff · contract review · crypto/Web3 · a "senior manager of agents" · OpenAI fallback · standalone mobile app. These were considered and rejected.
- **Next critical step:** First real integration (WhatsApp Business API) so agents work on actual customer events instead of seed data.

---

## 1. Iron Rules (Non-Negotiable)

These are **product invariants**, not preferences. Every PR respects them. Push back against the user if asked to violate one.

### 1.1 "AI מסמן, בעלים מחליט" — AI Flags, Owner Decides
- Every customer-facing agent action produces a `drafts` row.
- The business owner approves drafts via `/dashboard/approvals` before anything reaches a customer.
- **Auto-send is forbidden** — even with the user's permission in chat.
- **Allowed exception:** owner pre-approves a static template in Settings ("we'll get back to you within an hour"). This is an owner choice, not AI autonomy.
- The internal `cleanup` agent has its own rule: it **never** notifies, **never** creates drafts, **never** appears in user UI. It is backstage by design (see §6.2).

### 1.2 The Word "בוט" Is Forbidden
- Never. Use **"סוכן AI"** or **"סוכן"**.
- Applies to UI strings, error messages, marketing copy, internal logs, comments, commit messages.

### 1.3 Anthropic Only
- All LLM calls go through `@anthropic-ai/sdk` via the singleton at `src/lib/anthropic.ts` (server-only).
- No OpenAI, no Gemini, no Cohere, no Mistral, no local models.
- Strategic positioning, not a cost decision. Don't propose hybrid architectures.

### 1.4 Hebrew RTL Only
- All user-facing UI is `dir="rtl"` and Hebrew.
- English exists only in: code, commits, comments, internal logs, this file.
- No `i18n` abstraction yet. Strings are inline. Don't propose `next-intl` until customer #1 outside Israel.

### 1.5 Safety Pipeline Before LLM (Not Just PII Scrub)
There is a full safety pipeline at `src/lib/safety/`. Every customer-facing agent's untrusted input passes through it before reaching Anthropic. The pipeline is enforced by the `run-agent-safe.ts` wrapper (see §6.4).

The four modules:

| Module | File | Purpose |
|--------|------|---------|
| **PII Scrubber** | `pii-scrubber.ts` | Redacts phones, emails, ID numbers, credit cards, addresses with placeholder tokens (Hebrew-aware). Required by **תיקון 13** (Aug 2025). Functions: `scrubPii()`, `hashRecipient()`. |
| **Defamation Guard** | `defamation-guard.ts` | Detects לשון הרע signals before drafting review responses; can mark a draft as redacted. |
| **Gender Lock** | `gender-lock.ts` | Enforces Hebrew grammatical agreement (זכר/נקבה) per `tenants.business_owner_gender`. |
| **Prompt Injection Guard** | `prompt-injection-guard.ts` | `detectInjectionAttempt()` runs against every untrusted text segment. Used together with `wrapUntrustedInput()` (sentinel tags around customer input). |
| **README** | `README.md` | Internal documentation of the safety pipeline. |

The wrapper function `sanitizeUntrustedInput()` in `run-agent-safe.ts` chains these: `scrubPii → wrapUntrustedInput → detectInjectionAttempt`. Every caller goes through this — **never** call Anthropic directly with untrusted text.

### 1.6 Israeli Regulation Built In
- **סעיף 30א לחוק התקשורת** (anti-spam): no marketing message without prior opt-in.
- **לשון הרע** (defamation): handled in the Reviews safety pipeline.
- **תיקון 13** (privacy): handled by the PII scrubber.
- These are constraints on every other feature, not features themselves.

### 1.7 Drafts Have Expiry
- Every draft has `expires_at`. Default: 72 hours (Day 17 audit fix #6).
- Expired drafts are hidden from the Approvals page — the cleanup agent enforces this on cron.
- Don't propose features that auto-extend drafts without explicit owner action.

### 1.8 Gender Lock Is Mandatory in Hebrew Output
- Tenants have `business_owner_gender` (זכר / נקבה).
- Every Hebrew agent output respects grammatical agreement.
- Implementation: `src/lib/safety/gender-lock.ts` — used by Reviews and Sales especially.

---

## 2. Working with Dean

Dean is founder, sole developer, product owner. Getting his style right makes the difference.

### 2.1 Communication
- **Hebrew in chat. Always.**
- English in code, commits, comments, error messages.
- Brevity preferred. Long preambles annoy him.

### 2.2 Brutal Honesty Over Diplomacy
- Bad idea → say it's bad. Don't soften with "great question".
- Plan has a flaw → point it out **before** executing.
- **"I don't know"** is preferred over a confident guess.

### 2.3 PowerShell File Workflow
1. Claude generates the **full file** in `/mnt/user-data/outputs/`.
2. Claude calls `present_files`.
3. Dean downloads to `~/Downloads/`.
4. Dean runs `Move-Item -Force "$HOME\Downloads\file.tsx" "src\..."` from `C:\Users\Din\Desktop\spike-engine`.
5. `npx tsc --noEmit` to type-check.
6. If clean: `git add -A && git commit -m "..." && git push`.
7. Vercel auto-deploys.
8. Dean tests at `app.spikeai.co.il`.

**Always produce the full file.** Dean does not run `sed` / `diff` on 1000-line files.

### 2.4 Don't Relitigate Settled Decisions
- **9 agents stay 9** (8 customer-facing + 1 cleanup). Until 100 paying customers, then revisit.
- **Hebrew RTL** is permanent.
- **Drafts-only** is permanent.
- **Anthropic-only** is permanent.
- **Pricing tiers**: Solo ₪290 / Pro ₪690 / Chain ₪1,490 + ₪990 setup + 14-day trial. NO freemium.
- The "what not to build" list (§13) is decided.

### 2.5 Three Options + Recommendation
For non-trivial choices:
1. Three concrete options.
2. Trade-offs of each.
3. Claude's clear recommendation with reasoning.

Not "here are some thoughts to consider…"

### 2.6 Don't Be a Therapist
- Don't ask if Dean is tired.
- Don't suggest he sleep or take a break.
- Don't soften technical pushback with concern about wellbeing.

### 2.7 Bootstrap Mode
- Only paid expense: Anthropic API.
- No Salesforce, no Asana, no Linear, no analytics SaaS.
- Suggestions must be free / self-hosted unless customer revenue exists.

### 2.8 Verify Before Documenting
This file was rebuilt on 2026-05-02 specifically because the prior summary contained inferences that didn't match the codebase. **If you find a fact in this file that contradicts the code: trust the code, then update this file.** Don't pretend the doc is right when it isn't.

### 2.9 Known Display Bug (Not Real)
Claude.ai's chat sometimes wraps `INTEGRATION-NOTES.md` (and similar dotted strings) as malformed links. The file actually exists at `src/lib/agents/watcher/INTEGRATION-NOTES.md` and is correct on disk and in GitHub. Only the chat display is broken. Don't try to "fix" it on the file side.

---

## 3. Tech Stack

### 3.1 Frontend
- **Next.js 16.2.4** with **Turbopack** (replaces Webpack — Next 16 has breaking changes from Next 14/15. Check `node_modules/next/dist/docs/` if unsure.)
- **React 19.2.4**
- **Tailwind v4** with PostCSS (uses CSS variables, not the older `theme.extend`)
- **TypeScript 5.x** strict
- **shadcn/ui** in `src/components/ui/`
- **lucide-react** for icons
- **sonner** for toasts

### 3.2 Backend / DB
- **Supabase** project ref `ihzahyzejqpjxwouxuhj`, Frankfurt (eu-central-1)
- **`@supabase/ssr`** for cookie-based auth in server components / actions
- **`@supabase/supabase-js`** for client-side queries
- Three Supabase clients in `src/lib/supabase/`:
  - `server.ts` — Server Components (uses `cookies()` from `next/headers`)
  - `client.ts` — Client Components
  - `admin.ts` — service-role key, bypasses RLS, **server-only**

### 3.3 LLM
- **`@anthropic-ai/sdk`** via singleton at `src/lib/anthropic.ts` (server-only enforced)
- **Cost tracking** in `src/lib/anthropic-pricing.ts` → writes to `cost_ledger` table
- Models hardcoded per agent as `const MODEL = "..." as const;` at the top of each `run.ts` (see §6.3)
- The `AgentModel` type in `src/lib/agents/types.ts` permits three values:
  ```typescript
  type AgentModel = "claude-haiku-4-5" | "claude-sonnet-4-6" | "claude-opus-4-7";
  ```
  `claude-opus-4-7` is **declared but unused today**. It's a reserved future-upgrade slot. If a request needs Opus-tier reasoning, this is the door.

### 3.4 Email & Auth
- **Resend** (sender domain `auth.spikeai.co.il`, verified)
- Auth via Supabase OTP code (see §8). Magic links removed from UX 2026-05-02.

### 3.5 Hosting
- **Vercel** auto-deploys from `main`
- Env vars in Vercel dashboard
- Production: `app.spikeai.co.il` · Dev: `localhost:3000`

---

## 4. Repository Layout (Audited 2026-05-02)

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
│   │   └── globals.css          # Calm Frosted design tokens
│   ├── components/
│   │   ├── ui/                  # glass.tsx, mascot.tsx, apple-bg.tsx, shadcn primitives
│   │   └── dashboard/
│   │       ├── sidebar.tsx          # desktop right-side, hidden on mobile
│   │       ├── topbar.tsx
│   │       ├── mobile-header.tsx    # mobile sticky 52px
│   │       ├── mobile-drawer.tsx    # mobile right-side drawer (RTL)
│   │       ├── bottom-nav.tsx       # mobile bottom 4 tabs
│   │       ├── kpi-strip.tsx        # snap-x mobile, grid desktop
│   │       ├── whatsapp-fab.tsx     # bottom-78px mobile, 22px desktop
│   │       └── run-*-button.tsx     # one per customer-facing agent
│   └── lib/
│       ├── anthropic.ts             # Singleton SDK client (server-only)
│       ├── anthropic-pricing.ts     # cost_ledger calculator
│       ├── utils.ts                 # general helpers
│       ├── supabase/                # server.ts, client.ts, admin.ts
│       ├── auth/                    # require-onboarded.ts guard
│       ├── safety/                  # ⚠️ The full safety pipeline
│       │   ├── pii-scrubber.ts
│       │   ├── defamation-guard.ts
│       │   ├── gender-lock.ts
│       │   ├── prompt-injection-guard.ts
│       │   └── README.md
│       ├── admin/                   # admin/ops tooling (not customer code)
│       │   ├── auth.ts              # admin-only guard
│       │   └── queries.ts           # 11.7KB — likely backend for "מרכז ניהול"
│       ├── health/                  # tenant health-score logic
│       │   └── score.ts             # 13.5KB
│       ├── quotas/                  # cost cap enforcement
│       │   └── check-cap.ts         # 5.9KB
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
│   └── migrations/                  # 18 SQL files numbered 001–019 (one number skipped)
├── public/
│   └── mascot/                      # 3 PNGs: laptop, phone-left, phone-right
└── package.json
```

**Note on `cleanup` agent:** declared in `types.ts` and `config.ts`, **but has no dedicated folder** under `src/lib/agents/`. Its actual implementation likely lives in a cron handler or in `actions.ts`. To verify next time it's touched. (See §6.2.)

---

## 5. Database Schema

DB lives at Supabase project `ihzahyzejqpjxwouxuhj`.

### 5.1 Core Tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `tenants` | The business (one per customer) | `id`, `name`, `vertical`, `business_owner_gender` |
| `user_settings` | Per-user prefs / feature flags | `user_id`, `tenant_id`, `onboarding_completed_at` |
| `memberships` | Many-to-many user↔tenant | `user_id`, `tenant_id`, `role` |
| `agents` | Master list (9 entries) | `id`, `slug`, `name_he`, `model` |
| `agent_prompts` | Versioned prompts | `agent_id`, `version`, `prompt_md` |
| `tenant_agents` | Per-tenant enablement + config | `tenant_id`, `agent_id`, `enabled` |
| `agent_runs` | Every execution | `id`, `agent_id`, `tenant_id`, `status`, `started_at`, `finished_at`, `cost_cents`, `pii_scrubbed`, `injection_attempts_detected` |
| `events` | **Inbound real-world events** | `id`, `tenant_id`, `type`, `payload` (JSONB), `created_at` |
| `drafts` | Awaiting owner approval | `id`, `tenant_id`, `agent_id`, `kind`, `content_he`, `status`, `expires_at` |
| `integrations` | Third-party connections | `tenant_id`, `provider`, `credentials` (encrypted) |
| `notifications` | In-app alerts | `tenant_id`, `type`, `body_he`, `read_at` |
| `cost_ledger` | Anthropic spend tracking | `tenant_id`, `agent_run_id`, `cost_cents` |
| `system_alerts` | Admin-level alerts | `severity`, `body`, `resolved_at` |
| `outbox` | Pending external sends (currently unused — drafts-only) | — |
| `idempotency_keys` | Prevent duplicate runs | `key`, `tenant_id`, `expires_at` |
| `audit_log` | Sensitive actions | `actor_id`, `action`, `target`, `payload` |
| `leads` | Materialized lead records | `tenant_id`, `name`, `contact`, `source`, `temperature` |
| `manager_reports` | Weekly summaries | `tenant_id`, `week_starts_on`, `content_md` |
| `manager_weekly_lock` | Mutex per week | `tenant_id`, `week_starts_on` |
| `inventory_snapshots` | Parsed CSV uploads | `tenant_id`, `uploaded_at`, `items` |

### 5.2 Tenant Config

- `name` — business name
- `vertical` — constraint: `general | clinic | financial | restaurant | retail | services | beauty | education`
- `business_owner_gender` — required for Hebrew grammatical agreement (זכר / נקבה)
- `owner_name` — used in greetings ("ערב טוב, יוסי")
- `business_name`
- `onboarding_completed_at` — gate for `requireOnboarded` guard

### 5.3 The Events Contract — Read This Twice

**Every customer-facing agent reads from `events.payload.summary` (in Hebrew). This is the canonical contract.**

When a future webhook (e.g., WhatsApp Business API) is built, it writes:

```json
{
  "tenant_id": "uuid-of-the-business",
  "type": "lead.new",
  "payload": {
    "summary": "ליד חדש מ-WhatsApp: דנה לוי שאלה על מחירים",
    "source": "whatsapp",
    "contact_name": "דנה לוי",
    "contact_phone": "+972-50-...",   // PII — scrubbed before LLM
    "raw_message": "..."              // PII — scrubbed before LLM
  }
}
```

**Rules:**
- `payload.summary` in Hebrew is **mandatory**.
- Agents do not read sub-fields of `payload` directly. They read `summary`.
- → New integrations require **zero code changes** in agent files. Their only job: produce a good Hebrew `summary`.
- Sub-fields (`source`, `contact_name`, `platform`, `rating`) are for the dashboard UI and for materializers (e.g., `events → leads` row creation).

For deep guidance on hooking up a webhook to Watcher: see `src/lib/agents/watcher/INTEGRATION-NOTES.md` (real file, despite Claude.ai's display bug — see §2.9).

### 5.4 Demo Data
- **Demo tenant ID:** `15ef2c6e-a064-49bf-9455-217ba937ccf2`
- **Demo user:** Dean Moshe, `din6915@gmail.com`, ID `69ea2326-a5cf-4c53-a9ec-866b70e1060f`

---

## 6. The Agents — 8 Customer-Facing + 1 Internal

The product surface is 8 agents. The marketing tagline **"שמונה סוכנים. שקט אחד."** refers to these 8. A 9th internal agent (`cleanup`) handles housekeeping and never appears in user UI.

### 6.1 The 8 Customer-Facing Agents

All 8 run on real DB events as of May 2026. Models verified directly from each `src/lib/agents/<name>/run.ts`.

| # | Agent | `AgentId` | Model | Trigger | Output | Folder extras |
|---|-------|-----------|-------|---------|--------|---------------|
| 1 | **Manager** | `manager` | `claude-sonnet-4-6` | Weekly cron (Sunday) | `manager_reports` row | + `data-collector.ts` |
| 2 | **Morning** | `morning` | `claude-haiku-4-5` | Daily cron (07:00 IL) | `drafts` (kind=`morning_brief`) | — |
| 3 | **Watcher** | `watcher` | `claude-haiku-4-5` | Real-time on `events` insert | Classification → routes to other agents | + `hierarchy.ts`, `INTEGRATION-NOTES.md` |
| 4 | **Reviews** | `reviews` | `claude-sonnet-4-6` | New review event | `drafts` (kind=`review_response`) | — |
| 5 | **Hot Leads** | `hot_leads` | `claude-haiku-4-5` | New lead event | Classification: `cold` / `warm` / `hot` / `burning` | — |
| 6 | **Social** | `social` | `claude-sonnet-4-6` | Manual / scheduled (skips Saturday — Day 17 fix #5) | `drafts` (kind=`social_post`) | — |
| 7 | **Sales** | `sales` | `claude-sonnet-4-6` | Stale lead detection | `drafts` (kind=`whatsapp_followup`) | — |
| 8 | **Inventory** | `inventory` | `claude-sonnet-4-6` | Manual CSV upload | `drafts` (kind=`inventory_analysis`) | + `csv-parser.ts` |

Each customer-facing agent folder has the same shape:
- `prompt.ts` — system prompt construction (Hebrew)
- `run.ts` — the executor (calls `runAgentSafe` from §6.4)
- `schema.ts` — Zod schema for output validation

### 6.2 The Internal Agent — Cleanup

`AgentId: "cleanup"`. **Not customer-facing. Not part of the marketing 8.**

| Property | Value |
|----------|-------|
| **Purpose** | Housekeeping. Runs on cron. |
| **Responsibilities** | Expire old drafts (per Day 17 fix #6 expiry policy) · archive old `agent_runs` · expire `idempotency_keys` · likely cleanup of stale `notifications` |
| **NEVER** | …notifies the user · creates drafts · appears in `/dashboard/approvals` · runs an LLM call |
| **State** | Always `succeeded` or `no_op`. Never "awaiting approval". |
| **Implementation location** | **Not** in `src/lib/agents/cleanup/` (no folder exists). Likely lives in a cron handler or in `actions.ts`. **TODO:** locate and document precisely on next touch. |
| **Why no LLM** | It's a SQL/cron agent. The "agent" abstraction is reused for unified observability (`agent_runs`, `cost_ledger`), not because it speaks to Claude. |

If a future user asks "why is `cleanup` listed in `types.ts` but has no folder?" — that's the answer. It's intentional. Don't try to "complete" the folder structure with an empty stub.

### 6.3 Models — How They're Configured

**Models are hardcoded per-agent**, not in DB, not in env. Each `run.ts` opens with:

```typescript
const MODEL = "claude-haiku-4-5" as const;  // or "claude-sonnet-4-6"
```

This means changing a model is a code change, not a config change. To upgrade Sales to Opus when the time comes, edit `src/lib/agents/sales/run.ts` line 32. The `AgentModel` type in `types.ts` already permits `claude-opus-4-7`, so no type widening is needed.

**Distribution today:**
- Haiku 4.5: `morning`, `watcher`, `hot_leads` (high-frequency, low-latency)
- Sonnet 4.6: `reviews`, `social`, `sales`, `manager`, `inventory` (quality + thinking)
- Opus 4.7: none yet — reserved future slot

### 6.4 Agent Run Lifecycle (via `run-agent-safe.ts`)

The wrapper `runAgentSafe()` is the canonical entry point for every customer-facing agent execution. It enforces the safety pipeline. **Never call Anthropic directly from agent code — always go through this wrapper.**

Pipeline:
1. Trigger (cron / event / user click on `run-*-button`)
2. `agent_runs` row created with `status='running'`
3. Read context from `events`, `tenants`, prior runs
4. **`sanitizeUntrustedInput()`** on every customer-originated text:
   - `scrubPii()` — replaces PII with placeholders
   - `wrapUntrustedInput()` — sentinel-tags the scrubbed text
   - `detectInjectionAttempt()` — flags suspicious patterns
5. Anthropic call (model from agent's `MODEL` constant)
6. Post-process safety guards (`defamation-guard`, `gender-lock`) for agents that need them (Reviews especially)
7. Validate output against the agent's Zod `schema.ts`
8. Write `drafts` row with `expires_at = now() + 72h`
9. `agent_runs.status = 'succeeded'`, `cost_cents` populated
10. `cost_ledger` row appended (computed via `anthropic-pricing.ts`)
11. `notifications` row created for the owner
12. Side-channel: `pii_scrubbed`, `injection_attempts_detected` flags persisted on the run

The cleanup agent uses `runAgent()` (not `runAgentSafe()`) since it has no untrusted input to sanitize.

---

## 7. Design System — "Calm Frosted"

Inspiration: Apple HIG + soft pastels. Tokens in `src/app/globals.css`.

### 7.1 Tokens
- **3 backgrounds:** `--color-mist-blue`, `--color-mist-lilac`, `--color-mist-mint`
- **Glass:** `rgba(255,255,255,0.72)` + `backdrop-blur(40px) saturate(180%)`
- **Hairlines:** `rgba(15,20,30,0.08)`
- **Text:** `ink` / `ink-2` / `ink-3`
- **System colors:** `sys-blue` (#0A84FF), `sys-green` (#30B36B), `sys-pink` (#D6336C), `sys-amber` (#E0A93D)

### 7.2 Animation
- `--ease-soft: cubic-bezier(0.32, 0.72, 0.32, 1)` — Apple's standard
- `agent-card` hover: lift 2px + deepen shadow
- `mascot-float`: 4s gentle vertical loop
- All respect `prefers-reduced-motion`

### 7.3 Mascot — "Spike"
Teal robot. Three poses in `/public/mascot/`:
- `mascot-laptop.png` — large hero with laptop and data bubbles → **Login desktop**
- `mascot-phone-left.png` — gentle smile, calm → **Onboarding form**
- `mascot-phone-right.png` — open smile, energetic → **Approvals empty state + Login mobile**

### 7.4 Agent Categories (UI Grouping on Dashboard)

The 8 customer-facing agents are grouped into 3 visual categories on the dashboard:

| Category | Agents | Tint |
|----------|--------|------|
| **שגרה יומית** | Morning, Watcher | `cat-routine` (blue) |
| **תוכן ושירות לקוח** | Reviews, Social, Sales | `cat-content` (lilac) |
| **ניתוח ותובנות** | Manager, Hot Leads, Inventory | `cat-insight` (mint) |

Cleanup is not in any category — not on the dashboard.

### 7.5 Tagline
**"שמונה סוכנים. שקט אחד."** Used on Login desktop hero. Refers to the 8 customer-facing agents. Don't change without explicit owner approval.

---

## 8. Auth Flow (OTP — Magic Links Removed)

### 8.1 Configuration in Supabase Dashboard
- **Site URL:** `https://app.spikeai.co.il`
- **Redirect URLs:** `https://app.spikeai.co.il/auth/callback` + `http://localhost:3000/auth/callback`
- **Email OTP length:** 6 digits

### 8.2 Two Templates Both Configured
Both must be configured with the same code-only template in Supabase Dashboard → Authentication → Email Templates:
1. **Magic Link** — for existing users
2. **Confirm signup** — for new users (this was the gotcha — easy to forget)

Template body uses `{{ .Token }}` (the 6-digit code). The `{{ .ConfirmationURL }}` link is **not** included in the user-facing email anymore (see §8.4).

### 8.3 Verification Code in `actions.ts`

Use **only `type: "email"`** — this is critical:

```typescript
const { error } = await supabase.auth.verifyOtp({
  email: cleanEmail,
  token: cleanToken,
  type: "email",  // The only non-deprecated type for email OTP
});
```

**Do NOT add fallback to `magiclink` or `signup` types.** Those are deprecated in Supabase 2024+. A previous fallback chain (commit `39c4d27`) was removed in `208ea50` because it added complexity without value.

### 8.4 The Bug That Took a Day to Diagnose

**Symptom:** User receives 6-digit code, types it correctly, gets "code expired" — even with a fresh code.

**Real cause:** Mismatch between Supabase OTP code length (was 8 digits in one template) and the form input (`maxLength={6}`). Form silently truncated to 6 → server received 6 digits that were not the real token → "expired".

**False leads we wasted time on:**
- Resend click tracking (wasn't enabled)
- Email scanner prefetching (didn't apply once link was removed)
- `verifyOtp` type fallback chain — symptomatic patch, not root cause

**Fix:** Both Supabase email templates set to 6-digit OTP, single `type: "email"` call.

**If a similar bug returns:** check Supabase Dashboard → Auth → Providers → Email → "Email OTP length" first. Both templates.

### 8.5 The Login UI (After 2026-05-02 Cleanup)
The login UI is OTP-only. All copy says **"קוד אימות"**, never "קישור". The internal function names `sendMagicLink` / `handleSendLink` remain for backward compat — they send the OTP code via the same Supabase API. Don't rename without refactoring `actions.ts`.

---

## 9. Mobile UX (commit `91731e4`)

### 9.1 Architecture
- **Desktop (≥768px / `md:`):** Sidebar fixed-right at 232px. Main content has `md:mr-[232px]`.
- **Mobile (<768px):** Sidebar disappears (`md:hidden`). Replaced by 3 components:

| Component | Position | Purpose |
|-----------|----------|---------|
| `MobileHeader` | sticky top, 52px | logo + business name + notifications + hamburger |
| `MobileDrawer` | side-right (RTL) | full nav + profile, opens via hamburger. Backdrop blur + ESC-to-close + body scroll lock |
| `BottomNav` | fixed bottom, ~56px + safe-area-inset | 4 tabs: סקירה / אישורים / סוכנים / דוחות |

### 9.2 Adaptive Components
- `KpiStrip` — `snap-x snap-mandatory` horizontal scroll on mobile, `sm:grid sm:grid-cols-3` on desktop
- `WhatsAppFab` — `bottom-[78px] sm:bottom-[22px]`. The 78px is exactly above `BottomNav` height + safe-area-inset
- `LoginPage` — desktop has Mascot `laptop` (360px) on the left as hero; mobile has Mascot `phone-right` (140px) compact above the form

### 9.3 Don't Break These Patterns
- Don't use `lg:` instead of `md:` — the breakpoint is consistently 768px
- Don't propose a separate `/mobile` route — adaptive in-place is the pattern
- Don't make a "PWA" or "standalone app" — see §13 anti-patterns

---

## 10. Current Status (May 2026)

### 10.1 What Works ✅
- All 8 customer-facing agents on real DB events (Day 18)
- Cleanup agent on cron (housekeeping confirmed)
- Login (OTP code-only, both templates configured)
- Onboarding (4 fields: first name, business name, vertical, gender)
- Dashboard with 3 agent categories + KPI strip
- Mascot integration (login desktop, onboarding, approvals empty state, login mobile)
- Mobile UX (drawer + bottom nav + adaptive)
- Approvals page
- Inventory page (CSV upload)
- Leads page
- Manager page
- Draft approve / reject
- `requireOnboarded` guard
- Modal portal fix (Morning + Watcher escape Glass card stacking)
- Real KPIs from DB (Day 17 fix #2 — was hardcoded)
- Social skips Saturday (Day 17 fix #5)
- Draft expiry policy (Day 17 fix #6)
- Full safety pipeline: PII scrub + defamation guard + gender lock + injection guard

### 10.2 Pending — Not Blocking 🚧
- **7 sidebar pages still 404:** הסוכנים שלי, דוחות, התראות, מרכז בקרה, אמון ופרטיות, הגדרות, מרכז ניהול
  - הגדרות is the easiest (reuses onboarding form components)
  - מרכז ניהול is admin-only (likely uses `src/lib/admin/queries.ts`)
- Watcher prompt fix — invents names instead of quoting source events (15-min fix)
- Hot Leads idempotency — multiple runs create duplicates (not blocking due to 72h `expires_at`)
- `actions.ts` is 1430 lines — split into `actions/inventory.ts`, `actions/sales.ts`, etc.
- Race condition: `inventory-upload-zone` + `run-inventory-button`. Aria-live missing.
- Cleanup agent's exact location undocumented (not in `lib/agents/cleanup/` — verify on next touch)

### 10.3 Pending — Critical 🔴
- **First real customer integration** — WhatsApp Business API / website form / Google Reviews scraper. Until this, agents run on seed data only.

---

## 11. Auth & Configuration Reference

### 11.1 Required Env Vars (Vercel + .env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://ihzahyzejqpjxwouxuhj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...           # admin client only
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
```

### 11.2 Resend Configuration
- Sender domain: `auth.spikeai.co.il` (verified)
- Click tracking: **OFF** (was never on; worth confirming if OTP issues return)

---

## 12. Strategic Roadmap

### 12.1 Pricing Tiers (Decided)
| Tier | Price/mo | Setup fee | Target |
|------|----------|-----------|--------|
| Solo | ₪290 | ₪990 | עוסק יחיד / cosmetician / single-chair barber |
| Pro | ₪690 | ₪990 | small business with employees, multi-channel |
| Chain | ₪1,490 | ₪990 | 3-15 locations, HQ + branches |

- 14-day trial. **No freemium.**
- 17% annual discount.
- Add-on: auto-send credits at Premium only — preserves the Iron Rule (auto-send is template-driven, not AI-decided).

### 12.2 Next 30 Days — Top 3 Priorities
1. **WhatsApp Business API integration** for Hot Leads + Sales (~2 weeks). Critical.
2. **Trust Agent v0.5** — תיקון 13 Privacy Notice generator + DPO checklist (~10 days). Killer differentiator.
3. **Cash Flow / Collections Agent v0.5** + GreenInvoice integration (~2 weeks). Highest pain point in Israeli SMBs.

### 12.3 90 Days
- VAT / Tax Compliance (חשבונית ישראל, January 2025 rules)
- Win-Back / Loyalty (lapsed customer detection — 30א compliant)
- Vision capabilities for Reviews (image attachments)
- Voice profile per tenant (tone-of-voice matrix)
- Self-serve onboarding

### 12.4 6 Months
- Chain HQ Agent (per-branch briefs from global data)
- AI Receptionist in Hebrew (via Voicenter integration)
- Mobile PWA (not standalone app)
- Marketplace integrations (GreenInvoice, iCount, Salesforce SMB-IL)

### 12.5 Tier Mapping for Next Agents
- **Trust** → **Solo** (every business needs תיקון 13 compliance)
- **Cash Flow** → **Pro** (requires GreenInvoice integration)
- **VAT** → **Pro** (most sole proprietors have an accountant)
- **Chain HQ** → **Chain** (obvious)
- **Win-Back** → **Pro** (needs CRM-like data depth)

---

## 13. What NOT to Build (Even If It Looks Smart)

These were considered and rejected. Don't propose them — even disguised in new framing.

| Idea | Why not |
|------|---------|
| **NPS / CSAT surveys** | Commodity. vcita / Birdeye / Podium do it. No differentiation. |
| **Schedule optimization for staff** | Israeli labor law (rest hours, overtime, vacation) is lawyer territory. Legal risk. |
| **Contract review** | Risk of "legal advice" liability. |
| **Competitor scraping (Google / Yelp)** | TOS violation. Legal risk. |
| **Senior Manager Agent** (AI flagging other AIs) | AI flagging AI = bias amplification. Better: monitoring + logs + evals. |
| **Crypto / Web3 / Blockchain** | Not relevant to ICP. |
| **Standalone mobile app** | Not before 100 paying customers. PWA is enough. |
| **Open-source release** | Distraction from revenue. |
| **OpenAI / Gemini integration** | Violates Iron Rule 1.3. |
| **Email-as-product (newsletter agent)** | Mailchimp / ActiveCampaign exist. Not a wedge. |
| **Calendar booking agent** | Calendly / vcita own this. Won war. |
| **Generic chatbot widget** | That's the "בוט" we don't sell. |

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
| **vcita** | Brand, 850K SMBs, just launched English AI Receptionist | We're Hebrew-native; they bolt on |
| **HubSpot Breeze** | Outcome-based pricing ($0.50/conversation), strong CRM | Israeli regulation built in; cheaper for SMBs |
| **Salesforce Agentforce SMB** | Enterprise pedigree | They don't speak Hebrew; their SMB tier is still expensive |
| **Toast IQ / GlossGenius** | Vertical-specific | We span verticals; they're US-centric |
| **Birdeye / Podium** | Reviews + messaging | We do drafts only; they autosend (compliance risk in IL) |
| **Wix.AI Smart Manager** | Wix install base | **Underestimated — could disintermediate. Watch closely.** |
| **Lindy AI** | Multi-agent orchestration | English-first, no IL regulation context |

### 14.3 Hidden Opportunities
- **vcita inTandem partnership** — they OEM. Could be our distribution.
- **Voicenter voice channel** — Hebrew TTS/STT pipeline. Skip OpenAI Whisper.
- **B2B2B for Israeli franchises** — Roladin, Aroma, Cofizz, Re/Max. Sell HQ once, deploy to 50+ branches.

---

## 15. Common Pitfalls for Future Claude

### 15.1 Don't Do These — Each Has Bitten Us
- ❌ Use the word "בוט". Use "סוכן AI" or "סוכן".
- ❌ Suggest auto-send "just for transactional" without explicit owner pre-approval flow.
- ❌ Propose adding `i18next` / English version. Hebrew is the moat.
- ❌ Suggest "for this case OpenAI is cheaper" — Anthropic-only is strategic.
- ❌ Propose adding analytics SaaS (Mixpanel, Amplitude, Posthog cloud) without checking. Bootstrap mode.
- ❌ Ask Dean to manually edit a 1430-line file. Generate the full file.
- ❌ Output emojis in production UI strings (sometimes OK in dev logs, never customer-facing).
- ❌ Tell Dean to take a break. He sets his own pace.
- ❌ Hallucinate names from `events.payload` (Watcher's known bug — be vigilant).
- ❌ Build a feature without `expires_at` if it lives in `drafts`.
- ❌ Skip the safety pipeline "just for this prototype". Use `runAgentSafe`, never raw Anthropic.
- ❌ Propose a "senior agent that monitors other agents". Already rejected.
- ❌ Suggest pivoting to en-US / global SaaS. The bet is Israel.
- ❌ Try to "complete" `src/lib/agents/cleanup/` with a stub folder. Cleanup is intentionally implemented elsewhere.
- ❌ Treat the `9 agents` mentions in source comments as a typo. They're intentional — 8 customer-facing + 1 internal.

### 15.2 When Claude Searches the Web
- Repository: `https://github.com/DinSpikeAI/spike-agents-engine` (public)
- `web_fetch` cannot read GitHub `tree/` or `commits/` pages — disallowed by GitHub robots.txt. Use `git log` outputs the user provides.
- Treat source files Dean pastes as ground truth, not the GitHub web view.

### 15.3 When Generating Code
- Always read the **full file** before editing (request a paste from Dean if needed).
- Always produce the **full file** as output.
- Always run a self-diff check after generating: confirm requested changes are present, **and only those**.
- Comment runtime-affecting changes in the commit message. Cosmetic-only changes (text/labels) need a one-line commit.

### 15.4 When Estimating Time
- Be honest. "10 minutes" should mean 10 minutes. If "2 hours of careful work", say that.
- Dean knows when an estimate is fake.

---

## 16. Commit Conventions

- **Conventional commits** with English subject, Hebrew body allowed.
- Format: `<type>(<scope>): <subject>`
  - `feat(reviews): add gender lock to safety pipeline`
  - `fix(auth): use only 'email' type for verifyOtp`
  - `chore(deps): bump @anthropic-ai/sdk`
- Scopes in use: `auth`, `mobile`, `design`, `morning`, `watcher`, `reviews`, `hot_leads`, `social`, `sales`, `inventory`, `manager`, `cleanup`, `approvals`, `onboarding`, `ui`, `db`, `safety` (covers PII scrubber, defamation, gender lock, injection guard).

---

## 17. Onboarding a New Claude Conversation

If you are Claude reading this for the first time in a new conversation:

1. ✅ Read this file completely. Then re-read §1 and §2.
2. ❌ Do not re-ask Dean to summarize the project. He's done it many times.
3. ❌ Do not suggest building anything from §13 ("What NOT to Build").
4. ✅ Ask Dean: "מה הצעד הבא?" if he hasn't said.
5. ✅ Push back if a request seems to violate §1.
6. ✅ Confirm you've read this file in your first reply, in 2-3 lines max.

**Sample first reply:**
> קראתי את CLAUDE.md. מבין שאנחנו ב-Spike Engine, 8 סוכני AI מול לקוח + cleanup פנימי, drafts-only, עברית-RTL, safety pipeline מלא, bootstrap mode. הצעד הבא הקריטי הוא אינטגרציית WhatsApp Business API. מה אתה רוצה לעשות עכשיו?

---

## 18. Appendix — References

### 18.1 Migration History (18 files numbered 001–019)
- `001_reset.sql` · `002_schema.sql` · `003_rls.sql` — initial schema, RLS, auth scaffolding
- `016_seed_watcher_events.sql` — 15 Watcher seed events
- `017_seed_review_events.sql` — 4 Reviews seed
- `018_seed_lead_events.sql` — 5 diverse leads
- `019_onboarding_columns.sql` — onboarding fields on `tenants`

(One number is skipped between 003 and 016 — historical artifact, not a missing file.)

### 18.2 Selected Commits
| Hash | What |
|------|------|
| `583d686` | Day 18 Inventory UI — 8 agent cards + Inventory page |
| `703f7db` | Watcher real DB events |
| `1c825df` | Reviews real DB + safety pipeline |
| `ee4ef09` | Hot Leads real DB |
| `43f75a9` | Morning real DB context |
| `f20c5c2` | Modal portal fix |
| `6b56ef3` | Onboarding flow |
| `d823c40` | requireOnboarded guard |
| `dac7eb9` | Phase 1+2 design (categories, mascot) |
| `eb644d5` | Suspense wrapper for Next.js 16 build |
| `91731e4` | Mobile hi-tech UX (drawer, bottom nav, adaptive) |
| `39c4d27` | OTP fallback chain (later removed) |
| `208ea50` | OTP fallback removed — `type: "email"` only |

### 18.3 External Links
- Repo: https://github.com/DinSpikeAI/spike-agents-engine
- Production: https://app.spikeai.co.il
- Supabase project: ref `ihzahyzejqpjxwouxuhj`

---

**End of CLAUDE.md.**

If something here is wrong or outdated, the priority is to update **this file first**, then the code. This file is a load-bearing document.
