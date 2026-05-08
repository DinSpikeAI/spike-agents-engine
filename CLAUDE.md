# CLAUDE.md — Spike Engine Briefing

> **For Claude (the AI coding assistant) reading this:** This file is your briefing. Read it in full before responding to the user. Do not ask the user to re-explain the project. When this file conflicts with your training data, **this file wins**.
>
> **Last updated:** 2026-05-08 (end of Sub-stage 1.15 — Growth Agent: the 10th and final agent). Stage 1 COMPLETE + Stage 2 MVP + Perf overhaul + Growth Agent. **The 10th agent is live and verified end-to-end in production.** Surfaces dormant customers (Reactivation) and unanswered DMs (Lead Discovery) on a Sunday-07:00-IST cron + Pro-tier on-demand button. Pipeline: Haiku 4.5 scoring 200-candidate batches at ~₪0.90/scan → Sonnet 4.6 personalized Hebrew drafts at ~₪0.04 per draft, both with prompt caching (1h ephemeral TTL). Inngest v4 wired (Vercel-Inngest integration via manual env vars after the auto-OAuth path hung; sync via "Sync new app" with the deploy URL). Migration `023_growth_agent.sql` introduces 4 tables (meta_inbox_messages, growth_runs, growth_candidates, growth_outcomes) with RLS matching Spike's standard pattern. End-to-end test on demo tenant produced a clean Hebrew reactivation draft for "דנה כהן" (a synthetic dormant customer): *"היי דנה! שמתי לב שפנית לפני כמה שבועות לגבי חידוש הקרטין ולא חזרנו אליך, סליחה על זה. אם את עדיין מחפשת תור, שמחה לבדוק מה פנוי בקרוב."* Total cost: ₪0.0319 per run. **Latest commit:** `38f0bd8` (events.payload jsonb fix in candidate gathering).

---

## 0. TL;DR

- **What:** Multi-tenant SaaS in Hebrew RTL for Israeli SMBs (salons, restaurants, clinics, retail, 3-15 location chains). 9 customer-facing AI agents draft proposals; the business owner approves before anything sends. A 10th internal agent (`cleanup`) does housekeeping — never visible to the user. All 10 are implemented and live in production. (The 10th customer-facing — Growth — was added in Sub-stage 1.15.)
- **Founder / sole dev:** Dean Moshe (`din6915@gmail.com`). Bootstrap mode. Hebrew speaker.
- **The Iron Rule above all others:** "AI מסמן, בעלים מחליט" — AI flags, owner decides. Drafts only. Never auto-send.
- **Marketing tagline:** "שמונה סוכנים. שקט אחד." ("Eight agents. One quiet.") — refers to the 8 customer-facing agents.
- **Stack:** Next.js 16.2.4 (Turbopack) + React 19.2.4 + Tailwind v4 + TypeScript · Supabase (Frankfurt) · `@anthropic-ai/sdk@0.91.1` (Sonnet 4.6 + Haiku 4.5) · Resend · Vercel · `@vercel/functions@3.5.0` for waitUntil background tasks.
- **Repo (engine):** https://github.com/DinSpikeAI/spike-agents-engine
- **Repo (landing):** https://github.com/DinSpikeAI/spike-agents — separate marketing site (Next.js 16, Tailwind v4, RTL, Web3Forms). Don't confuse the two.
- **Local dev:** `C:\Users\Din\Desktop\spike-engine`
- **Domain:** `app.spikeai.co.il` (production) · `localhost:3000` (dev).
- **State (May 2026):** Stage 1 COMPLETE. Full WhatsApp pipeline: webhook → events → Watcher + Hot Leads (parallel, withRetry) → if hot/blazing, Sales QR cascade → Hebrew draft. All 5 prompts pass anti-AI sweep. PII scrubber covers all Israeli phone formats. Cleanup cron + recovery cron run daily. **Post-Stage-1 polish (1.6-1.13) also complete:** onboarding banner; tenant settings page; agents overview page; `src/app/dashboard/actions.ts` refactored into 7 focused files under `actions/`; **alerts inbox at `/dashboard/alerts`**; **manager reports list + detail at `/dashboard/reports`** with explicit mark-as-read CTA + render-time `stripAiTellsDeep`; **inventory upload race fix** via `InventoryActionProvider` Client Context coordinating cross-component state on the otherwise Server-Component-rooted `/dashboard/inventory` page; **npm audit cleared to 0 vulnerabilities** via `overrides: { postcss: ^8.5.10 }` in package.json (not `npm audit fix --force`, which would have downgraded next from 16.2.4 to 9.3.3); **inventory schema hotfix** (removed unsupported `minimum: 1` on integer field — Anthropic structured outputs rejected it, the agent had been silently failing 100% in prod); **print/PDF support** via `window.print()` + Tailwind `print:` variants on inventory + manager reports detail pages. Verified live in production. Pre-launch — no real customers yet.
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

**Page-specific server actions:** New pages (settings 1.7, alerts 1.10, reports 1.11) get their OWN `actions.ts` co-located with the page (e.g. `src/app/dashboard/alerts/actions.ts`, `src/app/dashboard/reports/actions.ts`). They import shared helpers from `@/app/dashboard/actions/_shared` but don't go through the top-level re-export shim. This keeps page-scoped logic close to the page.

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
- 10 agents stay 10 (9 customer-facing + 1 cleanup; Growth is the 10th customer-facing, added 1.15)
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
│   │   │   ├── reports/                        # 1.11 — manager reports list + detail
│   │   │   │   ├── page.tsx                   # list view: latest expanded + compact history
│   │   │   │   ├── actions.ts                 # getManagerReport(reportId) — page-scoped
│   │   │   │   └── [id]/page.tsx              # detail view: chrome + breadcrumb + ManagerReportCard
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
│   │   │   ├── print-button.tsx               # 1.13 — window.print() Client Component
│   │   │   └── ... shadcn primitives
│   │   ├── admin/
│   │   ├── dashboard/
│   │   │   ├── sidebar.tsx                    # 1.6: Showcase added to NAV_ITEMS, admin gate removed
│   │   │   ├── mobile-drawer.tsx              # 1.6: same as sidebar
│   │   │   ├── onboarding-banner.tsx          # 1.6
│   │   │   ├── settings-form.tsx              # 1.7
│   │   │   ├── agent-overview-card.tsx        # 1.8
│   │   │   ├── alerts-list.tsx                # 1.10
│   │   │   ├── report-mark-read-button.tsx    # 1.11 — explicit mark-as-read (Client Component)
│   │   │   ├── inventory-action-context.tsx   # 1.12 — Provider lifting uploadInProgress across page
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
├── supabase/migrations/                       # 23 files. Latest: 023 (Growth Agent).
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

Bucket values: `cold` · `warm` · `hot` · `blazing` · `spam_or_unclear`. Sales QR cascade triggers on `hot` and `blazing` only.

### 5.3 drafts Table
Sales writes two distinct draft types:

| draft.type | Created by | When | TTL |
|---|---|---|---|
| `sales_followup` | `runSalesAgent` (cron) | Stuck leads (3+ days) | 24h |
| `sales_quick_response` | `runSalesQuickResponseOnEvent` (webhook cascade) | Fresh hot/blazing | 24h |

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
   - **(1.3.5):** if bucket ∈ {hot, blazing}, fire `runSalesQuickResponseOnEvent` via `waitUntil()`. Cold/warm/spam don't cascade.
   - **Recovery cron (1.5.2):** `/api/cron/hot-leads-sales-recovery` runs daily at `0 2 * * *` UTC.
     - Stage 1: scans events from last 48h with no matching `hot_leads` row, runs classification on up to 50.
     - Stage 2: scans hot/blazing leads with no `sales_quick_response` draft, runs cascade.

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
                          bucket ∈ {hot, blazing}?
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

### 10.25 Sub-stage 1.11 — DONE
**Manager reports list + detail at `/dashboard/reports` and `/dashboard/reports/[id]`.**

**Why:** Replaces the דוחות placeholder — one of the 3 remaining 404s tracked in §11.2 before this sub-stage; 2 remain (מרכז בקרה, אמון ופרטיות). Tenants need history of weekly Manager reports — the existing `/dashboard/manager` page presumably shows the latest, but historical comparison requires a list view. Backend was already complete (`listManagerReports`, `getManagerLockState`, `markManagerReportRead`, `triggerManagerAgentAction`) since Stage 1; this sub-stage is purely UI plus one new page-scoped server action.

**Decision (architectural):** Reuse the existing `<ManagerReportCard>` component (used on `/dashboard/manager`) for ALL report rendering. Do NOT duplicate the 5-section JSONB rendering logic. The first iteration of the detail page in this sub-stage did duplicate this — caught and corrected before commit, with the rewrite being ~70% smaller than the duplicate version. The 1.4 lesson (read existing patterns first) applies equally to existing components.

**Four new files:**

