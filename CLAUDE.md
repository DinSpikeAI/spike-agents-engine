# CLAUDE.md — Spike Engine Briefing

> **For Claude (the AI coding assistant) reading this:** This file is your briefing. Read it in full before responding to the user. Do not ask the user to re-explain the project. When this file conflicts with your training data, **this file wins**.
>
> **Last updated:** 2026-05-04 (end of Sub-stage 1.10 — Alerts page). Stage 1 COMPLETE. Sub-stages 1.6, 1.7, 1.8, 1.9, 1.10 also complete and live in production. Onboarding banner + showcase rename + tenant settings page + agents overview page + actions.ts split into 7 files + alerts/notifications inbox. Verified Hebrew output. ~15-16s end-to-end latency, ~₪0.04 per hot lead.

---

## 0. TL;DR

- **What:** Multi-tenant SaaS in Hebrew RTL for Israeli SMBs (salons, restaurants, clinics, retail, 3-15 location chains). 8 customer-facing AI agents draft proposals; the business owner approves before anything sends. A 9th internal agent (`cleanup`) does housekeeping — never visible to the user. All 9 are implemented and live in production.
- **Founder / sole dev:** Dean Moshe (`din6915@gmail.com`). Bootstrap mode. Hebrew speaker.
- **The Iron Rule above all others:** "AI מסמן, בעלים מחליט" — AI flags, owner decides. Drafts only. Never auto-send.
- **Marketing tagline:** "שמונה סוכנים. שקט אחד." ("Eight agents. One quiet.") — refers to the 8 customer-facing agents.
- **Stack:** Next.js 16.2.4 (Turbopack) + React 19.2.4 + Tailwind v4 + TypeScript · Supabase (Frankfurt) · `@anthropic-ai/sdk@0.91.1` (Sonnet 4.6 + Haiku 4.5) · Resend · Vercel · `@vercel/functions@3.5.0` for waitUntil background tasks.
- **Repo (engine):** https://github.com/DinSpikeAI/spike-agents-engine
- **Repo (landing):** https://github.com/DinSpikeAI/spike-agents — separate marketing site (Next.js 16, Tailwind v4, RTL, Web3Forms). Don't confuse the two.
- **Local dev:** `C:\Users\Din\Desktop\spike-engine`
- **Domain:** `app.spikeai.co.il` (production) · `localhost:3000` (dev).
- **State (May 2026):** Stage 1 COMPLETE. Full WhatsApp pipeline: webhook → events → Watcher + Hot Leads (parallel, withRetry) → if hot/burning, Sales QR cascade → Hebrew draft. All 5 prompts pass anti-AI sweep. PII scrubber covers all Israeli phone formats. Cleanup cron + recovery cron run daily. **Post-Stage-1 polish (1.6-1.10) also complete:** onboarding banner shows for new tenants with 0 non-mock runs; tenant settings page lets owners edit core fields; agents overview page shows per-agent activity stats; `src/app/dashboard/actions.ts` refactored from 1430-line monolith into 7 focused files under `actions/`; **alerts/notifications inbox page at `/dashboard/alerts` with 4-tab filtering and click-to-read**. Verified live in production. Pre-launch — no real customers yet.
- **Don't propose:** NPS surveys · schedule optimization for staff · contract review · crypto/Web3 · "senior manager of agents" · OpenAI fallback · standalone mobile app · 360dialog or other BSP middlemen · merging the split actions/ files back into one.
- **Next up (Stage 2):** Meta Business verification + Embedded Signup UI + production WhatsApp templates. See §12.3.

---

## 1. Iron Rules (Non-Negotiable)

### 1.1 "AI מסמן, בעלים מחליט"
- Every customer-facing agent action produces a `drafts` row.
- Owner approves drafts via `/dashboard/approvals` before anything sends.
- Auto-send forbidden — even with the user's permission in chat.
- Cleanup agent: never notifies, never creates drafts, never appears in user UI.

### 1.2 The Word "בוט" Is Forbidden
Use "סוכן AI" or "סוכן". Applies everywhere.

### 1.3 Anthropic Only
All LLM calls through `@anthropic-ai/sdk` via `src/lib/anthropic.ts` (server-only). No OpenAI, Gemini, Cohere, Mistral, local models. Strategic.

### 1.4 Hebrew RTL Only
All user-facing UI: `dir="rtl"` and Hebrew. English only in: code, commits, comments, internal logs, this file. No `i18n` abstraction.

### 1.5 Safety Pipeline Before LLM
Full pipeline at `src/lib/safety/`. Every customer-facing agent's untrusted input passes through it before reaching Anthropic. Enforced by `run-agent-safe.ts`.

| Module | Purpose |
|---|---|
| `pii-scrubber.ts` | Phones (all IL formats), emails, IDs (8-9 digits), credit cards, IBAN. תיקון 13. |
| `defamation-guard.ts` | לשון הרע detection for review responses. |
| `gender-lock.ts` | Hebrew זכר/נקבה agreement. |
| `prompt-injection-guard.ts` | `detectInjectionAttempt()` against untrusted text. |
| `anti-ai-strip.ts` | Strips em-dash, en-dash, inline hashtags from LLM output. |

### 1.6 Israeli Regulation Built In
- סעיף 30א anti-spam: no marketing without prior opt-in
- לשון הרע: handled in Reviews safety pipeline
- תיקון 13 privacy: handled by PII scrubber (IL phone formats audited 1.5.5)

### 1.7 Drafts Have Expiry
Default 72h. Sales follow-up + Sales QuickResponse: 24h. Cleanup cron (1.5.4) enforces — runs daily at `0 0 * * *` UTC and sets `status='expired'` on any pending drafts past `expires_at`.

### 1.8 Gender Lock Mandatory in Hebrew Output
Tenants have `business_owner_gender`. Used by Sales (both entry points); Reviews/Social/Manager pending future polish. **As of 1.7, owners can edit `business_owner_gender` themselves via `/dashboard/settings`.**

### 1.9 Anti-AI-Signature Hygiene (1.3 + 1.3.5 + 1.5.1 hotfix + 1.5.3 sweep)