NEW:
- `src/app/dashboard/reports/actions.ts` — page-scoped server action `getManagerReport(reportId)`. Returns `{ success, report?, notFound?, error? }`. Tenant-scoped via `.eq("tenant_id", ...)` so cross-tenant access fails closed (notFound), not as wrong-tenant data.
- `src/app/dashboard/reports/page.tsx` — Server Component, full chrome. Loads in parallel: `listManagerReports(12)` + `getManagerLockState()` + `listPendingDrafts()`. Renders empty state with `<RunManagerButton />` if no reports, or latest report via `<ManagerReportCard isLatest />` + compact history of older reports as `<ReportListItem>` linking to `/dashboard/reports/[id]`. Pagination cap at 12 (no "load more" in v1; revisit when a real customer fills it).
- `src/app/dashboard/reports/[id]/page.tsx` — Server Component, full chrome, `max-w-[920px]`. Breadcrumb back to `/dashboard/reports` + `<ReportMarkReadButton>` placed ABOVE the report card so the action is visible without scrolling on long reports + `<ManagerReportCard isLatest>`. NotFound case → `next/navigation` `notFound()`. Other errors → in-page `<ErrorShell>` retaining chrome navigation.
- `src/components/dashboard/report-mark-read-button.tsx` — Client Component. `useTransition` pending state + sonner toast. If `initialReadAt !== null` renders a green "נקרא ב-..." pill (read-only); else an active blue CTA. On click: optimistic local state switch + `markManagerReportRead` + `router.refresh()`. Idempotent at server (the action filters `.is("read_at", null)`); the optimistic switch prevents UI flicker during round-trip.

**Render-time defense-in-depth (1.11 hotfix, separate commit):**
Both pages apply `stripAiTellsDeep(report.report)` before passing to `<ManagerReportCard>`. This catches pre-1.5.1 reports persisted before `manager/run.ts` got `stripAiTellsDeep` at write time (commit `06b686d`), and protects against any future regex-coverage gap. Found in production: existing seed reports contained em-dashes that bypassed the 1.5.1 fix because they were written before it deployed.

**Decision history (Dean's UX answers):**
- (1) mark-as-read: explicit click button (option א) — the 7-day lock is consequential, never auto-fire on view/scroll/hover
- (2) list page layout: latest expanded + compact history (option א)
- (3) empty state: explainer + RunManagerButton (option א)
- (4) pagination: hard-cap at 12 (option ב, simpler than infinite scroll)

**Iron rules reinforced:**
- "AI מסמן, בעלים מחליט" — the mark-as-read button is the explicit decision point that opens the lock
- "Anti-AI hygiene" (§1.9) — render-time strip ensures even pre-1.5.1 data renders clean

### 10.26 Sub-stage 1.12 — DONE (commit `fcd31d5`)
**Inventory upload race fix + npm postcss override + inventory schema hotfix.** Three issues addressed in one sub-stage; the schema hotfix was discovered during smoke test of the race fix and shipped as a follow-up commit.

**(A) In-file race in `inventory-upload-zone.tsx`.** `onDrop` had no guard against `isPending`. If the user dropped a second file during an in-progress upload, the OLD closure's stale `isPending=false` allowed `handleFile` to proceed, scheduling a parallel `startTransition`. Both async functions ran, both wrote snapshots to the DB, the UI took whichever returned last. Fix: `if (isPending) return` at the top of `onDrop`; defensive `if (isPending) { e.target.value = ""; return }` in `onChange` for the rare case where a file picker session was already open when isPending became true.

**(B) Cross-component race between `InventoryUploadZone` and `RunInventoryButton`.** Both rendered on `/dashboard/inventory` but neither knew about the other. Clicking "הרץ עכשיו" mid-upload silently fired `triggerInventoryAgentAction` against the OLD snapshot still in the DB (the new INSERT hadn't completed yet). Result: "הניתוח הושלם — 15 מוצרים נסקרו" message but the analysis was on stale data. SILENT data bug. The parent page is a Server Component (`async function InventoryPage()` + `requireOnboarded()`) so it can't hold `useState` and lift state directly. Fix: new Client Context Provider `<InventoryActionProvider>` (`src/components/dashboard/inventory-action-context.tsx`) that wraps the snapshot panel + results card + upload zone. The upload zone writes its own `isPending` into the context via `useEffect`; the run button reads `uploadInProgress` and ORs it with its own `isPending` to compute `disabled`. Hint text "ממתין לסיום העלאת הקובץ..." shows below the button when blocked. Default context value is `{uploadInProgress: false, setUploadInProgress: () => {}}` — so any future page using one component without the other still works (graceful fallback).

**(C) `npm audit` cleared.** Two moderate-severity advisories on `postcss < 8.5.10` (XSS via unescaped `</style>` in CSS Stringify Output) bundled inside next's nested deps. `npm audit fix --force` would have downgraded next from 16.2.4 to 9.3.3 — a 7-major-version backwards leap that breaks App Router, Server Actions, Tailwind v4, etc. Real risk was effectively zero (postcss is build-tooling here, never sees user-controlled CSS at runtime) but the warnings are noise. Fix: add `"overrides": { "postcss": "^8.5.10" }` to package.json. After `npm install`: `found 0 vulnerabilities`. No breaking changes — postcss 8.5.x is a stable patch line.

**(D) Inventory schema hotfix (separate commit, discovered during 1.12 smoke).** When testing the race fix in production, clicking "הרץ עכשיו" returned a 400 from Anthropic: `output_config.format.schema: For 'integer' type, property 'minimum' is not supported`. The inventory schema (`src/lib/agents/inventory/schema.ts` line 67 in the old version) had `priority: { type: "integer", minimum: 1, ... }` — but Anthropic structured outputs do NOT support `minimum`/`maximum` on integers. Grep across `src/lib/agents/**/schema.ts` revealed: the OTHER 4 schemas (manager, reviews, sales, social) explicitly documented this restriction in their header comments. Inventory was the only outlier — written before the rule was discovered, and never had the warning header added back. The agent had been **silently failing 100% in production** since Stage 1, undetected because no one was running it on real data. Fix: removed `minimum: 1`; added the same "IMPORTANT — Anthropic Structured Outputs restrictions" header comment that the other 4 schemas have, plus an in-place `// DO NOT add minimum: 1 here` comment at the priority field. The description (`"1 = הכי דחוף, critical תמיד 1, low תמיד 2"`) already guides the LLM reliably. Verified post-deploy: agent ran cleanly on a 15-row test CSV, classified correctly (1 critical, 1 low, 8 ok, 4 overstocked, 1 no_movement) with Hebrew insights per product.

**Iron rules reinforced:**
- §2.8 verify-before-coding: read the actual files before designing the fix. The grep for `minimum` across schemas (4 already documented the restriction) was the diagnostic that pointed at the inventory schema as the clear outlier.
- §15.1 commit-test-deploy: the smoke test of (A)+(B) succeeded for the cross-component race (Run button correctly disabled during upload), but exposed the (D) schema bug that had been hiding for months. Smoke testing post-deploy is non-negotiable.

### 10.27 Sub-stage 1.13 — DONE (commit `235d07b` + 2 build fixes)
**Print / Save-as-PDF support for inventory analysis and manager reports.**

**Approach:** `window.print()` triggers the browser's native print dialog. From there the user can either print to a real printer or choose "Save as PDF" as the destination — every modern browser including iOS Safari ships this option. Tailwind's `print:` media query variant marks chrome elements (sidebar, FABs, page emoji, action buttons, upload zone) as `print:hidden` so the printout shows only the report card.

**Why not jsPDF / html2pdf:**
- Hebrew RTL is reliable when the browser uses the page's own DOM and fonts; a re-rendering library would have to handle RTL itself (a known PITA — columns flip, encoding sometimes breaks letters).
- Mobile (iOS Safari) has built-in "Save as PDF" via the print dialog.
- One code path serves both real prints and PDF use cases.
- Zero new dependencies (vs. ~40-80KB for jsPDF + html2canvas).

**Files:**
- NEW `src/components/ui/print-button.tsx` — Client Component, ~50 lines. Single `<Printer>` icon + Hebrew label, calls `window.print()` on click. Self-hides via `print:hidden`.
- `src/app/dashboard/inventory/page.tsx` — chrome wrapped in `print:hidden`; PrintButton in the snapshot panel toolbar (only when an analysis exists, no point printing an empty state); `print:!mr-0` on the sidebar margin wrapper; `print:!shadow-none print:!border-0 print:!bg-transparent print:!p-0` on the snapshot Glass panel to flatten it for print.
- `src/app/dashboard/reports/page.tsx` — chrome wrapped in `print:hidden` so a Ctrl+P from the list page still produces a clean printout of the latest expanded report. No explicit button on the list — to print a historical report, click into its detail page.
- `src/app/dashboard/reports/[id]/page.tsx` — chrome + breadcrumb + action bar all `print:hidden`; PrintButton sits in the action bar next to ReportMarkReadButton.

**Build failure recovery (lesson logged in §15.5 / §15.11):** The first commit `235d07b` failed Vercel's build with 4 TypeScript errors that local `tsc --noEmit` had reported but the deploy script didn't gate on. Two issues: (1) `DEFAULT_LOCK_STATE` field name was `lastReadReportId` from the 1.11 era — actual `ManagerLockState` type now has `unreadReportId` AND `lastReadAt` (renamed + added during the 1.9 refactor when manager.ts moved to `actions/`); (2) `<MobileHeader>` requires `userEmail` prop, which I'd dropped during the refactor for print support. Production was safe — Vercel rejects failed builds, so `app.spikeai.co.il` stayed on commit `fcd31d5` (1.12) throughout. Two follow-up commits fixed the type drift + props. The lesson: deploy scripts must HALT on `tsc` non-zero exit code (see §15.11).

---

### 10.28 Sub-stage 1.14 — Legal Compliance Package v0.1 (commit `bd198a0`)

**Goal:** ship a usable v0.1 set of legal documents and infrastructure (Privacy Policy, Terms of Service, AUP, Cookie Policy, DPA template, sub-processor list, DSAR procedure) plus a Cookie Banner and consent audit log, so prospect demos can begin while a lawyer is engaged for v1.0 review. NOT lawyer-reviewed yet — hand-off ready draft based on the legal research project (Parts 1, 2, 3).

**12 new files + 2 modifications. 23 files changed in commit, 2228 insertions.**

NEW components (`src/components/legal/`):
- `CookieBanner.tsx` — Israeli תיקון 13–compliant cookie banner with **3 equal buttons** (אישור הכל / דחיית הכל / התאמה אישית). localStorage with 24-month TTL. Exposes `reopenCookieBanner()` for triggering from anywhere in the app
- `LegalFooter.tsx` — body-level footer with 7 legal links + cookie settings button. `print:hidden`
- `LegalDocPage.tsx` — server component renders MD via `marked@^18.0.3`
- `SignupConsentCheckboxes.tsx` — granular consent UI for signup. **NOT yet wired** to auth pages; deferred until ToS v1.0 from lawyer

NEW API route:
- `src/app/api/consent/route.ts` — writes consent records to `consent_log` for audit trail. תיקון 13 imposes burden-of-proof requirement on the data controller; route writes IP, user-agent, document type/version, consent state, immutable

NEW public pages (`src/app/(legal)/`):
- `/privacy`, `/terms`, `/aup`, `/cookies`, `/sub-processors`, `/dpa`, `/dsar` — public, server-rendered, RTL Hebrew, accessible without login

NEW Hebrew content (`src/content/legal/`):
- `privacy-policy-he.md` (14.3KB) — based on תיקון 13 mandatory disclosure list
- `terms-of-service-he.md` (15.6KB) — Israeli law + Tel Aviv jurisdiction + liability cap mirrors Anthropic upstream
- `aup-he.md` (8.7KB) — drafts-only covenant + prohibited verticals + Meta WhatsApp AI Providers compliance
- `cookie-policy-he.md` (4.4KB) — 3 cookie tiers (essential / analytics / marketing)
- `dpa-template-he.md` (9.5KB) — Holder-Controller agreement template per Amendment 13
- `sub-processors.md` (2.5KB) — Anthropic, Supabase, Vercel, Resend, Meta + transfer mechanisms

NEW Supabase migration:
- `supabase/migrations/001-legal-compliance.sql` (10.8KB) — 3 tables (`consent_log`, `dsar_log`, `unsubscribe_log`) + RLS policies + indexes + 1 view (`overdue_dsars` flagging DSARs past 30-day SLA). Ran successfully on `ihzahyzejqpjxwouxuhj` on 2026-05-06

MODIFIED:
- `src/app/layout.tsx` — added `<LegalFooter />` and `<CookieBanner />` inside body. Previous attempt had duplicate broken imports (`<CookieBanner />` written as a string inside an import path) — cleaned up
- `src/components/dashboard/sidebar.tsx` — two changes:
  1. **"אמון ופרטיות" link changed from `/dashboard/trust` (404) to `/privacy`.** Stage 3 placeholder now functional. Icon (`ShieldCheck`) + label preserved
  2. **Added quiet legal mini-footer at bottom of sidebar** above the user profile: 4 quick links (`/terms`, `/cookies`, `/sub-processors`, `/dsar`) + a "הגדרות עוגיות" button calling `reopenCookieBanner()`. Styled `text-[11px]` with `var(--color-ink-3)` to be unobtrusive
- `package.json` — added `marked@^18.0.3` for Markdown → HTML

**The "אמון ופרטיות" placeholder question (resolved for v0.1):**
Pre-1.14 the sidebar item pointed to `/dashboard/trust` (no implementation → 404). Post-1.14 it points to `/privacy` — click works immediately, document is comprehensive. **v0.1 mitigation, not final solution.** Final solution (Stage 3): build a proper in-product Trust Center page showing tenant data state, consent state per category, DSAR submission button, ongoing security/compliance status. For v0.1 the tradeoff: 1 line of code change vs 30-60 min new page work, and the legal research established that `/privacy` is what regulators expect at this label anyway.

**Lessons (added to §15):**
- **PowerShell 5.1 on Windows mangles UTF-8 Hebrew in scripts.** Any `.ps1` with Hebrew strings fails with `Unrecognized token` errors because PowerShell reads UTF-8-without-BOM as Windows-1255 (Hebrew code page). Two-session workflow attempted automation 4+ times before defaulting to manual VS Code paste. **For this project: Hebrew strings only via VS Code editing or Notepad-with-BOM saves. NEVER via PowerShell scripts.** Recurring pattern, document permanently.
- **Next.js `(legal)` folder syntax needs PowerShell quote-wrapping.** `dir C:\path\(legal)` fails because parentheses are PowerShell special chars. Use `dir "C:\path\(legal)"`.
- **The "drafts only" architecture is the load-bearing wall for legal compliance.** Primary mitigation under לשון הרע (Sec. 7A statutory damages), Meta's "AI Providers" prohibition (effective Jan 15 2026), and Anthropic's Usage Policy high-risk disclosure requirement. Memorialized in `terms-of-service-he.md` Sec. 5.

**What's NOT done (lawyer-blocking or post-launch deferred):**

| Item | Blocker | Estimated cost |
|---|---|---|
| Lawyer review of v0.1 → v1.0 | Engagement with Tier-2 boutique (Pearl Cohen / Or-Hof / Naomi Assia) | ₪15K–25K fixed-fee package |
| `SignupConsentCheckboxes` integration in `/auth/signup` | Wait for lawyer-approved ToS v1.0 | ~30 min code |
| Cyber + Tech E&O insurance bundle | Quote request to Howden Israel / Lamda Broking | ₪7K–12K/year |
| Spike Engine wordmark trademark filing (Class 42) | None — can file anytime | ~₪3,500 all-in |
| Marketing copy repositioning ("8 AI agents" → "human-approval workspace") | None — Meta AI Providers compliance risk | 0 |

**Status:** deployed to production at commit `bd198a0` on 2026-05-06. All 7 public legal pages live, cookie banner functional, sidebar integrated, Supabase tables receiving writes.

---

### 10.29 Sub-stage 1.15 — Growth Agent (DONE, commits `c9eb8ba` → `38f0bd8`)

**The 10th and final customer-facing agent.** Surfaces revenue opportunities the other 9 agents leave on the table:
1. **Reactivation** — dormant customers (last interaction ≥45 days ago, ≥2 prior interactions)
2. **Lead Discovery** — unresolved interest from existing interactions + (Sprint 3) unanswered Instagram/Facebook DMs

**Iron Rule preserved:** Growth never sends. It produces drafts the owner approves via `/dashboard/growth` (Sprint 2).

**Two sources, one pipeline:**
- **C — Internal interactions:** `events` rows with `provider='whatsapp'`, `event_type='whatsapp_message_received'`, aggregated in JS by `payload->>'contact_phone'`. PostgREST aggregation on jsonb keys is awkward, so we fetch up to 2,000 inbound rows and group in app code (under 50ms).
- **G — Meta Inbox:** `meta_inbox_messages` (new table) for IG/FB DMs received on tenant pages. Sprint 3 wires the Meta webhook + sender; Sprint 1 just provides the storage shape.

**Pipeline (per run):**
1. Open `growth_runs` row (`status='running'`).
2. Load tenant context (`name`, `config.vertical`, `config.tone_notes`, `config.signature_style`).
3. Gather candidates from both sources.
4. **Haiku 4.5 scan** in one batched call — scores each 1-100 with a one-sentence Hebrew reason and goal classification (`reactivation` / `lead_discovery`). Threshold: `>= 60`. System prompt + tenant context wrapped in `cache_control: { type: 'ephemeral', ttl: '1h' }`.
5. Take top 15 by score. For each, build a draft context (last 5 inbound messages from `events`, historical summary from candidate metadata).
6. **Sonnet 4.6 draft** per candidate, in batches of 5 concurrent (Inngest Hobby tier limit). Same caching pattern; first call writes the cache, subsequent reads cost 0.1x base.
7. Insert all successful drafts into `growth_candidates` (status `pending`).
8. Update `growth_runs` with all token counts + cost in ILS + final status (`succeeded` / `partial` / `failed`).
9. (Sprint 1C TODO) WhatsApp digest notification to the owner.

**Status semantics:** `succeeded` = all top-scored drafted, `partial` = some draft failures (logged, not thrown — `Promise.allSettled` per batch), `failed` = fatal error (DB unavailable, tenant missing).

**Cost shape (verified end-to-end on demo tenant):**
- 1 candidate scanned + 1 drafted = **₪0.0319 total** (~₪0.03)
- Haiku scan ~₪0.90/run on 200-candidate batches
- Sonnet drafts ~₪0.04/draft after caching
- Weekly cron + ~2 on-demand runs/month = **~₪3-5/month/tenant** at typical SMB volume

**Cron schedule:** `TZ=Asia/Jerusalem 0 7 * * 0` — Sunday 07:00 IST. DST handled automatically by the TZ prefix.

**On-demand button:** Pro/Chain tier only. 60-minute cooldown via `growth_runs` query. Tier read from `tenants.config.tier`. Fires the same `growth/run.tenant` event as the cron.

**4 new tables (migration `023_growth_agent.sql`):**
- `meta_inbox_messages` — IG/FB DMs (channel, conversation_id, sender, message_text, was_replied, classification)
- `growth_runs` — per-execution telemetry (status, token usage by model, cost in ILS, scanned/candidates/drafts counts)
- `growth_candidates` — opportunities awaiting decision (priority_score, why_explanation, draft_message, status flow: pending → approved → closed/rejected/expired, expires_at default `NOW() + INTERVAL '14 days'`)
- `growth_outcomes` — append-only audit log of state transitions (sent / replied / closed / rejected_by_owner / expired)

All four have RLS using Spike's standard `public.current_tenant_id()` + `public.is_super_admin()` bypass pattern from `003_rls.sql`. Required by Israeli Amendment 13 (in force since Aug 14, 2025).

**File layout:**
```
src/lib/agents/growth/
  types.ts           DB row types + pipeline-internal types (CandidateInput, ScannedCandidate, etc.)
  _shared.ts         Tunable constants + gatherInternalCandidates + gatherMetaCandidates + cost calc
  prompts.ts         HAIKU_SCAN_SYSTEM_PROMPT + SONNET_DRAFT_SYSTEM_PROMPT (both Hebrew) + builders
  schemas.ts         JSON schemas for Anthropic structured outputs (scan + draft)
  scan.ts            Stage 1 — runGrowthScan(candidates, tenantContext)
  draft.ts           Stage 2 — runGrowthDraft(draftInput, tenantContext)
  run.ts             Orchestration entry point — runGrowthAgent({ tenantId, trigger, triggeredBy })

src/lib/inngest/
  client.ts          Singleton Inngest client + INNGEST_EVENTS registry
  functions.ts       weeklyGrowthCron + runGrowthForTenant (Inngest v4 API: triggers inside config)

src/app/api/inngest/route.ts    serve() handler, runtime='nodejs', maxDuration=60
src/app/dashboard/actions/growth.ts    triggerGrowthOnDemand server action
```

**Tunable constants (`_shared.ts`):**
- `DORMANCY_THRESHOLD_DAYS = 45`
- `REACTIVATION_MIN_INTERACTIONS = 2`
- `SCORE_THRESHOLD = 60`
- `MAX_CANDIDATES_PER_RUN = 15`
- `MIN_CANDIDATES_FOR_DIGEST = 3`
- `META_INBOX_LOOKBACK_DAYS = 60`

**Spend cap registration:** `growth: 0.50` ILS in `AGENT_COST_ESTIMATES_ILS` (conservative — actual per-run runs ~₪0.03 to ~₪1.50 depending on candidate count).

**`AgentId` union:** added `"growth"`. `AGENTS` config got an entry with `🌱` emoji and lime gradient (`#84CC16 → #65A30D`) to distinguish from cleanup's emerald. `RATE_LIMIT_MINUTES.growth = 60`.

**End-to-end verification (May 8, 2026):** Synthetic seed of dormant customer "דנה כהן" (4 inbound interactions 60-90 days ago, then silence) → Haiku scored 75/100 with reason "לקוח עם היסטוריה חזקה, נעדר 60 יום, דורש הידברות" → Sonnet generated: *"היי דנה! שמתי לב שפנית לפני כמה שבועות לגבי חידוש הקרטין ולא חזרנו אליך, סליחה על זה. אם את עדיין מחפשת תור, שמחה לבדוק מה פנוי בקרוב."* — picked up the specific service from the last message, used apologetic owner tone, no AI tells. Total cost ₪0.0319.

**What's NOT yet built (Sprint 2 + 3 scope):**
- `/dashboard/growth` UI — Pattern A linear list with [אשר/ערוך/דחה/סגרתי] buttons + ROI stat strip
- Server actions: `approveDraft`, `rejectDraft`, `markClosed`, `editDraft`
- WhatsApp Cloud API send integration (extend existing)
- WhatsApp digest notification to owner after each cron run
- Meta OAuth + IG/FB DM sync (Sprint 3)
- Send via Instagram/Facebook Graph API (Sprint 3)

**Status:** Sprint 1 complete and live in production. Cron will first fire Sunday 07:00 IST. UI work in Sprint 2.

---

## 11. Current Status

### 11.1 What Works ✅ — STAGE 1 COMPLETE + POST-STAGE-1 POLISH
- All 9 customer-facing agents on real DB events, all wrapped in withRetry (Growth uses Promise.allSettled per-batch instead — see §10.29)
- All 9 customer-facing agents have anti-AI hygiene (prompt + post-processing); Growth's Sonnet draft prompt includes the same rules (no em-dash, no hashtags, no AI tells)
- 10th agent (cleanup) implemented as cron
- Login (OTP), Onboarding, Dashboard with KPI strip, Mobile UX
- Approvals, Inventory, Leads, Manager
- Full safety pipeline including comprehensive Israeli PII coverage
- Internal Demo UI (renamed to /dashboard/showcase, public for all users — 1.6)
- **Onboarding banner for new tenants (1.6)**
- **Tenant settings page (1.7)** — owners can edit `owner_name`, `business_name`, gender, vertical
- **Agents overview page (1.8)** — per-agent activity stats
- **`actions.ts` refactored from 1430-line monolith into 7 focused files (1.9)**
- **Notifications inbox at /dashboard/alerts (1.10)** — 4-tab filtering, click-to-read, mark-all-read
- **Manager reports list + detail at /dashboard/reports (1.11)** — latest expanded via existing ManagerReportCard, compact history list, detail view at `/dashboard/reports/[id]` with explicit ReportMarkReadButton CTA triggering the 7-day Manager lock; render-time `stripAiTellsDeep` defense-in-depth on top of write-time strip from 1.5.1
- **Inventory upload race fixed (1.12)** — `InventoryActionProvider` Client Context lifts `uploadInProgress` across the Server-Component-rooted inventory page so RunInventoryButton disables itself while an upload is in flight (was firing on the OLD snapshot, silently producing wrong analyses); also `onDrop` race guards prevent parallel `startTransition` calls when the user drops a second file mid-upload
- **npm audit cleared (1.12)** — `overrides: { postcss: ^8.5.10 }` in package.json forces the patched version inside next's nested deps without downgrading next from 16.2.4 to 9.3.3 (which `npm audit fix --force` would have done)
- **Inventory schema hotfix** — removed unsupported `minimum: 1` constraint on the `priority` integer field; Anthropic structured outputs reject `minimum`/`maximum` on integers, so the inventory agent had been silently failing 100% in production with a 400 since Stage 1. Other 4 schemas (manager, reviews, sales, social) already documented this restriction in their headers; inventory was the outlier
- **Print / Save-as-PDF (1.13)** — `<PrintButton>` triggers `window.print()` on inventory analysis page and manager reports detail page; chrome elements wrapped in Tailwind `print:hidden` so printout shows only the report card. Single code path serves both real prints and "Save as PDF" via the browser's native dialog
- **Legal compliance package v0.1 (1.14)** — 12 new files + sidebar integration. 7 public Hebrew legal pages live at `/privacy`, `/terms`, `/aup`, `/cookies`, `/sub-processors`, `/dpa`, `/dsar`. Cookie banner with תיקון 13–compliant 3-equal-buttons design. Consent audit log to `consent_log` table (24-month retention). DSAR pipeline ready (`dsar_log` + `/dsar` form + 30-day SLA monitoring view). Sidebar "אמון ופרטיות" → `/privacy` (resolved 404) + 4 quiet legal links + cookie settings button at bottom of sidebar. **NOT yet lawyer-reviewed** — ready for hand-off to Tier-2 boutique firm (₪15K-25K fixed-fee package)
- **Sales Cascade Audit & Hardening (1.14.1)** — 10-bug audit triggered by discovery that `SALES_CASCADE_BUCKETS` checked `"burning"` while Hot Leads schema returned `"blazing"`. The cast `(arr as readonly string[]).includes(...)` had silenced TypeScript and let the bug ship invisibly since 1.3.5. Bugs fixed across 9 files in 5 commits (`f609fbe`, `a66fcdf`, `25f65e9`/`97eedf6`, `036a3ba`, `33f7762`, `04f4790`): runtime cron query (`runSalesAgent` `.in("bucket", ...)`); recovery cron Stage 2; demo UI status enum; central `lib/demo/types.ts` union; comments + Hebrew prompts + INTEGRATION-NOTES.md docs; UI form `neutral` → `plural` rename (the `gender-lock.ts` canonical type only ever knew male/female/plural — neutral tenants were silently broken); 3 verticals added to onboarding form (clinic/financial/education) to match settings's 8; `BusinessOwnerGender` shadow type eliminated by re-exporting canonical from `gender-lock.ts`; `VALID_GENDERS` typed as `as const satisfies readonly BusinessOwnerGender[]` for compile-time drift detection; `showcase/actions.ts` UTF-8 mojibake cleaned (57 corrupted bytes: 50 `─`, 1 `∈`, 6 `—`, all from a past Windows-1252→CP437→UTF-8 round-trip). DB migration ran by hand: 0 tenants needed `neutral→plural` update. End-to-end verified in production via `/dashboard/showcase` demo: webhook→Watcher+HotLeads(parallel)→Sales QR cascade→draft, ~6.3s, ~₪0.11 cost. Lessons documented in §15.12 (enum drift) and §15.13 (git amend hazard).
- **Stage 2 MVP — multi-tenant webhook routing + integrations management (1.14.2)** — Pre-1.14.2 every incoming webhook landed on `DEMO_TENANT_ID` (hardcoded); real customers couldn't use the system. Sub-stage 1.14.2 unblocks customer onboarding by introducing `phone_number_id → tenant_id` routing AND a customer/admin-split UI for managing integrations. Components:
  - **DB**: `supabase/migrations/022_integrations_whatsapp_phone_lookup.sql` adds partial UNIQUE index `idx_integrations_whatsapp_phone` on `(provider, metadata->>'phone_number_id') WHERE provider='whatsapp' AND status='connected'`. Enforces uniqueness AND serves the webhook hot path. Provider-specific identifiers (phone_number_id, display_phone_number, whatsapp_business_account_id) live in `metadata` jsonb so the integrations table stays provider-agnostic for future Stripe/GCal additions.
  - **Webhook**: `whatsapp/route.ts` adds `resolveTenant()` helper. Resolution priority: `X-Spike-Tenant-Override` header (preserved for `/dashboard/showcase` demo) → `integrations` table lookup → `DEMO_TENANT_ID` fallback with `console.warn` for visibility. Per-batch `Map<phoneNumberId, tenantId>` cache avoids redundant DB queries on multi-message webhooks.
  - **Customer UI** (`/dashboard/integrations`): read-only display. Hero status banner ("WhatsApp פעיל ומחובר"), `ConnectedDisplay` (status + display_phone_number + Hebrew "מחובר מאז" date), `ManagedByCopy` banner explaining setup is handled by Spike staff. No phone_number_id, no WABA, no manual form, no disconnect button. `PendingSetupState` for tenants without WhatsApp yet (CTA: contact us via chat). `ComingSoonCard` for Stripe (#635bff) and Google Calendar (#4285f4).
  - **Admin UI** (`/admin/integrations`): full management panel. `requireAdmin()` gate. Lists all tenants with WhatsApp status (3-stat strip: total/connected/pending), tenant picker dropdown + clickable list, per-tenant connect form (when not connected) or status display + disconnect button (when connected). Same `--spike-*` design tokens as `/admin` command center. Sidebar shows 2 admin links when `isAdmin={true}` (`מרכז ניהול` + `אינטגרציות (admin)`).
  - **Server actions split**: `app/dashboard/integrations/actions.ts` reduced to types only (no `connectWhatsappIntegration` for customers). `app/admin/integrations/actions.ts` exports `connectWhatsappAsAdmin(tenantId, ...)` and `disconnectIntegrationAsAdmin(integrationId)`. Both handle: (1) `UNIQUE(tenant_id, provider)` — INSERT or UPDATE existing row; (2) `UNIQUE partial(provider, metadata->>'phone_number_id')` — friendly Hebrew error before raw 23505; (3) race conditions with generic "try again" fallback. `disconnectIntegration` is SOFT (status='disconnected', no DELETE) so re-connection works and audit trail is preserved.
  - **Smoke tested end-to-end** in production Supabase: INSERT row with phone_number_id='TEST_PHONE_999' → SELECT lookup returns DEMO_TENANT → `EXPLAIN ANALYZE` shows `Index Scan using idx_integrations_whatsapp_phone` (0.098ms execution, sub-ms) → duplicate INSERT correctly rejected with 23505 on `integrations_tenant_id_provider_key`. Test row deleted post-verification.
  - **Architectural lesson**: original `/dashboard/integrations` exposed phone_number_id + WABA + a manual connect form to end customers. That violated the product principle "customers should not handle technical setup". The customer/admin split fixes this — Spike sales staff handles all OAuth/credential bits during onboarding calls, customers just see ✓ green status. Lesson documented in §15.14 (PowerShell escape gotcha discovered during this work).
  - **Files**: `supabase/migrations/022_integrations_whatsapp_phone_lookup.sql`, `src/app/api/webhooks/whatsapp/route.ts`, `src/app/dashboard/integrations/{page,actions}.ts`, `src/components/dashboard/integrations-form.tsx`, `src/app/admin/integrations/{page,actions}.ts`, `src/components/admin/admin-integrations-form.tsx`, `src/components/dashboard/sidebar.tsx`. **Commits**: `8a3022f` (DB+webhook), `d7d0055` (initial customer UI), hotfix for `listPendingDrafts()` signature, polish pass (Hero banner + ConnectedCard + Coming Soon cards), `117cd58` (customer/admin split), sidebar admin link followup.
  - **What 1.14.2 unblocks**: Spike can now onboard a real customer manually — Dean inserts integration row via `/admin/integrations`, customer's WhatsApp messages route to their tenant, agents process for them. **What's still blocking real production launch**: Meta Business Verification (external, 2-10 days), HSM template approval (external), `WHATSAPP_APP_SECRET` env var to activate signature verification (currently bypass mode), Embedded Signup UI (replaces manual admin form when Meta App is configured), vault encryption for stored access tokens.
- **Perf overhaul — Edge runtime + React cache + duplicate query elimination (1.14.3)** — Triggered by Dean's report that sidebar navigation felt frozen (1-2s of "nothing happens" after click). Investigation revealed three layered bottlenecks: (1) cold starts on Vercel Hobby tier add 500-1500ms before any code runs; (2) `requireOnboarded()` already fetches user + tenant.config but every page.tsx re-queried `auth.getUser` and `tenants` right after, costing ~200ms × 8 pages; (3) every server action called inside `Promise.all([listPendingDrafts, getManagerLockState, getDashboardKpis, getOnboardingStatus])` runs `getActiveTenant()` independently, each one re-executing `auth.getUser` + `user_settings` lookup, costing ~3 round-trips × 200ms = ~600ms wasted per dashboard load. Sub-stage 1.14.3 fixes all three:
  - **Loading states** (instant feedback): `app/dashboard/loading.tsx` and `app/admin/loading.tsx` added. Next.js streams these immediately on navigation, before page.tsx finishes server-side. Sidebar will flicker once per nav (Sidebar still lives in page.tsx) but the alternative — no feedback at all — felt worse. Long-term fix: lift Sidebar into route-group `layout.tsx` (deferred to Stage 3).
  - **`requireOnboarded` enriched + cached**: now returns `user`, `tenantConfig`, `tenantName` already-fetched (eliminates the duplicate `auth.getUser` + `tenants` lookup in calling pages). Wrapped in React's `cache()` so callers within the same request share one execution. `OnboardedContext` interface gains 3 fields without breaking existing callers (additive only). `/dashboard/page.tsx` updated to use the new fields and removes 3 unused imports (`redirect`, `createClient`, `createAdminClient`). The same pattern applies to 7 other dashboard pages — left for follow-up since each needs careful regression check.
  - **`getActiveTenant` cached**: `src/app/dashboard/actions/_shared.ts` wraps the helper in React's `cache()`. Was called by all 7 dashboard server actions independently — each re-running `auth.getUser` + `user_settings` lookup. Now runs once per request regardless of how many actions invoke it. Net savings on `/dashboard` Promise.all: 3 redundant round-trips × 200ms = ~600ms.
  - **Edge runtime migration**: the dominant latency contributor was Vercel Hobby cold starts (500-1500ms). Edge runtime cold starts in ~50ms instead — 25× faster — without requiring a paid tier upgrade. Tested first on `/admin/integrations` (commit `27eabf4`); confirmed working in production. Then expanded via a one-time `edge-migration.js` script to all 13 page.tsx files under `src/app/dashboard` and `src/app/admin` (commit `5e58d82`). Each got `export const runtime = "edge";` added below `export const dynamic = "force-dynamic";`. The Anthropic SDK, Supabase JS, and Resend SDK are all Edge-compatible. API routes (webhooks, crons) remain on Node since they need Node-specific APIs (raw-body signature verification, longer execution time).
  - **`node:crypto` Edge incompatibility hotfix**: the migration's first build failed because `src/lib/agents/manager/run.ts` imported `randomUUID` from `node:crypto`. Even though only `/dashboard/inventory/page.tsx` directly used the manager actions, the index file `src/app/dashboard/actions.ts` re-exports everything — so the Node-only import transitively poisoned every Edge page that imported anything from actions. Fix: remove the `node:crypto` import, replace `randomUUID()` call sites with `crypto.randomUUID()` (Web Crypto API, globally available in Edge runtime AND Node 19+). The other `node:crypto` user (`api/cron/cleanup/route.ts`) stays on Node runtime so it's unaffected. **Lesson documented in §15.15**.
  - **Result**: Dean confirmed navigation feels noticeably faster post-deploy. Cold start window went from "frozen for 1-2s after click" to "spinner + page" within ~250ms typical, ~1s worst-case. Real production speed-up of ~1-1.5s per first-paint navigation, achieved without paying for Vercel Pro.
  - **Files**: `src/lib/auth/require-onboarded.ts`, `src/app/dashboard/actions/_shared.ts`, `src/app/dashboard/page.tsx`, `src/app/dashboard/loading.tsx` (new), `src/app/admin/loading.tsx` (new), `src/components/admin/admin-integrations-form.tsx` (card-based redesign), all 13 page.tsx files under `src/app/dashboard` and `src/app/admin`, `src/lib/agents/manager/run.ts`. **Commits**: `27eabf4` (Edge experiment on /admin/integrations), `c56161b` (cache wrappers + dashboard query dedup), `5e58d82` (Edge migration to all dashboard+admin pages), node:crypto compat hotfix.
  - **Still pending for full perf optimization**: lift Sidebar into `/dashboard/layout.tsx` (eliminates flicker on nav, currently the last visible UX glitch); apply the requireOnboarded refactor to the 7 remaining dashboard pages; potentially apply `unstable_cache` to slow-changing data like tenant config. None blocking — all polish.
- **Growth Agent — the 10th and final customer-facing agent (1.15)** — Surfaces revenue opportunities from the existing customer base (Reactivation) and unanswered prospect interest (Lead Discovery). Two-stage pipeline: Haiku 4.5 scores a batched candidate pool (1 call) → Sonnet 4.6 drafts personalized Hebrew messages for the top 15 (concurrency 5, prompt caching with 1h ephemeral TTL). Iron Rule preserved: every output is a `pending` row in `growth_candidates`, never sent until owner approves. **Triggers:** Sunday 07:00 IST cron via Inngest (free Hobby tier — 50K executions/month, plenty of headroom for ~500 paying tenants) + Pro/Chain tier on-demand button with 60-min cooldown. **Sources:** internal (`events.payload->>'contact_phone'` aggregated by JS) + Meta Inbox (new `meta_inbox_messages` table; webhook + sender deferred to Sprint 3). **Cost:** verified ~₪0.0319 per single-candidate run; ~₪3-5/month/tenant at typical SMB scale. **End-to-end test on demo tenant:** synthetic dormant customer "דנה כהן" (4 prior interactions 60-90 days ago) → Haiku scored 75/100 → Sonnet generated *"היי דנה! שמתי לב שפנית לפני כמה שבועות לגבי חידוש הקרטין ולא חזרנו אליך, סליחה על זה. אם את עדיין מחפשת תור, שמחה לבדוק מה פנוי בקרוב."* — picked up the specific service from the last message, used apologetic owner tone, no AI tells. **Migration `023_growth_agent.sql`** introduces 4 tables (meta_inbox_messages, growth_runs, growth_candidates, growth_outcomes) all with RLS matching Spike's pattern (Amendment 13 requirement). **Files:** `src/lib/agents/growth/{types,_shared,prompts,schemas,scan,draft,run}.ts`, `src/lib/inngest/{client,functions}.ts`, `src/app/api/inngest/route.ts`, `src/app/dashboard/actions/growth.ts`. **Commits:** `c9eb8ba` (Batch 1A — schema/types/helpers), `b62fd1a` (Batch 1B — scan/draft/orchestration), `2b4da8f` (Batch 1C — Inngest), `38f0bd8` (events.payload jsonb fix). **What's NOT yet built:** dashboard UI at `/dashboard/growth` (Sprint 2), Meta IG/FB DM integration (Sprint 3), WhatsApp digest notification (Sprint 1C TODO). See §10.29 for full details and §15.16-§15.18 for lessons.
- Real-time WhatsApp pipeline (~15-16s end-to-end, ~₪0.04/hot-lead)
- Cleanup cron + Recovery cron daily
- All deployed live to `app.spikeai.co.il`

### 11.2 Pending — Not Blocking 🚧
- **1 sidebar page still 404** (was 2 before 1.14): מרכז בקרה (pause/resume per agent — needs schema migration; defer to post-revenue)
- ~~אמון ופרטיות sidebar 404~~ ✅ RESOLVED in 1.14 (link now points to `/privacy` v0.1; proper Trust Center page deferred to Stage 3)
- ~~`actions.ts` 1430 lines — split~~ ✅ DONE (1.9)
- ~~Race in `inventory-upload-zone` + `run-inventory-button`~~ ✅ DONE (1.12)
- ~~2 moderate npm audit vulnerabilities~~ ✅ DONE (1.12 — postcss override)
- ~~Inventory agent silently failing in prod~~ ✅ DONE (schema hotfix — unsupported `minimum` removed)
- ~~Legal compliance v0.1 (Privacy Policy, ToS, DPA, etc.)~~ ✅ DONE (1.14)
- `integrations` table schema not finalized
- defamation-guard not wrapped in withRetry (low priority)

### 11.2.1 Pending — Lawyer-Blocking (post-1.14)
- **Lawyer engagement** — Tier-2 boutique (Pearl Cohen / Or-Hof Law / Naomi Assia / Erdinast Ben Nathan Toledano / Naschitz Brandes). Fixed-fee SaaS launch package ₪15K-25K covering: (a) review v0.1 markdown documents → produce v1.0; (b) draft customer-signed DPA + AUP from templates; (c) 1-hour call to walk through 15 open questions from legal research Parts 1+2.
- **Cyber + Tech E&O insurance bundle** — Howden Israel / Lamda Broking / Brooks-Keret. Bootstrap minimum: ₪1M Cyber + ₪1M Tech E&O combined ~₪7K-12K/year. **Critical: negotiate "affirmative AI coverage" endorsement.** Required before first paying customer.
- **Spike Engine wordmark trademark** — Class 42 (SaaS) at רשם הסימנים. ~₪3,500 all-in. Not blocking but should file before showing to prospects.
- **Marketing copy repositioning** — "8 AI agents" → "human-approval messaging workspace with AI-assisted drafts". Required for Meta WhatsApp AI Providers compliance (effective Jan 15 2026).
- **`SignupConsentCheckboxes` wiring** in `/auth/signup` — deferred until lawyer ToS v1.0 available (~30 min code).

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
- 1.11 ✅ Manager reports list + detail pages (with render-time stripAiTellsDeep)
- 1.12 ✅ Inventory upload race fix (Provider context) + npm postcss override + inventory schema hotfix (`minimum` removed)
- 1.13 ✅ Print / Save-as-PDF on inventory analysis + manager reports detail

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
- **1.11: ~3h** (would have been ~1.5h without the ManagerReportCard duplication detour — see §15.10)
- **1.12: ~2.5h** total: ~1h race fix design + Provider, ~30min npm overrides, ~1h discovering and fixing the inventory schema hotfix during smoke test
- **1.13: ~1.5h** total: ~30min print pattern design + 4 files, ~1h debugging two rounds of build failures (tsc field-name drift + missing MobileHeader props) — see §15.11

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

### 15.10 Reuse Existing Components Before Building (1.11 lesson)
Before writing a new presentational component, check if one already exists for the same data shape. The 1.11 detail page first iteration re-implemented the entire 5-section JSONB rendering of `<ManagerReportCard>` — a Client Component that already existed at `src/components/dashboard/manager-report-card.tsx` and already handled all the logic. Found before commit, but cost ~1.5h on a sub-stage that should have taken ~1.5h total.

**The check:** before writing JSX for a complex render, search:
```powershell
Get-ChildItem -Recurse "src\components" -Filter "*<thing>*" -Name
```
And ask Dean to share the contents BEFORE writing similar code, not after.

**Variant of §2.12 (read globals.css first).** Same lesson, different file: read existing components for the same domain before re-implementing.

### 15.11 tsc Gate Must HALT The Deploy Script (1.13 lesson)
The 1.13 first commit (`235d07b`) was pushed with TypeScript errors that local `tsc --noEmit` had clearly reported. The deploy script ran `npx tsc --noEmit` AND THEN `git commit && git push && vercel --prod` regardless of the tsc exit code. PowerShell does not auto-stop on errors, so the broken commit landed in `main`. Vercel saved the day by rejecting the failed build (production stayed on the previous good commit), but it cost two extra round-trips to fix and re-deploy.

**The fix to the deploy template — non-negotiable from now on:**

```powershell
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ tsc FAILED — STOPPING. Don't run git commit." -ForegroundColor Red
    exit 1
}
Write-Host "✅ tsc clean — proceeding to commit" -ForegroundColor Green
git add -A
git commit -m "..."
git push
vercel --prod
```

The `if ($LASTEXITCODE -ne 0) { exit 1 }` check after `tsc --noEmit` is mandatory in any PowerShell deploy block. Without it, the commit-push-deploy chain runs even when tsc is screaming. The same `exit 1` pattern can also gate `npm audit` if zero vulns are required, or any other validator.

**Also:** when introducing or refactoring code that uses a custom type, re-read the type definition. The 1.13 build failures came from `DEFAULT_LOCK_STATE` carrying `lastReadReportId` (from the pre-1.9 era) when the type now has `unreadReportId` + `lastReadAt` (renamed + added during the 1.9 refactor when manager.ts moved to `actions/`). The 1.11 deploy succeeded with the old field name because TS happened to be looser at that moment, but later strictness caught it. Lesson: when a type lives in `actions/manager.ts`, grep its definition before constructing default values:
```powershell
Select-String -Path "src\app\dashboard\actions\manager.ts" -Pattern "ManagerLockState" -Context 0,15
```

### 15.12 Enum Drift Hidden by `as const` + readonly Cast (1.14.1 lesson) ⚠️

`SALES_CASCADE_BUCKETS = ["warm", "hot", "burning"] as const` was used as `(SALES_CASCADE_BUCKETS as readonly string[]).includes(bucket)`. The `as readonly string[]` cast silenced TypeScript when `bucket` was a different literal (`"blazing"` from the schema). Result: `.includes("blazing")` returned `false` in production for ~3 weeks (since 1.3.5 cascade introduction) and the highest-intent leads — exactly the ones the cascade exists for — never got Sales QR drafts. The bug was invisible to grep, invisible to tsc, and invisible to runtime errors because `.includes` doesn't throw, it just returns `false`.

**Why the cast existed at all:** without it, tsc errored: `Type 'string' is not assignable to type '"warm" | "hot" | "burning"'`. The "easy" fix was to widen the array type with the cast. The right fix is to narrow the input type, OR to declare the array as the canonical type:

```typescript
// ❌ WRONG — drift between array and bucket value silently allowed
const SALES_CASCADE_BUCKETS = ["warm", "hot", "burning"] as const;
if ((SALES_CASCADE_BUCKETS as readonly string[]).includes(bucket)) { ... }

// ✅ RIGHT — explicit array type, tsc enforces conformance both ways
import type { LeadBucket } from "../types";
const SALES_CASCADE_BUCKETS: LeadBucket[] = ["warm", "hot", "blazing"];
if (SALES_CASCADE_BUCKETS.includes(bucket)) { ... }

// ✅ ALSO RIGHT — keep literal narrowing AND enforce canonical type
const SALES_CASCADE_BUCKETS = ["warm", "hot", "blazing"] as const satisfies readonly LeadBucket[];
```

**The `satisfies` form (TS 4.9+) is the most defensive** because it preserves literal types for downstream narrowing AND fails the compile if anyone adds a non-canonical value to the array. Used in `settings/actions.ts` post-1.14.1 for `VALID_GENDERS`.

**Audit checklist when reviewing other enum-like arrays:**

```powershell
Select-String -Path "src\**\*.ts" -Pattern "as const" -Context 0,2 | findstr /i ".includes"
Select-String -Path "src\**\*.ts" -Pattern "as readonly string\[\]"
```

Either pattern is a smell. The first is fine if the literals match a wider type elsewhere. The second is almost always a drift hazard.

### 15.13 `git commit --amend` Captures Stale File State Mid-Batch (1.14.1 lesson)

During multi-file batched fixes, a hotfix may be delivered after the first round of `Move-Item`s. If the user runs `git add <fix-file> && git commit --amend` BEFORE running the new `Move-Item`, the amend captures the original (un-fixed) file. Local `tsc --noEmit` passes (because the working tree DOES have the fix on disk now, after the eventual Move-Item) but Vercel build fails (because the committed bytes don't have it). Symptom: identical TS error in Vercel that local tsc cleared seconds before push.

**Concrete chain (1.14.1 batch 3):** Claude delivered `onboarding-actions.ts`. Move-Item happened. tsc errored on `OnboardingFormData.vertical` mismatch. Claude delivered a fixed `onboarding-actions.ts`. Dean ran `git add onboarding-actions.ts && git commit --amend --no-edit && git push --force-with-lease` — but the SECOND Move-Item never happened. The amend captured the file as it sat on disk, which was still the un-fixed first delivery. Local tsc (run before the amend) had passed somehow because the working tree had been edited by some other path. Vercel saw the actual git tree and threw the same TS2322. Required a follow-up commit `33f7762` re-doing the fix.

**The protocol — verify-before-amend:**

```powershell
# Before any amend, ALWAYS confirm the working tree matches expectations:
git diff HEAD <file>                     # see exactly what's about to be amended
git diff --cached <file>                 # see what's currently staged

# If both are empty AND you expected changes, the Move-Item didn't happen.
# DON'T amend an empty diff.
```

**When Vercel fails but local tsc just passed (or vice versa):**

```powershell
# Show what's literally in the latest commit:
git show HEAD:<file>                     # full file content as committed
git show HEAD:<file> | findstr /n "<expected-content>"   # quick spot-check

# Compare with working tree:
fc git-version.txt working-tree.txt      # crude but reliable
```

**Bias toward regular commits over amends during multi-batch fixes.** A noisy commit log with a "hotfix follows hotfix" arc is far better than a single broken amend that ships to production. Amend is for last-keystroke typo fixes on a clean feature branch — not for live mid-deploy state juggling.

### 15.14 PowerShell `\"` Does Not Escape — Use `""` Or Avoid Inline Quotes (1.14.2 lesson)

Commit messages with `\"` inside a double-quoted PowerShell string hang the shell in multi-line input mode (`>>` prompt). Reason: PowerShell's escape character is backtick (`` ` ``), NOT backslash. The sequence `\"` is parsed as a literal `\` followed by a string-terminating `"`. Whatever follows becomes orphaned tokens, and depending on what those tokens are (especially if they contain stray quotes), PowerShell will keep waiting for more input until you Ctrl+C.

**Wrong (will hang):**
```powershell
git commit -m "managed by 'ע\"י' team"
#                         ^^ string ends here unexpectedly
```

**Right — option A — double-double quote (the most portable):**
```powershell
git commit -m "managed by 'ע""י' team"
```

**Right — option B — backtick escape (PowerShell-native):**
```powershell
git commit -m "managed by 'ע`"י' team"
```

**Right — option C — rephrase to avoid the inline `"` entirely:**
```powershell
git commit -m "managed by Spike team"
```

For Claude generating commit messages on Dean's behalf, **option C is the rule**: never include `\"`, `'...'` with embedded `"`, or other clever escapes. Bash, zsh, fish, and PowerShell all behave differently — rephrasing is the only universally-portable approach. If a quote MUST be in the message, use either backticks (Markdown style: `` ` `` for code) or just describe the term in words (e.g. "the field tenant_id" instead of `'tenant_id'` with quotes around it).

**Recovery if stuck**: `Ctrl+C` aborts the multi-line input cleanly. No state is committed. Re-run with a fixed message.

This came up during the 1.14.2 customer/admin split commit — the message contained `'ההקמה והניהול ע\"י צוות Spike'` (Hebrew "by Spike team"). The `\"` consumed the closing quote of the outer `"..."` string, the rest of the message became orphaned, and Dean was stuck typing `>>` for several lines before realizing.

### 15.15 `node:crypto` Blocks Edge Runtime — Index Files Transitively Poison Every Importer (1.14.3 lesson) ⚠️

When migrating pages to Edge runtime, the build error was misleading:

```
./src/lib/agents/manager/run.ts:55:1
A Node.js module is loaded ('node:crypto' at line 55) which is not supported in the Edge Runtime.

Import traces:
  #1 [Edge Server Component]:
    ./src/lib/agents/manager/run.ts
    ./src/app/admin/actions.ts

  #2 [Edge Server Component]:
    ./src/lib/agents/manager/run.ts
    ./src/app/dashboard/actions/manager.ts
    ./src/app/dashboard/actions.ts
    ./src/app/dashboard/inventory/page.tsx
```

The trace shows that ONLY `/dashboard/inventory` and `/admin` directly imported the manager. But the build failed for ALL Edge pages — because `src/app/dashboard/actions.ts` is an **index file** that re-exports from `actions/manager.ts`, `actions/leads.ts`, `actions/drafts.ts`, etc. Every page that imports anything from actions transitively loads ALL re-exported modules — including `node:crypto` from manager.

**The lesson has two parts:**

1. **Edge runtime bans `node:*` imports.** Use Web Crypto globals instead. Available in Edge AND Node 19+:
   - `node:crypto` `randomUUID` → `crypto.randomUUID()` (global)
   - `node:crypto` `subtle` → `crypto.subtle` (global)
   - `node:crypto` `getRandomValues` → `crypto.getRandomValues()` (global)
   - For HMAC/hash primitives that the global `crypto.subtle` doesn't expose ergonomically, consider keeping that route on Node runtime instead of Edge.

2. **Index files transitively poison every importer.** A single Node-only import deep in a re-exported module breaks ALL Edge pages that import the index — even if they don't use the offending function. **When migrating to Edge:**
   - Audit every `index.ts` / barrel export your Edge pages reach
   - Verify each re-exported module is Edge-safe (no `node:*` imports, no `Buffer`, no `fs`, no `process.binding`, no `child_process`)
   - If a single helper needs Node, consider exporting it from a dedicated module (`actions/internal-only/...`) that Edge pages NEVER import

**Verification command** (find all `node:*` imports in a project):

```bash
grep -rn 'from "node:' src/
```

Each match needs to be evaluated: Edge-safe replacement, or stays on Node runtime. Don't blindly delete imports without understanding what the replacement does.

**For Spike Engine post-1.14.3**: only `node:crypto` was removed from `manager/run.ts`. The other `node:crypto` user (`api/cron/cleanup/route.ts`) stays as-is because cron routes run on Node runtime — they're not in the user-facing fast path so the cold-start tradeoff doesn't apply.

---

### 15.16 PostgREST Schema Cache Stale After Migration (1.15 lesson) ⚠️

**The bug:** ran migration `023_growth_agent.sql` successfully (4 tables created, 8 RLS policies). Verified `SELECT count(*) FROM growth_runs` returned 0 rows in SQL Editor. Then triggered the Inngest function — and `runGrowthAgent` failed in the FIRST line that touched the new table:

```
[growth/run] failed to insert growth_runs row: Could not find the table 'public.growth_runs' in the schema cache
```

**Why it happens:** Supabase exposes Postgres tables to the application via PostgREST. PostgREST maintains an in-memory schema cache for performance — it does NOT auto-refresh on every DDL statement. Your `CREATE TABLE` succeeded at the database level, but the client SDK (which routes through PostgREST, not direct Postgres) had a stale view of the schema.

The cache eventually refreshes on its own (timer-based), but "eventually" was costing us 5-minute Inngest retry storms (4 attempts at ~75s each — Inngest's default exponential backoff for failed steps).

**The fix — one SQL statement:**
```sql
NOTIFY pgrst, 'reload schema';
```

Run this in SQL Editor immediately after any migration that adds tables. PostgREST listens on the `pgrst` channel and reloads its cache within milliseconds.

**Verification path:** if a freshly-run agent reports "Could not find the table 'public.X' in the schema cache" but `SELECT * FROM information_schema.tables WHERE table_name='X'` shows the table exists — it's the schema cache, not the migration. Run `NOTIFY pgrst, 'reload schema';` and retry.

**Going forward:** every migration that introduces new tables should end with `NOTIFY pgrst, 'reload schema';` as the last statement. Adding this to migration 023 retroactively is unnecessary (cache is now warm), but future migrations should include it.

---

### 15.17 PostgREST `.eq()` Doesn't Work on jsonb Keys — Use `.filter()` (1.15 lesson) ⚠️

**The bug:** the first version of `gatherInternalCandidates` and `buildInternalContext` queried `events` like this:

```typescript
.from("events")
.select("direction, message_text, created_at, metadata")  // ← phantom columns
.eq("phone", phone)                                        // ← phone not a column
```

Both calls SILENTLY succeeded (PostgREST returned an empty result). No error, no warning — just zero rows. The agent reported "no candidates in pool" forever.

**Root cause:** Spike's `events` table is intentionally minimal:
```
id (text), tenant_id (uuid), provider (text), event_type (text),
payload (jsonb), received_at (timestamptz)
```
There is NO `phone` column. NO `direction` column. NO `message_text` column. NO `created_at` column. All of those live INSIDE `payload` (jsonb): `payload->>'contact_phone'`, `payload->>'raw_message'`, etc. Direction is implicit from `event_type` (`whatsapp_message_received` = inbound).

When you call `.eq("phone", phone)`, PostgREST translates that to `WHERE phone = ...` — but Postgres ignores filters on non-existent columns (they're treated as `NULL`), and the query returns 0 rows without error.

**The fix:** PostgREST exposes jsonb-key filtering via the arrow operator in the column expression:

```typescript
.from("events")
.select("payload, received_at")                                // ← real columns
.eq("provider", "whatsapp")
.eq("event_type", "whatsapp_message_received")                  // ← direction implicit
.filter("payload->>contact_phone", "eq", phone)                 // ← jsonb key filter
.order("received_at", { ascending: false })
```

Note: `.filter("payload->>contact_phone", "eq", phone)` not `.eq("payload->>contact_phone", phone)`. Both technically work, but `.filter()` is the documented pattern for jsonb access.

**Going forward:** before querying ANY existing table from a new agent, run this in Supabase SQL Editor first:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = '<table>' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Plus a sample row:
SELECT * FROM <table> LIMIT 3;
```

Don't trust the schema in your head. Don't trust prior agent code that may have predated a schema change. Verify, then code.

---

### 15.18 Inngest v4 Moved Triggers Into the Config Object (1.15 lesson)

**The bug:** new code shipped with v3-shaped `createFunction` calls:

```typescript
inngest.createFunction(
  { id: "growth-weekly-cron", name: "..." },
  { cron: "TZ=Asia/Jerusalem 0 7 * * 0" },           // ← v3: trigger as 2nd arg
  async ({ step }) => { ... }
);
```

`tsc --noEmit` rejected this with 6 errors:
- `Expected 2 arguments, but got 3` (the function signature)
- `Binding element 'event' implicitly has an 'any' type` (handler shape doesn't match the new overload)

**Why:** Inngest's TypeScript SDK v4 (released 2025) made a breaking change: the `triggers` configuration moved INSIDE the first config argument:

```typescript
// New (v4)
inngest.createFunction(
  {
    id: "growth-weekly-cron",
    name: "...",
    triggers: [{ cron: "TZ=Asia/Jerusalem 0 7 * * 0" }],   // ← inside config
  },
  async ({ step }) => { ... }
);

// Multiple triggers also possible:
triggers: [{ event: "user.created" }, { cron: "0 0 * * *" }]
```

The change was motivated by avoiding the "empty array for triggerless functions" awkwardness in v3, but it bites anyone reading older docs/blogs (which still show v3 syntax).

**Going forward:** when adding new Inngest functions, always use `triggers: [...]` (plural, array, inside the first config object). Reference: [Inngest v3→v4 Migration Guide](https://www.inngest.com/docs/reference/typescript/v4/migrations/v3-to-v4).

**Also discovered during 1.15:** the Vercel Marketplace Inngest integration occasionally hangs at the "Save configuration" step (loaded for >5 minutes with no progress). Workaround: skip the marketplace flow, generate event + signing keys manually in the Inngest dashboard (Manage → Event Keys / Signing Keys), add them as Vercel env vars manually, then sync the app via Inngest's "Apps → Sync new app" with the production URL `https://app.spikeai.co.il/api/inngest`. Manual GET requests to that URL return `{"message":"Unauthorized"}` because Inngest v4 defaults to cloud mode and requires signed introspection requests — that response is normal, not a deploy failure.

---

## 16. Commit Conventions

Conventional commits, English subject, Hebrew body OK.
Format: `<type>(<scope>): <subject>`
Scopes: `auth`, `mobile`, `design`, `morning`, `watcher`, `reviews`, `hot_leads`, `social`, `sales`, `inventory`, `manager`, `cleanup`, `approvals`, `onboarding`, `ui`, `db`, `safety`, `whatsapp`, `webhooks`, `agents`, `demo`, `sidebar`, `cron`, `pii`, `settings`, `actions`, `alerts`, `reports`, `print`.

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
> קראתי את CLAUDE.md. Spike Engine — 8 סוכני AI מול לקוח + cleanup פנימי, drafts-only, עברית RTL, Anthropic only. Stage 1 הושלם במלואו (1.1 עד 1.5.5) + Post-Stage-1 polish (1.6 banner+showcase, 1.7 settings, 1.8 agents overview, 1.9 actions refactor, 1.10 alerts inbox, 1.11 reports list+detail, 1.12 inventory race fix + npm overrides + schema hotfix, 1.13 print/PDF). הכל בייצור על app.spikeai.co.il. הצעד הבא הוא Stage 2 (Meta verification + Embedded Signup) או 2 placeholder pages שנשארו (מרכז בקרה, אמון ופרטיות). מה אתה רוצה לעשות?

---

## 18. Appendix

### 18.1 Migrations (23 files)
Active 001-023. Latest: `023_growth_agent.sql` (1.15 — 4 tables for Growth Agent: meta_inbox_messages, growth_runs, growth_candidates, growth_outcomes; all with RLS).
Previous notable: `022_integrations_whatsapp_phone_lookup.sql` (1.14.2 — partial UNIQUE index for webhook tenant routing), `021_drafts_expired_status.sql` (1.5.4 — idempotent enum/text-aware).
Archive: `supabase/migrations/_archive/v1/`.
Note: 009 was skipped during initial scaffold; not a gap to fill.

### 18.2 Selected Commits (newest first)

| Hash | What |
|---|---|
| `38f0bd8` | fix(growth): correct events table schema access in candidate gathering (1.15) |
| `2b4da8f` | feat(growth): Batch 1C - Inngest integration for cron and on-demand triggers (1.15) |
| `b62fd1a` | feat(growth): Batch 1B - Haiku scan, Sonnet draft, and orchestration (1.15) |
| `c9eb8ba` | feat(growth): Batch 1A - DB schema, types, and helpers for the Growth Agent (1.15) |
| TBD | docs: update CLAUDE.md for sub-stages 1.12 + 1.13 + lessons |
| TBD | fix(reports): add lastReadAt to DEFAULT_LOCK_STATE (1.13 build fix continued) |
| TBD | fix(reports): correct ManagerLockState field + MobileHeader props (1.13 build fix) |
| `235d07b` | feat(print): print + Save-as-PDF for inventory + manager reports (Sub-stage 1.13) — INITIAL build failed |
| TBD | fix(inventory): remove unsupported 'minimum' constraint from priority field (schema hotfix) |
| `fcd31d5` | fix(inventory): cross-component race + onDrop guard + postcss override (Sub-stage 1.12) |
| TBD | docs: update CLAUDE.md for sub-stage 1.11 (manager reports + render-time strip) |
| TBD | fix(reports): strip AI tells from manager report payload at render time |
| TBD | feat(reports): manager reports list + detail page (Sub-stage 1.11) |
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
- ReportMarkReadButton → `src/components/dashboard/report-mark-read-button.tsx` (1.11)
- InventoryActionContext → `src/components/dashboard/inventory-action-context.tsx` (1.12 — Provider lifting `uploadInProgress` across the inventory page)
- PrintButton → `src/components/ui/print-button.tsx` (1.13 — `window.print()` trigger)
- Settings server action → `src/app/dashboard/settings/actions.ts` (1.7)
- Alerts server actions → `src/app/dashboard/alerts/actions.ts` (1.10)
- Reports list page → `src/app/dashboard/reports/page.tsx` (1.11)
- Reports detail page → `src/app/dashboard/reports/[id]/page.tsx` (1.11)
- Reports server action → `src/app/dashboard/reports/actions.ts` (1.11 — `getManagerReport(reportId)`)
- Inventory schema → `src/lib/agents/inventory/schema.ts` (DO NOT add `minimum`/`maximum` to integer fields — Anthropic structured outputs reject them; see §10.26)
- Anti-AI strip → `src/lib/safety/anti-ai-strip.ts` (`stripAiTellsDeep<T>(value: T): T` — recursive em-dash + en-dash + hashtag scrubber; applied at write time in 5 agents and at render time in reports pages)
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