**Forbidden punctuation:**
- em-dash (—) — strongest AI tell. Replace with period/comma/hyphen.
- en-dash (–) mid-sentence
- hashtags (#) entirely
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
- Openings like "מחפש/ת..." or "אני יודע ש..." or "במציאות של היום"

**Israeli-specific tone (1.3.5 + 1.5.3):**
- Empathy on complaints, brevity on info requests
- Use display_name from WhatsApp profile
- Don't refer customers to competitors — leave the door open
- "Persistent" aggressiveness: "אני פנוי עכשיו, אפשר להרים אליך צלצול?" (NOT "אתקשר בעוד 10 דקות")
- Israeli-natural Hebrew, not translated marketing — "אפשר פשוט לשאול" not "המוצר המהפכני"

**Implementation status (POST 1.5.3):**
- ✅ All 8 customer-facing agents have anti-AI prompt rules
- ✅ Defense-in-depth post-processing on Morning, Reviews, Social, Manager, Inventory (1.5.1 hotfix), Watcher (1.5.3), Hot Leads (1.5.3)
- ✅ Sales QR + Sales — prompt-level rules from 1.3.5 are comprehensive enough
- ✅ Israeli-tone calibration on Reviews + Social
- ✅ Verified live in production (2026-05-03 — em-dashes and hashtags eliminated from Social/Morning output)

### 1.10 Server Actions Architecture (1.9)
The `src/app/dashboard/actions.ts` file is a **re-export shim only**. Implementation lives in 7 focused files under `src/app/dashboard/actions/`.

- **DO:** Add new server actions to the appropriate file in `actions/` and re-export from `actions.ts`
- **DO:** Update header comments when adding new exports
- **DO NOT:** Add server action implementations directly to `actions.ts`
- **DO NOT:** Merge the split files back into one — the 1430-line monolith was a maintenance liability for a reason
- **DO NOT:** Add `"use server"` to `actions/_shared.ts` — it exports helpers, not server actions

See §10.23 for the full split structure.

**Page-specific server actions:** New pages (settings 1.7, alerts 1.10) get their OWN `actions.ts` co-located with the page (e.g. `src/app/dashboard/alerts/actions.ts`). They import shared helpers from `@/app/dashboard/actions/_shared` but don't go through the top-level re-export shim. This keeps page-scoped logic close to the page.

---

## 2. Working with Dean

### 2.1 Communication
Hebrew in chat. English in code/commits/comments. Brevity preferred.

### 2.2 Brutal Honesty
- Bad idea → say it. Plan flaw → point it out before executing. "I don't know" preferred over confident guess.
- Push back when proposals contradict CLAUDE.md.
- Never write "Dean provided X" without verification.

### 2.3 PowerShell File Workflow
1. Generate full file in `/mnt/user-data/outputs/`
2. `present_files`
3. Dean downloads to `~/Downloads/`
4. `Move-Item -Force "$HOME\Downloads\file.tsx" "src\..."` from `C:\Users\Din\Desktop\spike-engine`
5. `npx tsc --noEmit`
6. If clean: `git add -A && git commit -m "..." && git push && vercel --prod` (if Vercel webhook isn't auto-deploying — see §15.8)

Always full file. When 2 files share the same name, use distinct names in `/outputs/` and rename in Move-Item.

**Browser download gotcha:** Sometimes Edge silently saves a 0-byte file from `present_files`. Always verify with `Get-Item "$HOME\Downloads\file" | Select-Object Length` if a Move-Item fails. If 0 bytes, re-download.

**file-tree generation gotcha:** When asked for a file tree, generate it to `$HOME\Downloads` or `$env:TEMP`, not in repo root.

**Commit/push/deploy in one message (session 6 rule):** When tsc passes, send commit + push + deploy commands in the SAME message — don't split across two turns. Dean explicitly requested this mid-session 6.

### 2.4 Don't Relitigate Settled Decisions
- 9 agents stay 9 (8 customer-facing + 1 cleanup)
- Hebrew RTL permanent
- Drafts-only permanent
- Anthropic-only permanent
- Pricing: Solo ₪290 / Pro ₪690 / Chain ₪1,490 + ₪990 setup. NO freemium.
- Meta Cloud API direct (not BSPs).
- **`actions.ts` split (1.9) permanent — don't merge back.**
- See §13 "What NOT to Build"

### 2.5 Three Options + Recommendation
For decisions: 3 concrete options + trade-offs + Claude's recommendation.

### 2.6 Don't Be a Therapist
- Don't ask if Dean is tired. Don't suggest he sleep.
- Exception: clean sub-stage boundaries fine to offer "continue or pause".
- Don't say "good night" if it's 7am.
- **NEW (session 6):** Don't tell Dean to rest, sleep, take a break, or say "good night/good morning" at any time. Dean explicitly forbade this mid-session 6.

### 2.7 Bootstrap Mode
- Only paid expense: Anthropic API
- WhatsApp Business API direct = $0/month (vs €49/mo BSP)
- Cost per inbound HOT WhatsApp message: ~₪0.04. Cold/warm: ~₪0.027
- 100 msg/day with 30% hot rate: ~₪95/month, ~28% margin on Solo
- **Anthropic credits state (2026-05-04):** Console balance ~$4.20, auto-reload disabled. Top up before first prospect demo.
- Dean has Claude Max ($100/mo) subscription — includes Claude Code.

### 2.8 Verify Before Documenting
**Always check schema before INSERTs:**
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = '<table>' AND table_schema = 'public';
```

After migrations: `NOTIFY pgrst, 'reload schema';`

Verification applies to Claude's own claims too. Never write "Dean said X" without grep'ing transcript.

### 2.9 Known Display Bug
Claude.ai sometimes wraps `INTEGRATION-NOTES.md`, `CLAUDE.md`, and `localhost` as malformed links in console output. The files themselves are fine — only rendering is wrong. **Verify with `.ToCharArray()` if console output looks wrong but real filesystem is OK.** Type names manually if PowerShell command fails to parse.

### 2.10 PowerShell Gotchas
- Tee-Object does NOT block. Always 2 separate windows for dev + commands.
- Add-Content does NOT add newline. Breaks `.env.local`. Use notepad or prepend `` `n ``.
- Verify env after appending: `Get-Content .env.local | Select-String "<KEY>"`.
- Stale .next cache: tsc errors `routes.d.ts is not a module` → stop dev, `Remove-Item -Recurse -Force .next`, restart dev.
- Turbopack SST file errors: same fix.
- `git show` falls into less pager on Windows: Use `git --no-pager show HEAD:vercel.json` or press `q`.
- LF/CRLF normalization warnings on `git add -A` are usually harmless.
- Select-String fails on UTF-8 Hebrew from git stdout: redirect to file + open in notepad.
- **Vercel deploy ECONNRESET (session 6):** sometimes `vercel --prod` fails with `ECONNRESET` mid-deploy due to flaky local network. Usually the deployment **succeeded** server-side anyway (Vercel got the upload before the disconnect). Verify by visiting production URL or running `vercel --prod` again — second run is fast and idempotent.

### 2.11 Sub-stage Iteration Rhythm
- 5-15 min plan + verification ask
- 30-60 min code + self-audit
- 5-15 min Move-Item + tsc + manual test
- 5 min commit + push + vercel --prod
- **Total: ~1-2.5 hours typical.** Mechanical sweeps (1.5.1, 1.5.5) ~30-45 min. UI features (1.4, 1.7, 1.8, 1.10) ~1-1.5h with proper §2.12 prep. **Refactor (1.9) ~2 hours** including smoke test in production.

### 2.12 Design Tokens & Patterns First (1.4 lesson)

**Before any new UI code, read:**
1. `src/app/globals.css` — Calm Frosted tokens
2. At least one existing styled component (e.g., `kpi-strip.tsx`, agent grid in `src/app/dashboard/page.tsx`)

**Mandatory.** 1.4 took 4 design attempts because Claude designed before reading globals.css.

**The pattern Spike uses:**
- `<Glass>` + `<Glass deep>` from `@/components/ui/glass` are card primitives
- `<AppleBg>` from `@/components/ui/apple-bg` is page background
- Colors via CSS variables in inline `style={{}}` — NOT Tailwind classes like `bg-rose-500`
- Typography in arbitrary pixels: `text-[15.5px]`, `text-[12.5px]`, `tracking-[-0.025em]`

### 2.13 Refactor Strategy (1.9 lesson)
**For any structural refactor of a multi-import file:**

1. **Re-export pattern** is safer than migrating imports. The 1430-line `actions.ts` was split into 7 files via re-exports — 15+ Client Components didn't need any changes.
2. **Three commits, not one:** (A) Refactor with no behavior change → (B) Smoke test in production → (C) Docs update. Each commit is small and reversible.
3. **Header comments are mandatory** for every new file. They explain scope + exports + cross-references. Without them, a refactor is "works" but not "maintainable".
4. **Smoke test in production is non-negotiable** — tsc passes ≠ runtime works. Click every button, verify every loader, screenshot the proof.

---

## 3. Tech Stack

### 3.1 Frontend
- Next.js 16.2.4 with Turbopack
- React 19.2.4
- Tailwind v4 with PostCSS
- TypeScript 5.x strict
- shadcn/ui (used sparingly), lucide-react, sonner

### 3.2 Backend / DB
- Supabase project ref `ihzahyzejqpjxwouxuhj`, Frankfurt
- 3 clients in `src/lib/supabase/`: server.ts, client.ts, admin.ts

### 3.3 LLM
- `@anthropic-ai/sdk@0.91.1` via singleton `src/lib/anthropic.ts` (server-only)
- Cost tracking in `src/lib/anthropic-pricing.ts` → `cost_ledger`
- Retry: `src/lib/with-retry.ts` wraps all 8 customer-facing agents
- Anti-AI: `src/lib/safety/anti-ai-strip.ts` strips em-dash, en-dash, hashtags

### 3.4 Email & Auth
Resend, Supabase OTP

### 3.5 Background Tasks
- `@vercel/functions@3.5.0` for `waitUntil()`
- **Vercel Cron (7 jobs in `vercel.json`, all daily-or-less for Hobby tier):**
  - `/api/cron/reset-monthly-spend` (1 0 1 * *) — monthly
  - `/api/cron/social` (30 5 * * 0-4)
  - `/api/cron/sales` (30 7 * * 0-4)
  - `/api/cron/inventory` (30 5 * * 0,3)
  - `/api/cron/watcher` (0 6 * * *) — daily on Hobby; restore to hourly on Pro
  - `/api/cron/cleanup` (0 0 * * *) — 1.5.4
  - `/api/cron/hot-leads-sales-recovery` (0 2 * * *) — 1.5.2

### 3.6 Hosting
- Vercel auto-deploys from `main` (when not blocked — see §15.8)
- CLI fallback: `vercel --prod` from local when webhook fails.

---

## 4. Repository Layout

```
spike-engine/
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── auth/callback/route.ts
│   │   ├── onboarding/
│   │   ├── admin/
│   │   ├── dashboard/
│   │   │   ├── page.tsx                       # ⚠️ Read for UI patterns. 1.6: OnboardingBanner integrated
│   │   │   ├── approvals/page.tsx
│   │   │   ├── inventory/page.tsx
│   │   │   ├── leads/page.tsx
│   │   │   ├── manager/page.tsx
│   │   │   ├── showcase/                      # 1.6 (renamed from /demo). Public, all onboarded users
│   │   │   │   ├── page.tsx
│   │   │   │   └── actions.ts                 # 1.6: restored from git history at 69d066c
│   │   │   ├── settings/                      # 1.7 — tenant settings page
│   │   │   │   ├── page.tsx
│   │   │   │   └── actions.ts                 # updateTenantSettings server action
│   │   │   ├── agents/                        # 1.8 — agents overview page
│   │   │   │   └── page.tsx
│   │   │   ├── alerts/                        # 1.10 — notifications inbox
│   │   │   │   ├── page.tsx
│   │   │   │   └── actions.ts                 # listNotifications, markRead, markAllRead
│   │   │   ├── actions.ts                     # 1.9 REFACTOR: 81 lines, re-exports only
│   │   │   └── actions/                       # 1.9 NEW: split implementations
│   │   │       ├── _shared.ts                 # helpers: getActiveTenant + checkAgentRateLimit (no "use server")
│   │   │       ├── manager.ts                 # weekly-lock state machine + 3 server actions
│   │   │       ├── agent-triggers.ts          # 7 trigger* functions + 3 internal loaders
│   │   │       ├── drafts.ts                  # listPendingDrafts/approveDraft/rejectDraft
│   │   │       ├── leads.ts                   # listClassifiedLeads/markLeadContacted/dismissLead
│   │   │       ├── reports-kpis.ts            # listManagerReports + getDashboardKpis
│   │   │       └── inventory.ts               # uploadInventoryCsv + 2 query functions
│   │   ├── api/
│   │   │   ├── webhooks/whatsapp/route.ts
│   │   │   ├── cron/
│   │   │   │   ├── inventory/route.ts
│   │   │   │   ├── reset-monthly-spend/route.ts
│   │   │   │   ├── sales/route.ts
│   │   │   │   ├── social/route.ts
│   │   │   │   ├── watcher/route.ts                        # 1.2
│   │   │   │   ├── cleanup/route.ts                        # 1.5.4
│   │   │   │   └── hot-leads-sales-recovery/route.ts       # 1.5.2
│   │   │   └── demo/status/route.ts                        # 1.4
│   │   ├── globals.css                        # ⚠️ READ FIRST for UI
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/
│   │   │   ├── glass.tsx                      # ⚠️ THE primitive
│   │   │   ├── apple-bg.tsx                   # ⚠️ THE page bg
│   │   │   ├── mascot.tsx
│   │   │   └── ... shadcn primitives
│   │   ├── admin/
│   │   ├── dashboard/
│   │   │   ├── sidebar.tsx                    # 1.6: Showcase added to NAV_ITEMS, admin gate removed
│   │   │   ├── mobile-drawer.tsx              # 1.6: same as sidebar
│   │   │   ├── onboarding-banner.tsx          # 1.6
│   │   │   ├── settings-form.tsx              # 1.7
│   │   │   ├── agent-overview-card.tsx        # 1.8
│   │   │   ├── alerts-list.tsx                # 1.10
│   │   │   └── ... (other dashboard components)
│   │   ├── demo/                              # NB: still named /demo even though page is /showcase. Internal-only naming.
│   │   │   ├── demo-panel.tsx                 # 1.6: import path updated to /showcase/actions
│   │   │   └── pipeline-status.tsx
│   │   └── providers/
│   └── lib/
│       ├── anthropic.ts
│       ├── anthropic-pricing.ts
│       ├── with-retry.ts                      # 1.3 → wraps all 8 agents
│       ├── supabase/
│       ├── auth/
│       │   ├── require-onboarded.ts           # → { userId, userEmail, tenantId }
│       │   └── onboarding-status.ts           # 1.6: getOnboardingStatus(tenantId)
│       ├── safety/
│       │   ├── pii-scrubber.ts                # 1.5.5: IL phone formats audited
│       │   ├── defamation-guard.ts
│       │   ├── gender-lock.ts
│       │   ├── prompt-injection-guard.ts
│       │   └── anti-ai-strip.ts               # 1.5.1 hotfix
│       ├── admin/
│       ├── health/
│       ├── quotas/
│       ├── webhooks/whatsapp/
│       ├── demo/types.ts
│       └── agents/
│           ├── types.ts
│           ├── config.ts                      # AGENTS{} record + AGENT_LIST[]
│           ├── overview.ts                    # 1.8: getAgentsOverview(tenantId)
│           ├── run-agent.ts
│           ├── run-agent-safe.ts
│           ├── morning/                       # 1.5.3 anti-AI
│           ├── watcher/                       # + INTEGRATION-NOTES.md (1.5.5 updated)
│           ├── reviews/                       # 1.5.3 anti-AI + Israeli-tone
│           ├── hot_leads/                     # 1.3.5 cascade + 1.5.3 post-processing
│           ├── social/                        # 1.5.3 anti-AI + hashtags removed
│           ├── sales/                         # ⚠️ TWO entry points — see §6.8
│           ├── manager/                       # 1.5.3 anti-AI
│           └── inventory/                     # 1.5.3 anti-AI
├── supabase/migrations/                       # 21 files. Latest: 021.
├── tests/fixtures/
├── public/mascot/
├── proxy.ts
├── vercel.json                                # 7 cron entries
├── CLAUDE.md
├── AGENTS.md
└── package.json
```

---

## 5. Database Schema

### 5.1 events Table

| Column | Type | NOT NULL | Default |
|---|---|---|---|
| `id` | text | YES | (none — must be supplied) |
| `tenant_id` | uuid | NO | null |
| `provider` | text | NO | null |
| `event_type` | text | NO | null |
| `payload` | jsonb | NO | null |
| `received_at` | timestamptz | NO | now() |

`id` is text PK supplied by caller — natural idempotency key. For webhooks: `wamid.HBgL...`.

### 5.2 hot_leads Table
19 cols. Key columns: `id`, `tenant_id`, `agent_run_id`, `source`, `source_handle`, `display_name`, `raw_message` (PII), `received_at`, `score_features` (jsonb), `bucket`, `reason`, `suggested_action`, `status` (default 'classified'), `event_id` text (1.3 idempotency).

Idempotency: partial UNIQUE `idx_hot_leads_tenant_event_id` on `(tenant_id, event_id) WHERE event_id IS NOT NULL`.

Bucket values: `cold` · `warm` · `hot` · `burning` · `spam_or_unclear`. Sales QR cascade triggers on `hot` and `burning` only.

### 5.3 drafts Table
Sales writes two distinct draft types:

| draft.type | Created by | When | TTL |
|---|---|---|---|
| `sales_followup` | `runSalesAgent` (cron) | Stuck leads (3+ days) | 24h |
| `sales_quick_response` | `runSalesQuickResponseOnEvent` (webhook cascade) | Fresh hot/burning | 24h |

Status values: `pending`, `rejected`, `expired` (1.5.4 — migration 021 idempotently adds it).

### 5.4 Other Core Tables
`tenants`, `user_settings`, `memberships`, `agents`, `agent_prompts`, `tenant_agents`, `agent_runs`, `integrations`, `notifications`, `cost_ledger`, `idempotency_keys`, `audit_log`, `manager_reports`, `inventory_snapshots`.

`idempotency_keys` schema (verified): `key text, tenant_id uuid, request_hash text, response jsonb, status text, expires_at timestamptz, created_at timestamptz`. Cleanup cron uses table's own `expires_at`.

`agent_runs.is_mocked` (boolean, nullable): true for runs from `/dashboard/showcase` demo. Onboarding banner (1.6) and agents overview (1.8) filter it out via `.or("is_mocked.is.null,is_mocked.eq.false")`.

**`notifications` table schema (verified from migration 002):**
```
id          uuid primary key default gen_random_uuid()
tenant_id   uuid not null references tenants(id) on delete cascade
user_id     uuid references auth.users(id)  -- NULL = visible to all tenant members
type        text not null
title_he    text not null
body_he     text
link        text
read_at     timestamptz
created_at  timestamptz default now()
```
Index: `notifications_user_unread_idx on (user_id, created_at desc) where read_at is null`.
Used by Alerts page (1.10). Tab filtering uses `type` patterns: `agents` matches a fixed list (agent_succeeded, draft_created, watcher_alert, etc.); `costs` matches `LIKE 'cost_%'`. See `src/app/dashboard/alerts/actions.ts` for the canonical list.

### 5.5 Tenant Config
- `name` — business
- `vertical` — `general | clinic | financial | restaurant | retail | services | beauty | education`
- `business_owner_gender` — Hebrew grammar
- `config` (JSONB): `owner_name`, `business_name`, plus per-agent configs

**Editable from /dashboard/settings (1.7):** `name` (= business_name), `business_owner_gender`, `vertical`, `config.owner_name`, `config.business_name`. The settings action keeps `tenants.name` and `config.business_name` in sync.

### 5.6 The Events Contract
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

For deep webhook integration guidance: `src/lib/agents/watcher/INTEGRATION-NOTES.md` (1.5.5 updated).

### 5.7 Demo Data
- Demo tenant ID: `15ef2c6e-a064-49bf-9455-217ba937ccf2`
- Demo tenant name: `spikeAi`, vertical `retail`
- Demo user: Dean Moshe, `din6915@gmail.com`

---

## 6. The Agents

### 6.1 The 8 Customer-Facing Agents

| # | Agent | Model | Trigger | Output | withRetry? | Anti-AI? |
|---|---|---|---|---|---|---|
| 1 | Manager | sonnet-4-6 | Weekly cron (Sun) | `manager_reports` | ✅ | ✅ |
| 2 | Morning | haiku-4-5 | Daily cron 07:00 IL | drafts | ✅ | ✅ |
| 3 | Watcher | haiku-4-5 | Real-time webhook + daily cron | dashboard alerts | ✅ | ✅ |
| 4 | Reviews | sonnet-4-6 | New review event | drafts | ✅ | ✅ + Israeli-tone |
| 5 | Hot Leads | haiku-4-5 | Real-time webhook | Classify → cascade | ✅ | ✅ |
| 6 | Social | sonnet-4-6 | Cron 05:30 (no Sat) | drafts | ✅ | ✅ + hashtags removed |
| 7 | Sales | sonnet-4-6 + thinking | TWO entry points §6.8 | drafts | ✅ | ✅ |
| 8 | Inventory | sonnet-4-6 | Cron 05:30 Sun/Wed | drafts | ✅ | ✅ |

**As of 1.5.3:** ALL 8 agents have anti-AI hygiene at both prompt level AND post-processing level.

### 6.2 Cleanup (Internal) — 1.5.4
- AgentId: `cleanup`. Not customer-facing. **Excluded from /dashboard/agents (1.8).**
- Location: `src/app/api/cron/cleanup/route.ts`
- Schedule: `0 0 * * *` UTC
- Three best-effort tasks (independent try/catch):
  1. `UPDATE drafts SET status='expired' WHERE status='pending' AND expires_at < NOW()`
  2. Count agent_runs older than 90 days
  3. DELETE expired idempotency_keys
- Always returns HTTP 200.

### 6.3 Models — Hardcoded
```typescript
const MODEL = "claude-haiku-4-5" as const;  // each run.ts
```

### 6.4 Agent Run Lifecycle
`runAgent()`: cost estimation → spend cap → agent_runs row → reserve_spend RPC → executor → settle_spend / refund_spend → cost_ledger.

Two wrappers: `runAgent` (bare) vs `runAgentSafe` (adds safety pipeline).

Never call Anthropic directly. Always wrap in `withRetry(...)`.

### 6.5 Watcher Strategy (1.2 + 1.5.2)
Real-time webhook + daily cron safety net (`0 6 * * *` UTC). Restore to hourly when upgrading to Pro tier.

### 6.6 Hot Leads Strategy (1.3 + 1.3.5 + 1.5.2 + 1.5.3)

Two entry points:
1. `runHotLeadsAgent(tenantId, leads, triggerSource, eventIdByLeadId?)` — batch
2. `runHotLeadsOnEvent(tenantId, eventId)` — single event from webhook
   - Pre-flight idempotency `(tenant_id, event_id)`
   - **(1.3.5):** if bucket ∈ {hot, burning}, fire `runSalesQuickResponseOnEvent` via `waitUntil()`. Cold/warm/spam don't cascade.
   - **Recovery cron (1.5.2):** `/api/cron/hot-leads-sales-recovery` runs daily at `0 2 * * *` UTC.
     - Stage 1: scans events from last 48h with no matching `hot_leads` row, runs classification on up to 50.
     - Stage 2: scans hot/burning leads with no `sales_quick_response` draft, runs cascade.

Bias firewall: LLM sees behavior features + scrubbed message. `display_name` and `source_handle` never reach model.

### 6.7 LLM Retry (1.3 + 1.5.1)
`with-retry.ts`: 3 attempts, 1s/2s/4s exponential + jitter. Pattern:
```typescript
const response = await withRetry(
  () => anthropic.messages.create({...}),
  {
    onRetry: ({ attempt, nextDelayMs, error }) => {
      console.warn(
        `[<agent-id>] LLM attempt ${attempt} failed; retrying in ${Math.round(nextDelayMs)}ms`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    },
  }
);
```

### 6.8 Sales — TWO Entry Points (1.3.5)

**Path A: `runSalesAgent`** — Stuck leads (cron, 07:30, 3+ days old leads, type='sales_followup', adaptive thinking).

**Path B: `runSalesQuickResponseOnEvent`** — Fresh hot leads (webhook cascade, type='sales_quick_response', no thinking, idempotent on event_id).

**Verified Hebrew output:** for hot lead "אני צריך דחוף לקבוע פגישה היום. רוצה לבדוק את הטיפול. תקציב 2000 שקל. מתי אתם פנויים?" → drafted "אהלן מוחמד, שמח לשמוע. היום אפשר לסדר משהו. מתי בדיוק נוח לך?"

---

## 7. Design System — "Calm Frosted"

Apple-style: layered tints, frosted glass, system colors. Tokens in `src/app/globals.css`. **READ THIS FILE before designing any UI.** §2.12.

**Tagline:** "שמונה סוכנים. שקט אחד."

---

## 8. Auth Flow (OTP)

- 6-digit codes only
- `verifyOtp({type: "email"})` — only "email" type, no fallback
- Both Supabase email templates (Magic Link + Confirm signup) use `{{ .Token }}` only
- Login UI says "קוד אימות", never "קישור"

### 8.7 Admin Auth (`src/lib/admin/auth.ts`)
- `isAdminEmail(email): boolean`
- `requireAdmin(): Promise<User>` — redirects appropriately
- `getAdminUserOrNull()` — soft check
- `listAdminEmails()` — debug helper

`requireOnboarded()` returns `{ userId: string, userEmail: string, tenantId: string }`. **NOT** `{ user, tenant }`.

---

## 9. Mobile UX
Adaptive in-place at 768px breakpoint. BottomNav + MobileDrawer + MobileHeader for <768.

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

Daily safety nets (Hobby tier limits crons to 1/day):
  /api/cron/watcher                        — 0 6 * * *
  /api/cron/cleanup                        — 0 0 * * *
  /api/cron/hot-leads-sales-recovery       — 0 2 * * *
```

### 10.2 BSP Decision: Meta Direct (decided 2026-05-02)

### 10.5 Required ENV
```
WHATSAPP_VERIFY_TOKEN     # Stage 1: any string
WHATSAPP_APP_SECRET       # Stage 1: unset (signature bypass)
CRON_SECRET               # Required production. Local: 8ac0dea1-a612-478a-a115-9accb2b3a21c
ADMIN_EMAILS              # comma-separated. Currently: din6915@gmail.com
```

### 10.6 Verified Performance

| Stage | Latency | Cost |
|---|---|---|
| POST → 200 | ~1.7s | — |
| events.insert | <100ms | — |
| Watcher complete | ~8-9s | ~₪0.012 |
| Hot Leads complete | ~9-10s | ~₪0.015 |
| Sales QR (cascade) | +6s | ~₪0.013 |
| End-to-end (hot lead → draft) | ~15-16s | ~₪0.040 |

### 10.7 Schema Discoveries
1. `events.event_type` (not `events.type`)
2. `integrations.credentials` does NOT exist
3. `events.id` is text NOT NULL no default
4. PostgREST cache lag → `NOTIFY pgrst, 'reload schema';`
5. `idempotency_keys` has its own `expires_at` column — used directly by cleanup cron

### 10.17 Sub-stage 1.5.2 — DONE (commit `2ea79c3`)
Hot Leads + Sales QR recovery cron. Single endpoint for Hobby tier.
- File: `src/app/api/cron/hot-leads-sales-recovery/route.ts`
- Schedule: `0 2 * * *` UTC
- Cap: 50 events per stage per run. Window: 48h. Always 200.

### 10.18 Sub-stage 1.5.3 — DONE (commit `bf2f42a`)
Anti-AI sweep — biggest quality lift in Stage 1.
- 5 prompt files updated with anti-AI rules block: `morning/prompt.ts`, `reviews/prompt.ts` (Israeli-tone), `social/prompt.ts` (hashtags removed entirely), `manager/prompt.ts`, `inventory/prompt.ts`
- 2 run.ts files with `stripAiTellsDeep` defense-in-depth: `watcher/run.ts`, `hot_leads/run.ts`.
- Sales prompt unchanged (1.3.5 already comprehensive). Sales QR run.ts unchanged (1.5.1 hotfix already covers).
- Verified live in production: Social/Morning drafts now Hebrew-natural with no em-dashes, no hashtags, ≤1 emoji.

### 10.19 Sub-stage 1.5.5 — DONE (commit `b9610ec`)
Final Stage 1 polish.

`pii-scrubber.ts` audit:
- Phone regex now matches all common IL formats: `050-123-4567`, `050 123 4567`, `+972 50 123 4567`, `(050) 123-4567`, `+972-50-1234567`
- ID widened from exactly-9 to 8-or-9 digits (pre-2007 IDs still valid)
- Credit card widened from 16-only to 13-19 digits (Visa/MC/Amex/Discover)
- Posture: over-redaction over under-redaction (false positives are fine; false negatives leak PII)
- Self-test `_validatePhoneCoverage()` exported with 14 test cases

`INTEGRATION-NOTES.md` rewrite for end-of-Stage-1 reality:
- Documents one events insert can trigger up to 3 agents (Watcher + Hot Leads + Sales QR)
- Per-agent field consumption documented
- 4 integration patterns (Meta webhook, generic webhook, contact form, manual SQL)
- Recovery cron + cleanup cron + Hobby tier constraint documented

### 10.20 Sub-stage 1.6 — DONE (commit `848fbdf`)
**Onboarding banner + rename `/dashboard/demo` → `/dashboard/showcase`.**

**Why:** First-time tenants land on `/dashboard` with empty agent grid and don't know where to start. Banner invites them to Showcase to see the pipeline in action with mock data.

**Three new files + four updated:**

NEW:
- `src/lib/auth/onboarding-status.ts` — `getOnboardingStatus(tenantId)` server helper, counts non-mock `agent_runs` via `.or("is_mocked.is.null,is_mocked.eq.false")` PostgREST syntax
- `src/components/dashboard/onboarding-banner.tsx` — Client component, Calm Frosted styled with blue-purple gradient Sparkles icon, dismiss X button stores `localStorage` flag `spike.onboardingBannerDismissedAt:<tenantId>`
- `src/app/dashboard/showcase/page.tsx` — replaces old `/dashboard/demo`, no admin allowlist (was admin-only via `DEMO_ALLOWED_EMAILS`)

UPDATED:
- `src/components/dashboard/sidebar.tsx` — Showcase added to NAV_ITEMS for all users (was admin-only Demo link); admin-only block kept for `/admin` only
- `src/components/dashboard/mobile-drawer.tsx` — same change
- `src/app/dashboard/page.tsx` — adds OnboardingBanner conditional render after KPI strip
- `src/components/demo/demo-panel.tsx` — single-line import path change from `@/app/dashboard/demo/actions` to `@/app/dashboard/showcase/actions`

DELETED: `src/app/dashboard/demo/` folder (after restoring `actions.ts` via `git show 69d066c:src/app/dashboard/demo/actions.ts | Set-Content "src/app/dashboard/showcase/actions.ts"`)

**Banner dismissal logic (decision (ג)):**
- Auto-hide: parent re-renders on every navigation, so banner disappears the moment `realRunCount > 0`
- Manual: X button stores ISO timestamp in localStorage, keyed per-tenantId
- localStorage access wrapped in try/catch (private mode tolerance)

**Banner shows hidden by default to avoid hydration flash** (`useState(false)`). useEffect promotes to visible after localStorage check passes. ~50ms perceived flicker is acceptable.

### 10.21 Sub-stage 1.7 — DONE (commit `9680c96`)
**Tenant settings page at `/dashboard/settings`.**

**Why:** Owners need to be able to edit `business_owner_gender` (gender lock), `vertical` (agent tone calibration), `owner_name`, `business_name` after onboarding without going through DB. First placeholder 404 page replaced with real implementation.

**Three new files:**
- `src/app/dashboard/settings/actions.ts` — `updateTenantSettings({ ownerName, businessName, businessOwnerGender, vertical })` server action. Validates input, returns `{ ok, error?, fieldErrors? }`. Updates `tenants.name`, `tenants.business_owner_gender`, `tenants.vertical`, and merges `config.owner_name + config.business_name` into existing config object (preserves all other config keys). Calls `revalidatePath("/dashboard")` and `revalidatePath("/dashboard/settings")` on success.
- `src/app/dashboard/settings/page.tsx` — Server Component, full chrome (Sidebar + MobileHeader + BottomNav + WhatsAppFab). Loads `tenants.{name, vertical, business_owner_gender, config}` and passes initial values to `<SettingsForm>`. Defaults: gender → `"male"` if unset, vertical → `"general"`. Page is `max-w-[760px]` (narrower than dashboard).
- `src/components/dashboard/settings-form.tsx` — Client component. Owns form state with `useState`. Submit via `useTransition`. Sonner toast on success ("ההגדרות נשמרו") and on error. Inline field errors (red border + 11.5px text). Two Glass cards: "פרטי העסק" (owner_name + business_name + gender) and "ענף העסק" (vertical). Submit button disabled when no changes from initial state.

**Decision history (spec discussion):**
- (א) Form with Submit button (not inline editing)
- (ג) Both toast + inline field errors
- 4 basic fields only (no `brand_voice_samples` or `availabilityLink` in v1 — defer to 1.8 if needed)
- Vertical labels in Hebrew: general→כללי, clinic→מרפאה / קליניקה, financial→פיננסי, restaurant→מסעדה / בית קפה, retail→קמעונאות / חנות, services→שירותים, beauty→יופי / מספרה, education→חינוך / הוראה
- Gender as 2 button-style toggles (זכר/נקבה) instead of radios — more app-feel

**Validation:**
- ownerName: 1-80 chars, required
- businessName: 1-120 chars, required
- gender: must be one of `male | female`
- vertical: must be one of the 8 known verticals

### 10.22 Sub-stage 1.8 — DONE (commit `8796d8e`)
**Agents overview page at `/dashboard/agents`.**

**Why:** Second placeholder 404 page replaced. Owners need a single screen showing per-agent status without going to dashboard (which mixes agents with KPIs and approval banners).

**Three new files:**
- `src/lib/agents/overview.ts` — `getAgentsOverview(tenantId)` server helper. Two queries: (1) latest 200 agent_runs ordered desc, JS-grouped to capture latest per agent; (2) all non-mock agent_runs since calendar month start (IL TZ via `Asia/Jerusalem`), JS-counted per agent. Returns one `AgentOverview` entry per ALL_AGENT_IDS (8 customer-facing — cleanup excluded), even if never run. Also exports `formatTimeAgoHe(iso)` for Hebrew relative time.
- `src/app/dashboard/agents/page.tsx` — Server Component, full chrome. Same 3 categories as dashboard (routine/content/insight). Loads overview + drafts + manager lock state in parallel via `Promise.all`. Uses `AGENTS_BY_CATEGORY` to slot 8 agents into the 3 sections.
- `src/components/dashboard/agent-overview-card.tsx` — Client Component. Glass card with `agent-card` hover, gradient tile from `AGENTS[agentId].gradient`, name + schedule + description from config. Activity stats in inset rounded box: clock icon + "ריצה אחרונה: X" + status icon (CheckCircle2 / AlertCircle / Loader2 spinning) + "X ריצות החודש" with proper Hebrew pluralization. Run button at bottom — reuses all 8 existing `Run*Button` components based on agentId.

**Critical UX decision (Dean's call): no ₪ cost or % quota display.**
- Showing raw cost makes users think they're being charged per-run ("I already spent ₪50 on this?")
- Showing % quota triggers either anxiety (near limit) or wasteful "use it or lose it" behavior — anti-pattern of the goal-gradient effect
- Activity-only counts let agents run when needed, not for value-extraction
- Aligns with "AI מסמן, בעלים מחליט" philosophy
- Discussion: 2026-05-04 session 6
- Future Stage-2-prep idea: aggregated "ניצלת X% מהחבילה" at top of page (not per-card), with `tenant_agents.monthly_quota` schema. Only when first paying customer joins.

**Hebrew pluralization in card:**
- 0 runs → "לא רץ עדיין"
- 1 run → "ריצה אחת החודש"
- 2+ runs → "X ריצות החודש"

**Status visual mapping:**
- succeeded → green CheckCircle2
- failed → pink AlertCircle
- running → blue Loader2 (animated spin)
- no_op → gray CheckCircle2

### 10.23 Sub-stage 1.9 — DONE (commit `799bfc4`)
**Refactor of `src/app/dashboard/actions.ts`: 1430-line monolith → 7 focused files.**

**Why:** Every session added ~50 lines and finding any function required scrolling through unrelated code. The file had become a maintenance liability — risky to edit, slow to navigate, hard to onboard onto.

**Strategy:** Re-export pattern (gist (א) from spec discussion). The public API is unchanged: `actions.ts` becomes a thin shim that re-exports from 7 files under `actions/`. The 15+ Client Components that import from `@/app/dashboard/actions` need zero changes.

**New structure:**

```
src/app/dashboard/
├── actions.ts                          # 81 lines, re-exports only
└── actions/
    ├── _shared.ts                      # 150 lines, helpers (NO "use server")
    ├── manager.ts                      # 243 lines
    ├── agent-triggers.ts               # 581 lines (largest)
    ├── drafts.ts                       # 148 lines
    ├── leads.ts                        # 150 lines
    ├── reports-kpis.ts                 # 188 lines
    └── inventory.ts                    # 216 lines
                                        # 1757 total (~327 added: header comments)
```

**File-by-file responsibilities:**

- **`_shared.ts`** — `getActiveTenant()`, `checkAgentRateLimit()`, `RATE_LIMIT_MINUTES` record. Used by every other file. **Deliberately NOT marked `"use server"`** — it exports helper utilities, not server actions. Adding `"use server"` would expose `getActiveTenant` and `checkAgentRateLimit` as RPC endpoints unnecessarily.

- **`manager.ts`** — Manager weekly-lock state machine. Exports `ManagerLockState` interface + `getManagerLockState()`, `markManagerReportRead()`, `triggerManagerAgentAction()`. Internal `getManagerLockStateForTenant()` helper not exported.

- **`agent-triggers.ts`** — 7 trigger* functions for non-Manager agents (Manager has its own file due to its weekly-lock model). Plus 3 internal loaders that convert DB events into agent input shapes: `loadReviewEventsAsReviews()`, `loadLeadEventsAsLeads()`, `loadMorningContext()`.

- **`drafts.ts`** — Approval inbox: `PendingDraft` + `listPendingDrafts()` + `approveDraft()` + `rejectDraft()`.

- **`leads.ts`** — Hot Leads board: `ClassifiedLead` + `listClassifiedLeads()` + `markLeadContacted()` + `dismissLead()`.

- **`reports-kpis.ts`** — Manager reports listing + Dashboard KPI strip queries: `ManagerReportRow` + `listManagerReports()` + `DashboardKpis` + `getDashboardKpis()`.

- **`inventory.ts`** — Inventory CSV upload + snapshot/analysis queries: `UploadInventoryResult` + `InventorySnapshotRow` + `uploadInventoryCsv()` + `getLatestInventorySnapshot()` + `getLatestInventoryAnalysis()`. (`triggerInventoryAgentAction` lives in agent-triggers.ts for symmetry with the other 7 trigger functions.)

**Why three commits, not one:**
- **Commit A — Refactor (no behavior change)** — pure structural change, easy to revert if anything breaks. tsc passes.
- **Commit B — Smoke test in production** — visited `/dashboard`, ran Morning + Watcher agents (modal-based runs verified loaders work), visited `/dashboard/settings` and changed owner_name (verified updateTenantSettings + revalidate), screenshotted as proof. No regressions found.
- **Commit C — Docs update (this commit)** — CLAUDE.md updated to reflect new structure.

**Behavioral byte-for-byte equivalence verified:**
- All function bodies copy-pasted unchanged
- Same error messages, same DB queries, same return shapes
- tsc --noEmit passes with zero errors
- Production smoke test green

**Architectural notes worth recording:**
1. Header comment in every new file is non-negotiable. It explains scope, exports, and overlap with siblings. Without it, refactor is "works" but not "maintainable". This is the artifact that pays back in 3 months.
2. Re-export inheritance: each file's `"use server"` directive applies to its own server actions. The top-level `actions.ts` doesn't need `"use server"` because re-exports inherit the directive from the source file.
3. Internal loaders (loadReviewEventsAsReviews, etc.) live in `agent-triggers.ts` because each is used by exactly one trigger. They're not in `_shared.ts` because they're not shared.

**See §1.10 for the iron rules around this structure (don't merge back, don't add to top-level, etc).**

### 10.24 Sub-stage 1.10 — DONE (commit `644a5ef`)
**Notifications inbox at `/dashboard/alerts`.**

**Why:** Third placeholder 404 page replaced. Tenants need a centralized place to see what their agents have been doing — succeeded runs, failed runs, drafts created, hot leads classified, cost alerts. The `notifications` table existed since migration 002 but had no UI.

**Three new files:**
- `src/app/dashboard/alerts/actions.ts` — Three server actions:
  - `listNotifications(tab)` — scoped to tenant + (user_id=current OR user_id IS NULL for tenant-wide). Tab filtering is server-side via `.in()` / `.like()` / `.is()`. Capped at 100 rows. Also returns `unreadCount` via separate count query for the tab badge.
  - `markNotificationRead(id)` — idempotent (only updates if `read_at IS NULL`). Calls `revalidatePath("/dashboard/alerts")`.
  - `markAllNotificationsRead()` — bulk update for current user, returns `markedCount` for toast feedback. Note: tenant-wide notifications (user_id IS NULL) are also affected — schema limitation we accept (read_at is per-row, not per-user).
- `src/app/dashboard/alerts/page.tsx` — Server Component, full chrome. Initial-loads notifications for tab='all' + drafts count in parallel. Page is `max-w-[920px]`.
- `src/components/dashboard/alerts-list.tsx` — Client Component. Owns currentTab/notifications/unreadCount state. useEffect refetches on tab change. Optimistic mark-read on click for instant feedback. Sonner toast on mark-all-read.

**4 tabs:**
- **הכל** — no filter
- **לא נקראו** — `read_at IS NULL`. Tab shows numeric badge with unread count.
- **סוכנים** — `type IN [agent_succeeded, agent_failed, draft_created, draft_approved, draft_rejected, manager_report_ready, watcher_alert, hot_lead_classified]`
- **כספיות** — `type LIKE 'cost_%'`

**Click on notification:**
- Optimistic local state update (mark read instantly in UI)
- Fire-and-forget server `markNotificationRead`
- Navigate to `notification.link` if set (e.g. `/dashboard/approvals`)

**Empty state per tab (decision: professional but warm):**
- **all:** "אין התראות כרגע" / "כשתפעיל סוכנים, התראות יופיעו כאן עם דיווחים על לידים, טיוטות וחריגות."
- **unread:** "הכל נקרא" / "אין התראות שלא נקראו. תוכל לעבור לטאב 'הכל' לראות את כל ההיסטוריה."
- **agents:** "אין דיווחים מהסוכנים" / "התראות מהסוכנים על ריצות מוצלחות, לידים חדשים וטיוטות יופיעו כאן."
- **costs:** "אין התראות כספיות" / "התראות על הוצאות, מגבלות תקציב ושימוש חריג ב-AI יופיעו כאן."

**Visual:**
- Tab bar in rounded inset Glass frame (active tab gets white background + tiny shadow)
- Card per notification: blue dot for unread, subtle blue border tint when unread
- "לפרטים →" link affordance with ExternalLink icon when notification has a link
- Hebrew relative time formatter inlined (mirrors agent-overview-card; can't reuse overview.ts because that file is server-only)

**Schema reference: notifications table (verified from migration 002):**
```
id          uuid primary key default gen_random_uuid()
tenant_id   uuid not null references tenants(id) on delete cascade
user_id     uuid references auth.users(id)  -- NULL = visible to all tenant members
type        text not null
title_he    text not null
body_he     text
link        text
read_at     timestamptz
created_at  timestamptz default now()
```
Index `notifications_user_unread_idx on (user_id, created_at desc) where read_at is null` — fast for unread queries.

---

## 11. Current Status

### 11.1 What Works ✅ — STAGE 1 COMPLETE + POST-STAGE-1 POLISH
- All 8 customer-facing agents on real DB events, all wrapped in withRetry
- All 8 customer-facing agents have anti-AI hygiene (prompt + post-processing)
- 9th agent (cleanup) implemented as cron
- Login (OTP), Onboarding, Dashboard with KPI strip, Mobile UX
- Approvals, Inventory, Leads, Manager
- Full safety pipeline including comprehensive Israeli PII coverage
- Internal Demo UI (renamed to /dashboard/showcase, public for all users — 1.6)
- **Onboarding banner for new tenants (1.6)**
- **Tenant settings page (1.7)** — owners can edit `owner_name`, `business_name`, gender, vertical
- **Agents overview page (1.8)** — per-agent activity stats
- **`actions.ts` refactored from 1430-line monolith into 7 focused files (1.9)**
- **Notifications inbox at /dashboard/alerts (1.10)** — 4-tab filtering, click-to-read, mark-all-read
- Real-time WhatsApp pipeline (~15-16s end-to-end, ~₪0.04/hot-lead)
- Cleanup cron + Recovery cron daily
- All deployed live to `app.spikeai.co.il`

### 11.2 Pending — Not Blocking 🚧
- **3 sidebar pages still 404** (was 7 before 1.6/1.7/1.8/1.10): דוחות, מרכז בקרה, אמון ופרטיות
- ~~`actions.ts` 1430 lines — split~~ ✅ DONE (1.9)
- Race in `inventory-upload-zone` + `run-inventory-button`
- 2 moderate npm audit vulnerabilities
- `integrations` table schema not finalized
- defamation-guard not wrapped in withRetry (low priority)
- Manager dashboard view (backend exists, no UI) — would replace דוחות placeholder

### 11.3 Pending — Stage 2 ⚠️
- Meta Business Manager verification (2-10 days async — needs business registration first; עוסק פטור acceptable per session 5 web research, 3 IL sources confirmed)
- Embedded Signup UI for tenants
- `integrations` table schema design
- Outgoing message templates
- Real `phone_number_id` → `tenant_id` mapping
- Set `WHATSAPP_APP_SECRET` (no longer bypass)
- Anthropic credits: auto-reload disabled, $4.20 balance. **Top up before first prospect demo.**

### 11.4 Pending — Pre-Production Vercel Env
- `CRON_SECRET` (Production + Preview)
- `WHATSAPP_VERIFY_TOKEN`
- `ADMIN_EMAILS`

---

## 12. Strategic Roadmap

### 12.1 Pricing (Decided)

| Tier | Price/mo | Setup | Target |
|---|---|---|---|
| Solo | ₪290 | ₪990 | עוסק יחיד |
| Pro | ₪690 | ₪990 | small business |
| Chain | ₪1,490 | ₪990 | 3-15 locations |

14-day trial. NO freemium. 17% annual discount.

### 12.2 Stage 1 — WhatsApp First Integration ✅ COMPLETE
- 1.1 ✅ Webhook receiver
- 1.2 ✅ Watcher real-time + cron
- 1.3 ✅ Hot Leads parallel + idempotency + retry + prompt fix
- 1.3.5 ✅ Sales QuickResponse + cascade
- 1.4 ✅ Internal Demo UI
- 1.4.5 ✅ Admin sidebar link
- 1.5.1 ✅ withRetry on all 5 remaining agents + em-dash hotfix
- 1.5.2 ✅ Hot Leads + Sales QR cron safety nets
- 1.5.3 ✅ Anti-AI sweep on prompts + post-processing
- 1.5.4 ✅ Cleanup cron
- 1.5.5 ✅ PII Israeli phone format audit + INTEGRATION-NOTES update
- 1.6 ✅ Onboarding banner + rename demo→showcase
- 1.7 ✅ Tenant settings page
- 1.8 ✅ Agents overview page
- 1.9 ✅ Refactor of dashboard actions.ts (1430 lines → 7 focused files)
- 1.10 ✅ Notifications inbox at /dashboard/alerts

### 12.3 Stage 2 — Production WhatsApp (NEXT)
1. **PRE-REQ:** Dean registers as עוסק פטור (~30 min, free, online at רשות המסים)
2. Meta Business verification (1-7 business days — see session 5 web research notes below)
3. Embedded Signup UI
4. `integrations` schema design
5. Outgoing templates
6. `phone_number_id` → `tenant_id` mapping
7. Enable signature verification

**Meta verification prerequisites (session 5 research):**
- עוסק פטור acceptable per Automatix, CyberGuard, Flashy (all Oct 2025-Mar 2026)
- 2 documents needed: business registration + utility bill (last 3 months)
- Phone number must be "clean" — not registered to WhatsApp or WhatsApp Business
- Website footer must show registered business name (`spikeai.co.il` already has this)
- **Repeated rejected applications can permanently disable verification** — must be correct first time

Estimated total: 5-7 days work + 1-7 days async waiting.

### 12.4 Stage 3 — Next 30 Days (post Stage 2)
1. Trust Agent v0.5 — תיקון 13 + DPO checklist. Solo tier.
2. Cash Flow Agent v0.5 + GreenInvoice. Pro tier.
3. VAT Agent — חשבונית ישראל. Pro tier.
4. Chain HQ Agent. Chain tier.
5. Win-Back Agent. Pro tier.

### 12.5 Tier Mapping
- Solo: Trust agent
- Pro: Cash Flow + GreenInvoice, Win-Back, VAT, Manager
- Chain: Chain HQ + everything in Pro

### 12.6 Distribution Hidden Opportunities
vcita inTandem partnership (OEM) · Voicenter voice channel · Israeli franchises (Roladin, Aroma, Cofizz, Re/Max).

---

## 13. What NOT to Build

| Idea | Why not |
|---|---|
| NPS / CSAT surveys | Commodity. vcita / Birdeye / Podium do it. |
| Schedule optimization for staff | Israeli labor law = lawyer territory. |
| Contract review | "Legal advice" liability. |
| Senior Manager Agent (AI flagging AIs) | AI flagging AI = bias amplification. Push back. |
| Crypto / Web3 | Not relevant to ICP. |
| Standalone mobile app | Not before 100 paying customers. |
| OpenAI / Gemini integration | Violates Iron Rule 1.3. |
| Email-as-product | Mailchimp / ActiveCampaign exist. |
| Calendar booking | Calendly / vcita won. |
| Generic chatbot widget | That's the "בוט" we don't sell. |
| 360dialog / BSP middleman | Direct Meta = $0. |
| Refer customers to competitors | Decided 1.3.5. Hurts retention. |
| Merge actions/ files back into one | 1430-line monolith was a maintenance liability. See §1.10, §10.23. |

---

## 14. Israeli Market Context

850K+ SMBs in Israel · WhatsApp adoption ~99% · Hebrew-first underserved · 3-15 location chains white space · תיקון 13 (Aug 2025) universal compliance need · חשבונית ישראל (Jan 2025) current pain.

Competitors: vcita, HubSpot Breeze, Salesforce Agentforce, Toast IQ, GlossGenius, Birdeye, Podium, Wix.AI (watch), Lindy AI.

---

## 15. Common Pitfalls

### 15.1 Don't Do These
- ❌ Use "בוט". Use "סוכן AI" / "סוכן".
- ❌ Suggest auto-send "for transactional".
- ❌ Propose i18next / English version.
- ❌ "OpenAI is cheaper" — Anthropic-only is strategic.
- ❌ Tell Dean "good night" at 7am. **Or at any time (session 6 rule).**
- ❌ Hallucinate names from `events.payload`.
- ❌ Hallucinate facts in CLAUDE.md.
- ❌ Build a feature without `expires_at` in `drafts`.
- ❌ Skip safety pipeline. Use `runAgentSafe`.
- ❌ Propose "senior agent monitoring agents". Rejected.
- ❌ Suggest pivoting to en-US.
- ❌ Use em-dash (—) in agent output.
- ❌ Use hashtags (#) in agent output.
- ❌ Add BSP middleman.
- ❌ Dot notation in `event_type`. Snake_case.
- ❌ Refer customers to competitors.
- ❌ Confuse `runSalesAgent` with `runSalesQuickResponseOnEvent`.
- ❌ Trigger Sales QR on cold/warm/spam.
- ❌ Build new UI without reading `globals.css` first.
- ❌ Use Tailwind preset colors for design. Use CSS variables in `style={{}}`.
- ❌ Put constants/types in "use server" file.
- ❌ Assume `requireOnboarded()` returns `{ user, tenant }`. Returns `{ userId, userEmail, tenantId }`.
- ❌ Generate scratch files inside the repo.
- ❌ Call `anthropic.messages.create` directly. Always wrap in `withRetry(...)`.
- ❌ Add a Vercel cron with non-daily schedule on Hobby tier. §15.8.
- ❌ **Display ₪ cost or % quota on agents overview (1.8 decision).** Activity-only counts.
- ❌ **Add new server actions to top-level `actions.ts` (1.9).** Add to the appropriate file in `actions/` and re-export.
- ❌ **Merge the `actions/` files back into one (1.9).** The split is permanent.
- ❌ **Add `"use server"` to `actions/_shared.ts` (1.9).** It exports helpers, not server actions.
- ❌ **Send commit + push + deploy in two separate messages (session 6 rule).** Always one message.

### 15.5 PowerShell
- 2 separate windows (dev + commands)
- Tee-Object pipeline doesn't block
- Add-Content doesn't add newline
- Stale .next cache → `Remove-Item -Recurse -Force .next` + restart dev
- `git show` falls into less pager → `git --no-pager show ...` or press `q`
- LF/CRLF normalization warnings on `git add -A` are usually harmless
- Verify Downloads after present_files: `Get-Item ... | Select-Object Length`. 0 bytes = retry.
- Select-String fails on UTF-8 Hebrew from git stdout — redirect to file + open in notepad.
- **Vercel `vercel --prod` may fail with ECONNRESET on flaky network** — usually deployment succeeded server-side. Retry the command (it's idempotent) or check production URL.

### 15.6 UI Design Workflow
**Before any UI:**
```powershell
Get-Content "src\app\globals.css"
Get-Content "src\components\dashboard\kpi-strip.tsx"
Get-Content "src\app\dashboard\page.tsx"
```

If skipped: expect 3-4 design iterations.

### 15.7 Iteration Speed
- 1.1: ~2h · 1.2: ~1.5h · 1.3: ~3h · 1.3.5: ~2h · 1.4: ~4-5h
- 1.4.5: ~30min · 1.5.1: ~45min + 15min hotfix · 1.5.2: ~45min
- 1.5.3: ~1.5h · 1.5.4: ~1.5h · 1.5.5: ~30min
- 1.6: ~1.5h · 1.7: ~1.5h · 1.8: ~1h
- 1.9: ~2h (refactor + smoke test + docs)
- **1.10: ~1h** (alerts page + 4 tabs + 3 server actions)

### 15.8 Vercel Hobby Tier Cron Limit (Session 4 lesson — CRITICAL) ⚠️

**Hobby plan limits crons to maximum 1 run per day per project.**

Schedules like `0 * * * *` (hourly) cause Vercel to silently reject the project config at validation time, blocking ALL deployments. No deployment row. No error notification.

**Symptom:** `git push` succeeds, but production stays on an old commit indefinitely. Vercel Deployments page shows nothing new.

**Diagnostic:** From CLI run `vercel --prod`. If you see:
```
Error: Hobby accounts are limited to daily cron jobs.
This cron expression (0 * * * *) would run more than once per day.
```
→ Check `vercel.json` for any cron with non-daily schedule.

**This bit Spike hard at end of session 4.** Sub-stages 1.1-1.5.4 all pushed but production stayed on old commit (`9018a169`) for ~19 hours. The Watcher cron from 1.2 was hourly, silently blocked everything after.

**Resolution:** Watcher cron changed to `0 6 * * *` (daily). All 7 current crons in `vercel.json` are now daily-or-less.

On Pro tier upgrade: restore Watcher to `0 * * * *` for sub-hour catchup of missed webhooks.

**Workaround:** Always run `vercel --prod` after critical pushes if Vercel webhook seems stuck.

### 15.9 Refactor Workflow (1.9 lesson)
For any structural refactor of a multi-import file:

1. **Re-export pattern over import migration.** The 1430-line `actions.ts` was split via re-exports — 15+ Client Components needed zero changes. Migrating imports across 15+ files would have mixed structural and behavioral changes.
2. **Three commits, never one:** (A) Refactor with byte-for-byte equivalent behavior → (B) Smoke test in production → (C) Docs update.
3. **`"use server"` belongs on actual server-action files only.** Helper-only files (like `_shared.ts`) should NOT have it — that would expose helpers as RPC endpoints.
4. **Header comment is mandatory.** Every new file gets a comment explaining scope + exports + overlap. Without it, refactor is "works" but not "maintainable".
5. **Smoke test in production is non-negotiable.** tsc passes ≠ runtime works. Click every button. Screenshot the proof.

---

## 16. Commit Conventions

Conventional commits, English subject, Hebrew body OK.
Format: `<type>(<scope>): <subject>`
Scopes: `auth`, `mobile`, `design`, `morning`, `watcher`, `reviews`, `hot_leads`, `social`, `sales`, `inventory`, `manager`, `cleanup`, `approvals`, `onboarding`, `ui`, `db`, `safety`, `whatsapp`, `webhooks`, `agents`, `demo`, `sidebar`, `cron`, `pii`, `settings`, `actions`, `alerts`.

---

## 17. Onboarding a New Claude Conversation

If you are Claude reading this for the first time:

1. ✅ Read this file completely. Then re-read §1, §2, §6.6, §6.8, §10, §15.8.
2. ❌ Do not re-ask Dean to summarize the project.
3. ❌ Do not suggest building anything from §13.
4. ✅ Ask Dean: "מה הצעד הבא?" if he hasn't said.
5. ✅ Push back if request violates §1 or §13.
6. ✅ Confirm you've read this file in your first reply, in 2-3 lines max.

**Sample first reply:**
> קראתי את CLAUDE.md. Spike Engine — 8 סוכני AI מול לקוח + cleanup פנימי, drafts-only, עברית RTL, Anthropic only. Stage 1 הושלם במלואו (1.1 עד 1.5.5) + Post-Stage-1 polish (1.6 banner+showcase, 1.7 settings, 1.8 agents overview, 1.9 actions refactor, 1.10 alerts inbox). הכל בייצור על app.spikeai.co.il. הצעד הבא הוא Stage 2 (Meta verification + Embedded Signup) או placeholder pages נוספים (3 שנשארו: דוחות, מרכז בקרה, אמון ופרטיות). מה אתה רוצה לעשות?

---

## 18. Appendix

### 18.1 Migrations (21 files)
Active 001-021. Latest: `021_drafts_expired_status.sql` (1.5.4 — idempotent enum/text-aware).
Archive: `supabase/migrations/_archive/v1/`.
Note: 009 was skipped during initial scaffold; not a gap to fill.

### 18.2 Selected Commits (newest first)

| Hash | What |
|---|---|
| `644a5ef` | feat(alerts): notifications inbox page (Sub-stage 1.10) |
| `ec5922f` | docs: update CLAUDE.md for sub-stage 1.9 (actions refactor) |
| `799bfc4` | refactor(actions): split monolithic actions.ts into 7 focused files (Sub-stage 1.9) |
| `f70178d` | docs: update CLAUDE.md for sub-stages 1.6, 1.7, 1.8 |
| `8796d8e` | feat(agents): agents overview page (Sub-stage 1.8) |
| `9680c96` | feat(settings): tenant settings page (Sub-stage 1.7) |
| `848fbdf` | feat(onboarding): banner + rename demo to showcase (Sub-stage 1.6) |
| `b9610ec` | feat(pii)+docs: Sub-stage 1.5.5 — IL phone audit + INTEGRATION-NOTES + CLAUDE.md (Stage 1 complete) |
| `bf2f42a` | feat(agents): anti-AI sweep on prompts + post-processing (1.5.3) |
| `2ea79c3` | feat(cron): hot-leads + sales-qr recovery cron (1.5.2) |
| `ea0ce39` | fix(cron): reduce watcher cron to daily for Hobby tier (the unlock) |
| `a25abae` | chore: remove junk file + trigger Vercel rebuild |
| `06b686d` | fix(agents): strip em-dashes + hashtags post-LLM (1.5.1 hotfix) |
| `3554030` | docs: update CLAUDE.md through 1.5.4 |
| `0c65b2d` | feat(cleanup): vercel.json + migration 021 (1.5.4 part 2) |
| `bd068ef` | feat(cleanup): cron job (1.5.4 part 1) |
| `2041a10` | feat(agents): wrap remaining 5 agents in withRetry (1.5.1) |
| `8e02c82` | chore: remove file-tree.txt artifact |
| `4c8057f` | feat(sidebar): admin link to /dashboard/demo (1.4.5) |
| `69d066c` | feat(demo): Sub-stage 1.4 — internal Demo UI |
| `aec0d9a` | feat(agents): Sales QuickResponse + Hot Leads cascade (1.3.5) |
| `1ac925a` | feat(agents): Watcher prompt fix + Sales withRetry (1.3 part 3) |
| `0b8d788` | feat(agents): exponential-backoff retry (1.3 part 2) |
| `f59df9b` | feat(hot_leads): event-triggered classification (1.3 part 1) |
| `cc85952` | feat(whatsapp): trigger Watcher on inbound (1.2) |
| `aaa2f1d` | feat(webhooks): WhatsApp Cloud API receiver (1.1) |

### 18.3 Links
- Repo (engine): https://github.com/DinSpikeAI/spike-agents-engine
- Repo (landing): https://github.com/DinSpikeAI/spike-agents
- Production: https://app.spikeai.co.il
- Supabase: ref `ihzahyzejqpjxwouxuhj`

### 18.4 Where to Find Things
- Calm Frosted tokens → `src/app/globals.css`
- Dashboard chrome reference → `src/app/dashboard/page.tsx`
- Glass primitive → `src/components/ui/glass.tsx`
- Webhook receiver → `src/app/api/webhooks/whatsapp/route.ts`
- Sales QR prompt → `src/lib/agents/sales/prompt-quick-response.ts`
- Hot Leads cascade logic → `src/lib/agents/hot_leads/run.ts`
- Demo shared types → `src/lib/demo/types.ts`
- requireOnboarded → `src/lib/auth/require-onboarded.ts`
- Onboarding status helper → `src/lib/auth/onboarding-status.ts` (1.6)
- Agents overview helper → `src/lib/agents/overview.ts` (1.8)
- Admin auth helpers → `src/lib/admin/auth.ts`
- Cleanup cron → `src/app/api/cron/cleanup/route.ts`
- Recovery cron → `src/app/api/cron/hot-leads-sales-recovery/route.ts`
- withRetry utility → `src/lib/with-retry.ts`
- Anti-AI strip utility → `src/lib/safety/anti-ai-strip.ts`
- PII scrubber → `src/lib/safety/pii-scrubber.ts`
- Onboarding banner → `src/components/dashboard/onboarding-banner.tsx` (1.6)
- Settings form → `src/components/dashboard/settings-form.tsx` (1.7)
- Agent overview card → `src/components/dashboard/agent-overview-card.tsx` (1.8)
- Alerts list → `src/components/dashboard/alerts-list.tsx` (1.10)
- Settings server action → `src/app/dashboard/settings/actions.ts` (1.7)
- Alerts server actions → `src/app/dashboard/alerts/actions.ts` (1.10)
- Showcase page → `src/app/dashboard/showcase/page.tsx` (1.6, replaces /demo)
- **Dashboard server actions (1.9 split):**
  - Re-export shim → `src/app/dashboard/actions.ts`
  - Shared helpers → `src/app/dashboard/actions/_shared.ts`
  - Manager actions → `src/app/dashboard/actions/manager.ts`
  - Agent triggers → `src/app/dashboard/actions/agent-triggers.ts`
  - Drafts inbox → `src/app/dashboard/actions/drafts.ts`
  - Hot Leads board → `src/app/dashboard/actions/leads.ts`
  - Reports + KPIs → `src/app/dashboard/actions/reports-kpis.ts`
  - Inventory → `src/app/dashboard/actions/inventory.ts`

---

**End of CLAUDE.md.**

If something here is wrong or outdated, the priority is to update **this file first**, then the code. This file is a load-bearing document.
