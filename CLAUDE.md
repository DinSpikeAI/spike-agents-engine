# CLAUDE.md — Spike Engine Briefing

> **For Claude (the AI coding assistant) reading this:** This file is your briefing. Read it in full before responding to the user. Do not ask the user to re-explain the project. When this file conflicts with your training data, **this file wins**.
>
> **Last updated:** 2026-05-13 (post-session covering Sprint 3I attempts 1-5 + dashboard runtime fix + agent_runs cleanup). **Major shipped:** `7539dcd` — changed `/dashboard/page.tsx` from `runtime = "edge"` to `"nodejs"`, which fixed 4 previously-broken heavy Sonnet agents (Manager, Sales, Inventory, Social) that were hitting Vercel Hobby's 25s Edge timeout. All 9 customer-facing agents now run successfully via "הרץ עכשיו" buttons (verified end-to-end). DB cleanup of 12 stuck `status='running'` rows in `agent_runs` (some dating back to May 1) was also completed via SQL UPDATE. **Major blocked:** Sprint 3I (Business Context Brief in settings) attempted 5 times across commits `408b4ed` → `cadde7c` → `7580b4d`/`1aa4877` → `331ebb7` → `59feb7b` → `7539dcd`. Settings page renders the new Card 3 textarea correctly, but clicking "שמור הגדרות" still crashes with `ReferenceError: BusinessOwnerGender is not defined at module evaluation` — a Turbopack/SWC bug under `"use server"` + nodejs runtime, documented in new §15.29. Next attempt should rollback to `f19c0fe`, rebuild on Edge runtime (where type erasure works), and add `npm run build` to pre-push checklist per new §15.27. **Prompt caching investigation:** discovered all 5 LLM call sites (Manager, Inventory, Sales×2, Social) are already optimally cached — Inventory and Manager via direct `cache_control` in their `run.ts`, the other three via `withGenderLock` helper in `src/lib/safety/gender-lock.ts` which adds cache automatically. The 30-50% speedup originally proposed from prompt caching is unachievable because the work is already done — see new §15.32. The remaining UX pain ("the agents feel slow") is Sonnet 4.6 generation latency, addressable only via Inngest fire-and-forget (~45-60 min work, deferred). **7 new lessons added (§15.26-§15.32)** documenting all session findings. **Earlier in this period (Sprint 3M, 2026-05-10):** daily auto-send of the Morning agent's Hebrew summary to the **business owner's** WhatsApp at 07:00 IL, validated end-to-end with **Spike's third real WhatsApp delivery** on 2026-05-10 ~22:55 IL: the owner's own daily briefing landing on +972509918196. First Iron-Rule carve-out — "AI מסמן, בעלים מחליט" applies to **customer-facing** messages, owner-self loopback exempt (§15.25). 3M also extracted `lookupWhatsAppIntegration` / `wasContactedInLast24h` / `mapSendErrorToHebrew` to `src/lib/whatsapp/helpers.ts` shared across `actions/drafts.ts`, `actions/growth.ts`, and the new `api/cron/morning/route.ts` — effectively absorbing Sprint 3B. **Three real WhatsApp deliveries from Spike** to a real phone: Growth Reactivation 2026-05-08, Sales quick_response 2026-05-09, Morning daily_summary auto-send to owner 2026-05-10. **The product is functionally complete for design partner #1** apart from the Sprint 3I settings save bug. External blockers only: עוסק מורשה / Meta Business verification / business phone number (paperwork, not code). **Strategic decisions locked — see §19** (pricing now revised to single-package ₪999-1500 direction, see §19.1): BSP 360dialog primary, Meta Cloud direct fallback; wedges = [אשר] button (TM-pending) → voice notes → no-shows ROI; channel = periphery cities + bookkeepers + Achiya rev-share. **Latest commit:** `7539dcd` (dashboard runtime fix + reapplied Sprint 3I — settings still broken on save).

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
- **Vercel Cron (8 jobs in `vercel.json`, all daily-or-less for Hobby tier):**
  - `/api/cron/reset-monthly-spend` (1 0 1 * *) — monthly
  - `/api/cron/social` (30 5 * * 0-4)
  - `/api/cron/sales` (30 7 * * 0-4)
  - `/api/cron/inventory` (30 5 * * 0,3)
  - `/api/cron/watcher` (0 6 * * *) — daily on Hobby; restore to hourly on Pro
  - `/api/cron/cleanup` (0 0 * * *) — 1.5.4
  - `/api/cron/hot-leads-sales-recovery` (0 2 * * *) — 1.5.2
  - `/api/cron/morning` (0 4 * * *) — 3M, daily 07:00 IL = 04:00 UTC. Auto-sends Morning daily summary to **owner** via WhatsApp (not customers). See §10.39.

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
│   │   │   ├── growth/                        # 1.15.1 Sprint 2 Batch 2B — Growth Agent UI route
│   │   │   │   ├── page.tsx                   # edge runtime, RTL, requireOnboarded; renders RoiStrip + cards or EmptyState
│   │   │   │   └── loading.tsx                # streaming skeleton matching the page chrome
│   │   │   ├── actions.ts                     # 1.9 REFACTOR: 81 lines, re-exports only
│   │   │   └── actions/                       # 1.9 NEW: split implementations
│   │   │       ├── _shared.ts                 # helpers: getActiveTenant + checkAgentRateLimit (no "use server")
│   │   │       ├── manager.ts                 # weekly-lock state machine + 3 server actions
│   │   │       ├── agent-triggers.ts          # 7 trigger* functions + 3 internal loaders
│   │   │       ├── drafts.ts                  # listPendingDrafts/approveDraft/rejectDraft
│   │   │       ├── leads.ts                   # listClassifiedLeads/markLeadContacted/dismissLead
│   │   │       ├── reports-kpis.ts            # listManagerReports + getDashboardKpis
│   │   │       ├── inventory.ts               # uploadInventoryCsv + 2 query functions
│   │   │       └── growth.ts                  # 1.15.1 — 6 Growth dashboard actions + triggerGrowthOnDemand
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
│   │   │   ├── growth/                        # 1.15.1 Sprint 2 Batch 2B — Growth Agent UI components
│   │   │   │   ├── OpportunityCard.tsx        # candidate card: score badge + draft + 4 actions + inline confirm panels
│   │   │   │   ├── DraftEditor.tsx            # modal — textarea + 2,000-char counter + save via editGrowthDraft
│   │   │   │   ├── RoiStatStrip.tsx           # 30-day snapshot: drafts created / conversion rate / revenue
│   │   │   │   ├── EmptyState.tsx             # mascot + Sunday-cron hint + Sprint 3 (Instagram) forward link
│   │   │   │   └── OnDemandTriggerButton.tsx  # tier-gated header CTA (Pro/Chain only, 60-min cooldown server-side)
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
| 2 | Morning | haiku-4-5 | Daily cron 07:00 IL (3M) | `agent_runs.output` JSONB + **WhatsApp auto-send to owner** (3M) | ✅ | ✅ |
| 3 | Watcher | haiku-4-5 | Real-time webhook + daily cron | `alerts` | ✅ | ✅ |
| 4 | Reviews | sonnet-4-6 | New review event | drafts (review_reply, platform=google_business_profile → copy-paste) | ✅ | ✅ + Israeli-tone |
| 5 | Hot Leads | haiku-4-5 | Real-time webhook | `hot_leads` + cascade to Sales QR | ✅ | ✅ |
| 6 | Social | sonnet-4-6 | Cron 05:30 (no Sat) | drafts (social_post, platform=manual_paste → copy-paste) | ✅ | ✅ + hashtags removed |
| 7 | Sales | sonnet-4-6 + thinking | TWO entry points §6.8 | drafts (sales_followup × email/IG → copy-paste; sales_quick_response → WhatsApp send) | ✅ | ✅ |
| 8 | Inventory | sonnet-4-6 | Cron 05:30 Sun/Wed | `agent_runs.output` JSONB + `inventory_snapshots.last_analyzed_at` (NOT drafts — see §10.39 for the validation pass that confirmed this) | ✅ | ✅ |

**As of 1.5.3:** ALL 8 agents have anti-AI hygiene at both prompt level AND post-processing level.

**As of Sprint 3M (validation pass on 2026-05-10):** the table above was corrected — pre-3M docs claimed Morning + Inventory write to `drafts`, but the actual code shows Morning writes nowhere except `agent_runs.output` and Inventory writes to `inventory_snapshots`. Sprint 3M added the Morning auto-send pipeline; Inventory remains owner-facing only via the `/dashboard/inventory` UI. The corresponding entry in `SPIKE-DRAFT-EXAMPLES.json` (#7 inventory + #8 morning daily_summary) describes intended-but-unimplemented draft shapes — out-of-sync with prod, low-priority cleanup task.

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

**Token prefix is `--color-*`, NOT `--spike-*`.** Common tokens: `--color-ink`, `--color-ink-2`, `--color-ink-3` (text shades), `--color-glass` + `--color-glass-deep` + `--color-glass-soft` (frosted surfaces), `--color-mist-blue` / `--color-mist-lilac` / `--color-mist-mint` (page backgrounds), `--color-sys-blue` / `--color-sys-green` / `--color-sys-pink` / `--color-sys-amber` (system status colors), `--color-cat-routine` / `--color-cat-content` / `--color-cat-insight` (category accent colors with paired `-fg` foreground tokens), `--color-hairline` + `--color-hairline-s` + `--color-frost-edge` (borders), `--shadow-glass` / `--shadow-glass-deep` / `--shadow-cta` / `--shadow-glass-hover` / `--shadow-cta-hover` (elevation), `--ease-soft` + `--duration-fast/base/slow` (motion). Earlier drafts of this doc and a few onboarding briefs occasionally referenced `--spike-*` — that prefix does NOT exist in the codebase. When in doubt, grep `globals.css`.

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

`requireOnboarded()` returns `{ user, userId, userEmail, tenantId, tenantConfig, tenantName }` (1.14.3 perf change — wrapped in React `cache()`, returns the fully-fetched user + tenant context so callers don't need a second `supabase.auth.getUser()` or duplicate tenants lookup). **NOT** just `{ userId, userEmail, tenantId }` as earlier docs suggested.

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

### 10.30 Sub-stage 1.15.1 — Growth Agent Sprint 2 Batch 2A (DONE)

Server actions backing the upcoming `/dashboard/growth` UI. Six new actions in `src/app/dashboard/actions/growth.ts` (extending the file that started in Sprint 1 with `triggerGrowthOnDemand`):

| Action | Purpose | Status flow |
|---|---|---|
| `listPendingGrowthCandidates()` | Feed the main list. Sorted by `priority_score DESC`, filtered by `expires_at > now()`. | Read-only |
| `getGrowthRoi()` | Stat strip aggregation, last 30 days. Counts created/approved/closed/rejected, sums `closed_value_ils`, computes conversion rate. | Read-only |
| `approveGrowthCandidate(id, editedMsg?)` | Owner approves. Optional inline edit ("edit and approve" in one step). | `pending → approved` |
| `rejectGrowthCandidate(id, reason?)` | Owner says "not relevant". | `pending → rejected` |
| `markGrowthCandidateClosed(id, valueIls?)` | Owner self-reports "I closed this deal", optional revenue. Allowed from any non-terminal status. | `* → closed` |
| `editGrowthDraft(id, newMessage)` | Owner edited the draft message; status stays pending. | `pending → pending` (message updated) |

**Auth model — belt + suspenders:** every action calls `requireOnboarded()` (returns `user`, `tenantId`, `tenantConfig`, `tenantName` already-cached), then double-filters every DB query by `tenant_id` explicitly. Update queries include `.eq("status", "pending")` race guards so two concurrent decisions can't both succeed.

**Iron Rule preserved:** nothing here SENDS. The WhatsApp send wiring is Batch 2C and will be invoked from `approveGrowthCandidate`. The `'sent'` token is an `outcome_type`, NOT a candidate status — status stays `'approved'` once the owner decides; the outcome row records the activity.

**Outcome inserts are non-fatal logs** — the candidate status update is the source of truth. If the audit `growth_outcomes.insert` fails, we log a warning and continue. Reflects the reality that audit is a "nice to have" trail, not a correctness invariant.

**Result shape:** all mutating actions return a discriminated `{ ok: boolean; message: string }` so the UI can show toast messages directly. No throwing on validation errors — only on infrastructure failures.

**Pre-existing `triggerGrowthOnDemand` migrated** from `getActiveTenant()` (returns just `{ tenantId } | { error }`) to `requireOnboarded()` for consistency with the new actions and to eliminate a redundant auth path. Pro/Chain tier gate via `tenantConfig.tier`. 60-min cooldown unchanged.

**Files touched:**
- `src/app/dashboard/actions/growth.ts` (rewrite — both Sprint 1 + Sprint 2A code)

**Commits:** Sprint 2 Batch 2A. Next: Batch 2B (page + components), then Batch 2C (WhatsApp send integration).

---

### 10.31 Sub-stage 1.15.1 — Growth Agent Sprint 2 Batch 2B (DONE)

The dashboard UI for the Growth Agent. Three mini-batches in one work session, each with its own commit so any one is independently revertable.

**Batch 2B-1 — primitives (no interlocking deps).** 4 files:
- `src/app/dashboard/growth/loading.tsx` — streaming skeleton matching the eventual page chrome (header + ROI strip + 3 placeholder cards staggered 120ms apart).
- `src/components/dashboard/growth/RoiStatStrip.tsx` — 3-tile snapshot inside `<Glass>`, tinted with `--color-cat-insight` (same family as Hot Leads/Manager/Inventory). Uses `Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 })` for revenue and a separate `NumberFormat("he-IL")` for counts.
- `src/components/dashboard/growth/EmptyState.tsx` — mascot + Sunday-cron pill + Sprint 3 forward hint (Instagram via Meta Business verification, links to `/dashboard/integrations`). The on-demand button does NOT live here — it sits in the page header so it stays reachable when there ARE candidates.
- `src/components/dashboard/growth/DraftEditor.tsx` — `"use client"` modal. Controlled textarea seeded from `currentMessage`, 2,000-char counter that turns amber at 1,900 + pink past 2,000. ESC + backdrop-click close (blocked while save in flight). `onSaved(newMessage)` callback updates the parent's local state so the card reflects the edit immediately, without waiting for `revalidatePath` round-trip. Uses `import { type MouseEvent } from "react"` for the backdrop-click handler — avoids relying on a global `React` namespace.

**Batch 2B-2a — interactive list + page route.** 3 files:
- `src/components/dashboard/growth/OnDemandTriggerButton.tsx` — 71-line `"use client"` CTA. Tier gate mirrors the server action (Solo sees disabled button + tier-upsell tooltip; Pro/Chain sees primary blue button). Cooldown is enforced server-side and surfaced via the action's `{ ok: false, message }` response — toast it.
- `src/components/dashboard/growth/OpportunityCard.tsx` — 492 lines. Header row (score badge + title + subtitle + meta chips: goal label / channel / phone in `dir="ltr"` / expires-in days). Why-block (Haiku's reasoning, surfaced for transparency). Draft block (whitespace-pre-wrap). 4 actions: `[אשר]` direct, `[ערוך]` opens DraftEditor, `[סגרתי]` toggles inline green panel with optional ₪ value input, `[דחה]` toggles inline pink panel with optional reason. Score badge color-codes: 80+ pink, 60-79 amber, <60 insight-green. `useTransition` keeps the card visually `pointer-events-none opacity-55` during action flight; revalidatePath unmounts it on success.
- `src/app/dashboard/growth/page.tsx` — 160 lines. `runtime = "edge"`, `dynamic = "force-dynamic"`. Calls `requireOnboarded()` and uses the enriched return shape directly (no second auth.getUser). Parallel `Promise.all` for `[listPendingGrowthCandidates, getGrowthRoi, listPendingDrafts]` (the third feeds the sidebar's "דורש אישור" badge — cross-cutting, not Growth-specific). Header has a lime-gradient `<Sprout>` icon container as the visual identity for this feature.

**Batch 2B-2b — sidebar + mobile drawer nav.** 2 files updated, surgical:
- `src/components/dashboard/sidebar.tsx` — added `Sprout` import + a Growth NAV_ITEM between `inbox` and `showcase`. The new item carries an optional `iconBg` field with a lime gradient (`linear-gradient(135deg, #84CC16, #65A30D)`); the render path checks `"iconBg" in item` and wraps the icon in a small gradient container only for that single item, leaving every other row's bare-icon layout untouched.
- `src/components/dashboard/mobile-drawer.tsx` — same diff, scaled up (drawer icons are 17px → container is 22px instead of sidebar's 18px). **Drift noted (NOT fixed in 2B-2b):** drawer's NAV_ITEMS is missing `integrations` and still points `trust` at `/dashboard/trust` (404'd post legal-package). Reconciliation deferred to a separate cleanup batch.

**Bottom-nav untouched.** `bottom-nav.tsx` has 4 fixed mobile tabs (סקירה / אישורים / סוכנים / דוחות). Adding a 5th would make it cramped. Growth is reachable through the hamburger drawer for now; if usage data shows it warrants a tab swap, revisit.

**Single-file replacements via PowerShell `Move-Item`.** The 2B-1 batch was 550 lines, 2B-2a was 723, 2B-2b was 543 — all well over the soft 300-500 target per batch. The Card alone is 492 lines because the two inline confirm panels are tightly coupled to the actions and splitting them would have been artificial. Going over budget for a logically-cohesive unit is fine; the rule is "each batch compiles and runs by itself", not "each batch fits N lines".

**One tsc failure during the run.** `Module '"lucide-react"' has no exported member 'Instagram'`. Lucide v1.x dropped brand logos (Instagram/Twitter/Facebook) over Meta trademark concerns — see §10.32 below. Fixed in-place by swapping to `MessageCircle` (semantically fits "DMs from social media" anyway). Single line of code, single re-download, tsc clean. Total turnaround: ~2 minutes.

**Iron Rule preserved (Batch 2B has no send code).** Approving a candidate flips status `pending → approved` and revalidates. WhatsApp send wiring lives in Batch 2C — see `notes/sprint-2-batch-2c-spec.md`.

**Files touched (totals):**
- 4 new files in 2B-1
- 3 new files in 2B-2a
- 2 file replacements in 2B-2b
- 9 files total, ~1,800 lines net added

**Commits:** Batch 2B-1 (TBD hash), Batch 2B-2a (`65e681d`), Batch 2B-2b (`a831283`).

---

### 10.32 Lucide-React v1 Removed Brand Icons (1.15.1 gotcha) ⚠️

`lucide-react@^1.14.0` (the version pinned in `package.json`) is a **major release** that intentionally removed all brand-logo icons due to a combination of legal restrictions, design consistency concerns, and maintenance reasons. Specifically: `Instagram`, `Twitter`, `Facebook`, and other social-media wordmarks no longer ship as exports.

**Symptom:** `tsc --noEmit` fails with `Module '"lucide-react"' has no exported member 'Instagram'`.

**Workarounds (in order of preference):**

1. **Use a generic semantic icon.** `MessageCircle` for DMs, `AtSign` for handles, `Share2` for social-sharing, `Camera` for photo platforms. Often clearer than the brand logo anyway.
2. **Inline SVG.** Paste the brand mark directly as a small `<svg>` element. ~10 lines per icon, tree-shakable, no dep.
3. **Add `react-icons` as a second dep.** `react-icons/fa` ships brand logos under FontAwesome's brand-icons license. Adds ~30KB to the bundle but is a one-liner per icon.

**Don't:** pin lucide-react back to v0.x just to keep one icon — v1 has all the other improvements you'd lose, and brand drift is the canary for trademark risk in your own product copy too.

**Affected file in 1.15.1:** `src/components/dashboard/growth/EmptyState.tsx` originally tried `import { Instagram } from "lucide-react"`; replaced with `import { MessageCircle } from "lucide-react"`. The Hebrew text in the empty state still mentions "Instagram" by name (it's user-facing copy, not a brand mark we're rendering).

---

### 10.33 Sub-stage 1.15.2 — Growth on Dashboard Grid + Agents Overview + RLS Workaround (DONE)

Two parallel discoveries closed out the Growth dashboard parity work: Growth was missing from the main `/dashboard` agent grid AND from the `/dashboard/agents` overview page, and a latent RLS bug surfaced when actually testing UI reads against real candidate data.

**Batch 2B-3 — dashboard grid (`a05c46a`).** 4 surgical files: `dashboard/page.tsx` (Growth added as 9th entry to local AGENTS array — `id="growth"`, `emoji="🌱"`, `category="routine"`, `button="growth"`), `growth/page.tsx` (h1 "הזדמנויות"→"צמיחה" + count subtitle change), `sidebar.tsx` + `mobile-drawer.tsx` (label "הזדמנויות"→"צמיחה"). The CATEGORY_META.routine label was also broadened — "שגרה יומית"→"שגרה" with tagline "פעולות שגרתיות, יומיות ושבועיות" — because Growth runs weekly (Sunday cron), not daily. The grid render uses a Link button with the same lime gradient as the sidebar Sprout icon — clicking goes to `/dashboard/growth` (which has the actual on-demand trigger in its header). Result: 3x3 grid balanced as routine (morning/watcher/growth), content (reviews/social/sales), insight (manager/leads/inventory).

**Batch 1.15.2 — agents overview page (`eb23672`).** 3 files: `agents/page.tsx` (added `"growth"` to `AGENTS_BY_CATEGORY.routine` + same label broadening), `lib/agents/overview.ts` (added `"growth"` to `ALL_AGENT_IDS` + 2 extra queries against the `growth_runs` table since Growth has its OWN runs table, separate from the shared `agent_runs` per migration 023; status enum maps `'partial'→'succeeded'` because AgentOverview lastStatus type has no partial state and partial means "some drafts landed" — a positive outcome), `agent-overview-card.tsx` (added `import Link from "next/link"` + a `case "growth"` to the RunButton switch returning a Link to `/dashboard/growth` with the same lime-gradient styling — Growth uniquely navigates rather than triggering, mirroring the pattern from the dashboard grid).

**RLS bug found mid-test.** After running the on-demand trigger 3 times in a row, `growth_runs` showed 3 successful runs with `scanned=1, candidates=1, drafts=1` for the latest two — but `/dashboard/growth` showed an empty state. Direct SQL (as service_role, bypassing RLS) confirmed 2 rows of "דנה כהן" with status=`pending` and valid `expires_at`. Tenant alignment was perfect (`active_tenant_id` = `membership_tenant_id` = DEMO_TENANT). Then we simulated the user-scoped read with `BEGIN; SET ROLE authenticated; SET request.jwt.claims TO ...; SELECT current_tenant_id();` — returned `NULL`. The function definition explained why:

```sql
-- public.current_tenant_id():
select nullif((select auth.jwt() #>> '{app_metadata,tenant_id}'), '')::uuid
```

The function reads ONLY from JWT `app_metadata.tenant_id`. Onboarding doesn't set this claim. **Inngest writes succeeded** because the run pipeline uses the service-role admin client (bypasses RLS); **dashboard reads failed silently** because the user-scoped server client respects RLS, the policy resolves `current_tenant_id() = NULL`, and `(tenant_id = NULL)` is false for every row — action returns empty array → EmptyState.

**Workaround applied for the demo tenant only:**

```sql
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('tenant_id', '15ef2c6e-a064-49bf-9455-217ba937ccf2')
WHERE id = '69ea2326-a5cf-4c53-a9ec-866b70e1060f';
```

Then full logout + login (NOT just refresh — JWTs only refresh on re-auth in Spike's OTP flow). After re-login, `auth.jwt() #>> '{app_metadata,tenant_id}'` returns the demo tenant UUID, RLS allows the read, candidates appear. The fix is per-user, won't help any future onboarded tenant. **See §15.20 for the architectural debt and the planned permanent fix (migration 024).**

**Files touched:**
- 4 in 2B-3 (`a05c46a`): `dashboard/page.tsx`, `growth/page.tsx`, `sidebar.tsx`, `mobile-drawer.tsx`
- 3 in 1.15.2 (`eb23672`): `agents/page.tsx`, `agents/overview.ts`, `agent-overview-card.tsx`
- Total: 7 files, ~125 net lines added across both batches (mostly content unchanged — surgical insertions)

**What's NOT yet done:**
- Migration 024 (permanent RLS fix) — see §15.20.
- Sprint 2 Batch 2C (WhatsApp send wiring) — spec at `notes/sprint-2-batch-2c-spec.md`.
- The two AGENTS configs in parallel (`src/lib/agents/config.ts` AGENT_LIST with 10 entries vs `src/app/dashboard/page.tsx` local AGENTS with 9 entries — different shapes, neither is wrong, but consolidation deferred). Tech debt logged.
- Mobile-drawer drift (NAV_ITEMS missing `integrations`, still points `trust` at `/dashboard/trust` which 404s post-legal-package). Carried over from §10.31.

**Commits:** `a05c46a` (Batch 2B-3), `eb23672` (1.15.2 agents overview).

---

### 10.34 Sub-stage 1.15.3 — Sprint 2 Batch 2C — WhatsApp Outbound Send + Growth Approve Wiring (DONE)

The first outbound WhatsApp transport in Spike's history. Before 2C, the engine produced drafts for 9 agents but had **no code path** that actually called the Meta Cloud API — `src/lib/whatsapp/` didn't even exist; only `src/lib/webhooks/whatsapp/` (inbound). 2C built the transport from scratch AND wired it into `approveGrowthCandidate`. Wiring it into the other 9 agents' approve flow (`actions/drafts.ts`) was deliberately deferred to **Sprint 2 Batch 2D** as a separate session — same helper, ~9 callers, nothing tricky, just a different scope.

**New folder: `src/lib/whatsapp/`** with two files. They sit beside the existing `src/lib/webhooks/whatsapp/` (inbound webhook receiver) — separate folders so callers can't accidentally import the wrong shape. Inbound deals with verification tokens, signature validation, payload parsing; outbound deals with phone number IDs, access tokens, error categorization.

**`src/lib/whatsapp/types.ts`** — outbound types only:
- `MetaErrorCategory`: `"auth" | "template_required" | "invalid_number" | "rate_limit" | "transient" | "unknown"` — exhaustive enum so the Hebrew-mapping switch fails to compile if a new category is added without a translation
- `SendWhatsAppMessageInput`: `{ toPhone, messageBody, phoneNumberId, accessToken }` — minimal contract. The caller (action) is responsible for looking up the per-tenant integration; `send.ts` is a pure transport layer
- `SendWhatsAppMessageResult`: discriminated union — `{ ok: true, whatsappMessageId }` or `{ ok: false, errorCategory, errorMessage, metaCode }`

**`src/lib/whatsapp/send.ts`** — Meta Cloud API client:
- `normalizeIsraeliPhoneToE164(raw)`: strips non-digits, then maps `+972...` / `972...` / `0541234567` / `541234567` → `972541234567` (E.164 *without* the leading `+`, which is what Meta accepts in the `to` field). Returns `null` for inputs that don't look like a plausible Israeli number — caller treats null as a permanent error
- `mapMetaErrorToCategory(code, httpStatus)`: translates Meta error codes (131000/131005/131009 → invalid_number, 131026/131051 → template_required, 130429/80007 → rate_limit, 5xx → transient) and HTTP statuses (401 → auth, 429 → rate_limit, 5xx → transient) to internal categories. Documented codes only — unknowns fall through to "unknown" with the raw Meta message preserved
- `sendAttempt(...)`: one fetch attempt with 10s `AbortSignal.timeout(10_000)`, JSON parsing of both success and error responses
- `sendWhatsAppMessage(input)`: orchestrates retries — 5xx and network failures retry up to 2× with exponential backoff (200ms, 400ms); 4xx never retries because they need user action (auth, template required, invalid number)
- Default API version `v22.0` — current stable as of 2026
- Hardcoded rate limit semantics: we don't auto-backoff on 4xx 429 responses (Growth approvals are user-paced anyway; if rate-limited, the user sees the message and waits)

**`src/app/dashboard/actions/growth.ts`** extended in `approveGrowthCandidate`:
- 3 new private helpers (`ServerDb` type alias for the supabase server client):
  - `lookupTenantWhatsAppIntegration(db, tenantId)`: queries `integrations` row (provider='whatsapp', status='connected'), validates that `metadata.phone_number_id` and `metadata.access_token` are both present. Returns discriminated result with reason for the failure (`not_connected` / `missing_credentials` / `db_error`)
  - `wasContactedInLast24h(db, tenantId, customerPhone)`: queries `events` for `whatsapp_message_received` from the same `payload->>contact_phone` in the trailing 24h. Conservative on DB error: returns false (better to tell the user "copy manually" than attempt a send Meta will reject)
  - `mapSendErrorToHebrew(result)`: 6-branch switch over MetaErrorCategory → user-facing Hebrew message
- Extended `approveGrowthCandidate` flow (status update happens FIRST, then send is attempted with multiple early-returns):
  1. Validate (exists, pending, not expired) — unchanged from 2A
  2. Update status to `'approved'` with race guard — unchanged from 2A
  3. **NEW:** Resolve `messageToSend` — edited message OR original draft
  4. **NEW:** If `source !== 'interactions'` → return `ok=true` with "Sprint 3" message
  5. **NEW:** If no `customer_phone` → return `ok=true` with "no contact phone" message
  6. **NEW:** `lookupTenantWhatsAppIntegration` → if not connected, return `ok=true` with precise reason
  7. **NEW:** `wasContactedInLast24h` → if outside, return `ok=true` with "copy manually" message
  8. **NEW:** `sendWhatsAppMessage` → on Meta API failure, return `ok=false` with translated error
  9. **NEW:** Insert `growth_outcomes(outcome_type='sent')`. Non-fatal if insert fails — the message is already out

**Why `ok=true` for all the "approved but couldn't send" cases:** the owner's decision succeeded — status flipped, candidate disappeared from pending list. The send is a transport concern. Surfacing `ok=true` with a precise message ("הלקוח לא פנה ב-24 שעות — העתק ושלח ידנית") matches the user's mental model: their click worked; they're getting context about what to do next. We use `ok=false` only for genuine transmission failures (auth, 4xx, 5xx-after-retry) that warrant a "something went wrong" toast color.

**Iron Rule preservation:** unchanged. The user clicking [אשר] IS the human approval. The send happens AS A RESULT of that click, never autonomously. `sendWhatsAppMessage` itself has no opinion about that — it's a pure transport function — but the only caller in 2C is `approveGrowthCandidate`, which is gated by the user's click.

**24h window detection — Option γ from the spec:** WhatsApp Cloud API requires either (a) the customer initiated a conversation in the last 24h, or (b) we use a pre-approved HSM template. Reactivation candidates (45+ days dormant by definition) ALWAYS fail (a). Templates kill the personalized-Sonnet-draft value. So 2C catches the situation client-side and refuses to send, surfacing the "copy manually" guidance. Real fix (HSM templates) post-launch when we have Meta approval.

**Files touched:** 3
- `src/lib/whatsapp/types.ts` — NEW, 85 lines
- `src/lib/whatsapp/send.ts` — NEW, 273 lines
- `src/app/dashboard/actions/growth.ts` — modified, +258 lines (530 → 788 total)
- 601 insertions, 14 deletions per `git show`

**Testing in production with the demo seed:** `+972541999111` is a synthetic phone with no real WhatsApp presence. Approving any of דנה כהן's candidates results in the "outside 24h window" message — exactly the documented happy path for Reactivation. Verifying the success path requires either a real test phone with a recent inbound to DEMO_TENANT, or moving the demo to a tenant with a fresh Lead Discovery candidate (Sprint 3 dependency).

**Commits:** `dbcb174` (2C — full batch).

---

### 10.35 Sub-stage 1.16 — Dashboard Suspense Streaming Refactor (DONE)

The first targeted perf intervention since 1.14. Single file change, ~165 net lines added, no behavior change, measurable perceived-performance win.

**Diagnosis:** `/dashboard/page.tsx` was using `await Promise.all([listPendingDrafts, getManagerLockState, getDashboardKpis, getOnboardingStatus])` which parallelizes the 4 queries — but blocks the *entire shell render* until the slowest of them resolves. On Vercel Free with cold starts, the user sees a blank screen for 1-2 seconds even though most of the page (Sidebar, Topbar, Agent Grid headers + 9 cards minus the manager button) is fully synchronous content rendered from constants.

**Sanity check on `requireOnboarded`:** during 1.16 investigation we re-read `src/lib/auth/require-onboarded.ts` and confirmed it's been wrapped in React `cache()` since 1.14.3 (the comment at the top of the file mentions it explicitly: *"multiple callers WITHIN A SINGLE REQUEST share the same result"*). So the 4-actions-each-call-requireOnboarded redundancy is already deduped at request scope. Good. Nothing to fix there.

**Refactor approach:** identify which data sources block which UI elements. `pendingCount` (from `listPendingDrafts`) is needed by 4 components in the shell — Sidebar badge, MobileHeader badge, BottomNav badge, Topbar pendingApprovals, KpiStrip pendingApprovals tile, ApprovalBanner gate. So we keep that one query as a blocking await. The other 3 queries each feed exactly one isolated UI region:
- `getDashboardKpis` → KpiStrip's three other tiles (todaysActions, monthlySpend, monthlyCap)
- `getManagerLockState` → only the Manager card's Run button
- `getOnboardingStatus` → only the OnboardingBanner

So each of those gets its own async server component (`KpiStripStream`, `RunManagerButtonStream`, `OnboardingBannerStream`) wrapped in `<Suspense>` with a sensible fallback:
- KpiStrip fallback: render KpiStrip with the already-known pendingApprovals + zeros for the other 3 tiles. Frame 1 already shows the most-relevant KPI correctly; the others hot-swap when data arrives
- Manager button fallback: render `RunManagerButton` with `DEFAULT_MANAGER_LOCK_STATE` (`canRun:true`, no reason). The button looks live, not disabled — no flicker between fallback and resolved states
- OnboardingBanner fallback: `null`. The banner is conditional anyway (only shown to tenants with no real runs); rendering nothing first, then maybe showing it briefly, beats blocking the whole shell

**What changes for the user:** the response stream now sends the shell + agent grid as soon as `requireOnboarded` + `listPendingDrafts` resolve (~150-200ms after function warmup). The 3 streamed sections fill in over the next 100-300ms. Cold start latency is unchanged (you can't fix physics on Free tier), but inside the cold-start envelope the shell appears 100-300ms earlier.

**What does NOT change:** routing, data shape, action signatures, behavior. Everything that worked before still works exactly the same way; it just paints in two passes instead of one.

**Pattern available for re-use:** the same Suspense-around-isolated-data-source pattern can be applied to `/dashboard/approvals`, `/dashboard/agents`, `/dashboard/reports`, `/dashboard/leads`, `/dashboard/inventory` — anywhere a page does a Promise.all and the longest query blocks shell render. Future sub-stage if any of those feel slow in practice.

**File touched:** 1
- `src/app/dashboard/page.tsx` — modified, +124 / -45 (360 → 525 lines net)

**Commit:** `0c78974` (1.16).

---

### 10.36 Sub-stage 1.15.3 — End-to-End Test + Latent RLS Bugs Discovered (2026-05-08 evening session)

The first ever end-to-end production test of Growth's approve-then-send flow on real Meta Cloud API infrastructure. Started as "let me click [אשר] and see WhatsApp arrive on my phone." Ended four hours later with the first real WhatsApp message Spike has ever delivered, two latent RLS bugs uncovered and migrated, and a clear path to production.

**The win:** Spike's first delivered customer-facing message went through a real WhatsApp chat at the end of the session. Hebrew text, generated by Sonnet 4.6 for synthetic dormant customer דנה כהן, sent via Meta Cloud API test mode, received on the founder's personal phone:

> "היי דנה! שמתי לב שפנית לפני כמה שבועות לגבי חידוש הקרטין ולא חזרנו אליך, סליחה על זה. אם את עדיין מחפשת תור, שמחה לבדוק מה פנוי בקרוב."

Same code path that will run for paying customers post-Meta verification. The product is real now.

#### Meta dev account + test environment setup
Documented as repeatable steps in §16.X (this section). Free Meta Developer account → "Spike Engine Dev" app → Business type → "Connect with customers through WhatsApp" use case → auto-created "Din moshe" business portfolio (unverified, fine for test) → API Setup page → Generate access token (scoped to a specific WhatsApp Business Account via OAuth-like consent dialog) → add Israeli phone number as verified recipient (SMS code) → done. ~15 minutes total. Test mode delivers up to 1,000 messages/month to up to 5 verified recipients, free, **without business verification**. Purpose-built for exactly the situation Spike was in: "I want to validate the product before opening a business."

Test mode credentials at session-end:
- `phone_number_id`: `1041650082373051`
- WhatsApp Business Account ID: `830714649625385`
- "From" number (Meta's): `+1 555 628 6720`
- Verified recipient: `+972509918196` (founder's personal phone)
- Access token: 24h temporary; UI's Copy button gives a fresh one each session — older tokens silently invalidate when a new one is generated

#### Two RLS bugs discovered, both latent for months
The end-to-end test surfaced TWO pre-existing RLS bugs that no previous code path had hit. Both would have prevented any real customer from successfully completing an approve-and-send. Both are now fixed via migrations 025 and 026.

**Bug A: `memberships` RLS infinite recursion**

The `memberships_select` policy contains a self-referential subquery on `memberships`. Triggered any time RLS on memberships was evaluated for a row whose user_id ≠ auth.uid() — PostgreSQL's policy evaluator hit the subquery, which triggered RLS evaluation again, recursing without termination. PostgreSQL eventually raises `42P17: infinite recursion detected in policy for relation "memberships"`.

The `integrations_admin_only` policy ALSO references memberships in an inline subquery, so any user-scoped read on integrations indirectly triggered the recursion. Spike's `lookupTenantWhatsAppIntegration` (new in 2C) was the first such reader.

Fix: Migration 025 introduces `user_admin_tenant_ids()` SECURITY DEFINER helper that bypasses RLS on its internal memberships read. Both `memberships_select` and `integrations_admin_only` are rewritten to use this helper instead of inline subqueries. Recursion broken at the function boundary. See §15.21.

**Bug B: `events` only had super_admin RLS**

The events table had a single RLS policy `events_admin_all` requiring `is_super_admin()`. No tenant-scoped SELECT policy existed. So any user-scoped read on events filtered ALL rows out (RLS silently denies, doesn't error). Spike's `wasContactedInLast24h` (new in 2C) was the first user-scoped reader of events.

Fix: Migration 026 adds `events_select_own_tenant` policy with `tenant_id = current_tenant_id()`. Permissive policy combines with the existing super_admin policy via OR. Webhook ingestion (admin client) unaffected. See §15.22.

#### Other gotchas found and resolved during the test
- **Token expiration mid-test.** Meta's "temporary access token" rotates aggressively in dev mode — sometimes within an hour. When the original token from setup invalidated mid-session, the toast switched from "ההודעה נשלחה" to "בעיית גישה ל-WhatsApp" (auth category). Re-clicking "Generate access token" in the Meta UI yields a fresh token; UPDATE the integrations row with the new value.
- **Meta's 24h window vs Spike's check.** Spike's `wasContactedInLast24h` queries Spike's events table. Meta's API enforces ITS OWN 24h window based on Meta's records of inbound messages. Even if Spike's check passes (because we injected a synthetic event for testing), Meta will silently drop the freeform send if its own logs don't show an inbound from the recipient in the last 24h. Resolution for the test: send any text message from the founder's phone TO the test number; opens the window in Meta's records. Production: HSM templates bypass this restriction (post-launch work).
- **Token paste user error.** Twice during the session, the SQL `UPDATE` to set the access_token had `'PASTE_YOUR_24H_TOKEN_HERE'` (the placeholder) in place of the real token. Caught by `LENGTH(metadata->>'access_token')` returning 25 / 21 instead of ~280-290. After the third try (with explicit instructions on Copy → switch tab → select placeholder → paste), the real token landed.

#### Path to production — what changes, what doesn't
**What changes:** the `metadata` jsonb on the `integrations` row. Two fields:
- `phone_number_id` — Meta's ID for the production business phone number (not the test number)
- `access_token` — production permanent token (generated via System User in Meta Business Suite after verification)

**What does NOT change:** any code in `src/lib/whatsapp/` or `actions/growth.ts`. Same `sendWhatsAppMessage`, same approve flow, same Iron Rule preservation. Same migrations.

The architecture is proven. Prerequisites for going live are external (registration paperwork, Meta Business verification taking 2-4 weeks, business phone number) — not code.

#### Files / migrations from this session

| Path | What |
|---|---|
| `supabase/migrations/025_fix_membership_rls_recursion.sql` | New SECURITY DEFINER `user_admin_tenant_ids()` helper; rewrites `memberships_select` and `integrations_admin_only` to use it |
| `supabase/migrations/026_events_select_own_tenant.sql` | New `events_select_own_tenant` policy with `tenant_id = current_tenant_id()` |

No application code changes.

---

### 10.37 Sub-stage 1.15.4 — Sprint 2 Batch 2D — drafts.ts WhatsApp Send Wiring + End-to-End Verification (DONE, commit `f3b04bd`)

The follow-up to 2C: same `sendWhatsAppMessage` helper, wired into `actions/drafts.ts` for the 9 customer-facing agents that produce `drafts` rows (Sales, Reviews, Hot Leads, Social, Manager, Inventory, Watcher, Morning, plus the cleanup agent which doesn't surface drafts). Growth was already done in 2C via `actions/growth.ts`; this batch closes the loop on every other agent.

**Architecture decision: helpers duplicated, not extracted.** The 3 helpers from growth.ts (`lookupTenantWhatsAppIntegration`, `wasContactedInLast24h`, `mapSendErrorToHebrew`) plus 2 new extractor helpers (`extractRecipientPhone`, `extractMessageBody`) live inline in drafts.ts. Intentional choice to keep 2D's blast radius surgical. Extraction to `src/lib/whatsapp/helpers.ts` deferred as a follow-up refactor — not blocking, no scheduled sub-stage.

**`extractRecipientPhone` handles 4 content shapes** found across the 9 agents' draft types:
- `content.whatsappUrl` (regex `/wa\.me\/(\d+)/`) — used by `sales_quick_response`
- `content.toPhone` — direct field
- `content.phone` — alternative field
- `external_target.toPhone` / `external_target.phone` — fallback

Returns `null` if none match. The first sales_quick_response we tested (id `9a7a830b-...`) used `content.whatsappUrl` shape; future agents that produce different shapes are handled defensively.

**`extractMessageBody` tries 4 fields:** `content.messageHebrew`, `content.message`, `content.body`, `content.text`. First non-empty wins. Returns null if all empty.

**Extended `approveDraft` flow** (status flip happens FIRST, then send is attempted):
1. Fetch draft with content + external_target + status (race guard checks pending) — NEW in 2D
2. Status flip to 'approved' with `approved_by` + `approved_at` — existing
3. NEW: If `external_target.platform !== 'whatsapp'` → return `{success: true}` (non-WhatsApp drafts keep existing copy-paste UX)
4. NEW: Extract phone + message via the two new helpers
5. NEW: If either is missing → return `{success: true, message: "אושר. ..."}`
6. NEW: `lookupWhatsAppIntegration` → if not connected, return `{success: true, message: ...}`
7. NEW: `wasContactedInLast24h` → if outside, return `{success: true, message: "אושר. הלקוח לא פנה ב-24 השעות..."}`
8. NEW: `sendWhatsAppMessage` → on Meta API failure, return `{success: false, error: mapSendErrorToHebrew(...)}`
9. NEW: Return `{success: true, message: "ההודעה נשלחה."}` on success

**Return shape extension:** `{success, error?, message?}` where `message` is optional. Backward-compatible with the existing UI consumer that only reads `success` + `error` — UI continued to render generic toasts for now in 2D. **3A made the consumer render `message` via alert (see §10.38).**

**Files touched:** 1
- `src/app/dashboard/actions/drafts.ts` — replaced from 137 lines to 471 lines (+334 net)

**End-to-end verification on 2026-05-09 evening:**

Step 1: revert pre-existing sales_quick_response draft `9a7a830b-c249-4e40-b07d-acb584574c0a` (synthetic customer מוחמד אבו ראס) to status='pending', injected fresh `whatsapp_message_received` event for founder's phone, set draft's `content.whatsappUrl` to `https://wa.me/972509918196?text=test`.

Step 2: navigate to `/dashboard/approvals`, click "אשר ושלח" once.

Step 3: WhatsApp message arrives on founder's phone within ~5 seconds:
> "אהלן מוחמד, שמחנו לשמוע. היום יש לנו אפשרויות פנויות. מתי נוח לך להגיע, בוקר או אחה"צ?"

This is **Spike's second real WhatsApp delivery** (the first being Growth's Reactivation flow on 2026-05-08). Two of the ten agents now have validated end-to-end production paths. The other eight (Reviews, Hot Leads, Social, Manager, Inventory, Watcher, Morning, plus the internal Cleanup) all share the same code path through `approveDraft` — they will deliver the moment a draft of theirs is approved with `external_target.platform === 'whatsapp'` and a valid recipient phone.

**Two latent issues observed during the test, neither blocking 2D ship — BOTH resolved in 3A (§10.38):**

1. **`/dashboard/approvals` UI didn't render `messageHebrew` for sales_quick_response drafts.** The PII-mask badge ("PII הוסתר") was shown but the body text area was empty. Data was intact in DB; send worked correctly (extracts from `content.messageHebrew`). UI display gap: the page rendered `c.draftText` for unrecognized types, but `sales_quick_response` content has `messageHebrew` not `draftText`. **Fixed in 3A** by routing `sales_quick_response` through the existing isSales body branch (which already references `messageHebrew`).

2. **Server action double-execute pattern.** Single click on "אשר ושלח" triggers TWO invocations of `approveDraft` ~milliseconds apart. First invocation succeeds (status flip + send). Second invocation finds status='approved' and returns `{success: false, error: "הטיוטה כבר טופלה."}`. The UI's `window.alert(error)` displayed the error from the second call, masking the first call's success. This is a Next.js 16 / React 19 server action UX issue, not a Spike bug per se. See §15.23 for diagnostic + mitigation pattern. **3A implemented mitigations 1+2** (see §10.38).

**Worse-case behind the visible symptom (discovered during 3A code review):** if the two server-action invocations hit the initial-fetch step concurrently AND both see `status='pending'`, both UPDATEs run with the `WHERE status = 'pending'` race guard. The first matches 1 row; the second matches 0 rows — but **supabase-js does not return an error on 0 rows affected**, so without an explicit row-count check the second invocation proceeds past the UPDATE step and calls `sendWhatsAppMessage`, producing a second WhatsApp delivery to the customer for one click. The §15.23 incident as written described only the lucky case (second fetch sees status='approved'); the unlucky case is a real Iron-Rule-adjacent risk (the customer still got an approval; they just got it twice). **3A's `.select("id")` check on the UPDATE closes this.**

**Meta token expiration during the session** required regenerating the temporary access token twice. Each regeneration: developers.facebook.com → Spike Engine Dev → WhatsApp → API Setup → "Generate access token" → copy → `UPDATE integrations SET metadata = jsonb_set(metadata, '{access_token}', to_jsonb('NEW_TOKEN'::text)) WHERE provider='whatsapp';`. Documented as a known dev-mode pain point — production permanent System User token (post-Meta verification) does not have this rotation problem.

**Iron Rule preserved:** the user clicking [אשר ושלח] IS the human approval. The send happens AS A RESULT of that click, never autonomously. Same architectural commitment as 2C, now applied across all 10 agents.

**Commits:** `f3b04bd` (Sprint 2D — drafts.ts WhatsApp send wiring).

---

### 10.38 Sprint 3A — UI Polish + Double-Execute Hardening (DONE, commit `1ab5a08`)

3A is the post-2D polish session: render the `messageHebrew` body for `sales_quick_response` drafts, render the optional `message` field returned by approveDraft (currently via `alert`; toast migration deferred), and harden against the React 19 / Next.js 16 server-action double-execute pattern documented in §15.23.

**Files touched:** 2
- `src/app/dashboard/actions/drafts.ts` — added `.select("id")` to the status-flip UPDATE in `approveDraft`, added early-return when 0 rows affected with the same `"הטיוטה כבר טופלה."` error string the initial-fetch path returns. ~6 lines net.
- `src/components/dashboard/approvals-list.tsx` — added `isSalesQR = d.type === "sales_quick_response"`, extended `typeLabel` / `headerTitle` / `fullSalesText` / body branch / to handle QR alongside `isSales`. Rewrote `handleApprove` to render `res.message` via alert and to suppress the `"הטיוטה כבר טופלה."` error (refresh silently — §15.23 mitigation #2). Added symmetric suppression to `handleReject`. Added top-level `DOUBLE_EXECUTE_ERROR` constant for the suppression check. ~30 lines net.

**Issues resolved:**

1. **§10.37 issue #1 (messageHebrew not rendered for QR)** — addressed: pre-3A, sales_quick_response fell through to the generic fallback branch which renders `c.draftText` (a field QR drafts don't have). 3A routes it through the existing isSales body branch which references `messageHebrew`. Verified visually on `/dashboard/approvals` after the 3A commit deployed.

2. **§10.37 issue #2 (`message?` field silently dropped)** — addressed: pre-3A, `handleApprove` only rendered `error` via `window.alert`. 3A renders `message` via alert when present, before `router.refresh()`. The user now sees "ההודעה נשלחה.", "אושר. הלקוח לא פנה ב-24 שעות...", or one of the integration-state messages from §10.37's flow, rather than silent refresh.

3. **§15.23 mitigation #1 (server-side idempotency at the data layer)** — implemented: `.select("id")` on the UPDATE, plus an early-return when `data.length === 0`. Critical to close the worst-case behind the visible symptom (described in §10.37): without the row-count check, the unlucky timing (two fetches both see pending) produces a double WhatsApp send. With it, only one call past the UPDATE step ever proceeds to `sendWhatsAppMessage`.

4. **§15.23 mitigation #2 (UI consumer suppresses the "already processed" toast)** — implemented: `handleApprove` checks `res.error === DOUBLE_EXECUTE_ERROR` and refreshes silently. The constant is defined at module scope (not inline) so future call sites and tests can reference it.

**What's NOT done in 3A (deferred):**
- **Sonner Toaster migration.** Still using `window.alert` for both error and message. A clean migration to `<Toaster />` + `toast.success(message)` / `toast.error(error)` is a separate concern — `sonner@^2.0.7` is in package.json but the Toaster mount status in the root layout wasn't audited as part of this scope. Cheap follow-up.
- **§15.23 mitigations 3 + 4 (button disabled-on-click via useTransition + server-side idempotency-key dedupe).** Mitigation 3 is partial: the button already has `disabled={isPending && actioningId === d.id}` but the double-fire happens within the same React commit, so this doesn't catch sub-millisecond double-fires. Mitigation 4 (idempotency-key dedupe) would be the most-robust fix but is real engineering — opening a follow-up only when 1+2 are demonstrably insufficient.

**Verification:** visual check on `/dashboard/approvals` after revert of `9a7a830b-...` to status='pending' confirmed that the QR card now shows "תשובה מהירה" type label, the `messageHebrew` body, and the "פתח בוואטסאפ" + "העתק" + "אשר ושלח" buttons. Live click test to a real Meta token deferred (Meta dev token had expired by 3A session and Dean elected to defer the token-refresh-and-click loop until the next opportunity).

**Iron Rule preserved:** unchanged. The user click is still the human approval; 3A only changes display + double-fire defense.

**Commits:** `1ab5a08` (3A — fix(approvals)).

---

### 10.39 Sprint 3M — Morning Auto-Send to Owner via WhatsApp + helpers extraction (DONE, commit `2e72f78`)

3M is the first Iron-Rule **carve-out** the product ships: the Morning agent's daily Hebrew briefing now auto-delivers to the **business owner's** WhatsApp at 07:00 IL — without an [אשר] click.

**Why a carve-out is OK here.** "AI מסמן, בעלים מחליט" is a promise about **customer-facing** messages — never let AI talk to a customer without owner approval. Morning's recipient is the OWNER receiving their own daily briefing about their own business. Self-loopback. Forcing the owner to approve their own self-summary every morning would be circular UX with zero risk-mitigation value (no third party can be harmed; no PII leaks externally; no brand reputation at stake). Architecturally consistent with Watcher writing to `alerts` and Manager writing to `manager_reports` — those are also owner-facing and skip the drafts/approval flow. Sprint 3M extends the pattern: Morning generates the briefing AND auto-delivers via WhatsApp. Same carve-out template can extend later to Watcher alerts and Manager weekly reports if desired (Sprint 3X / 3Y candidates).

**The validation pass that surfaced this** (preceded the 3M code work):

Sprint 2D's "all 9 agents wired through `approveDraft`" claim turned out to need refinement. A SQL shape-check on the actual production `drafts` table on 2026-05-10 returned only 5 distinct draft types — `reviews/review_reply`, `sales/sales_followup × email`, `sales/sales_followup × instagram_dm`, `sales/sales_quick_response × whatsapp`, `social/social_post × manual_paste`. The two missing types (`morning/daily_summary`, `inventory/reorder_reminder` — both documented in `SPIKE-DRAFT-EXAMPLES.json` with intended shapes) **were never produced in DB**. The agent_runs table showed Morning + Inventory had run successfully ~10 times via manual triggers, but they wrote no rows to `drafts`. Reading the source confirmed: `runMorningAgent` returns the structured output via `runAgent` and never inserts a draft; `runInventoryAgent` updates `inventory_snapshots.last_analyzed_at` and never inserts a draft. The CLAUDE.md §6.1 column claiming "Output: drafts" for both was wrong and §6.1 has been corrected.

So Sprint 2D / 3A's `approveDraft` code path is correct for the 5 draft types that DO go through it. Morning + Inventory are owner-facing and use a different flow. Sprint 3M built the owner-facing flow for Morning.

**Files (4 new + modified, plus vercel.json + DB seed):**

```
src/app/api/cron/morning/route.ts         NEW (~190 lines) — Sprint 3M cron
src/lib/whatsapp/helpers.ts               NEW (~110 lines) — extracted helpers
src/app/dashboard/actions/drafts.ts       UPDATED — imports from helpers (was 471, now 418)
src/app/dashboard/actions/growth.ts       UPDATED — imports from helpers (was 789, now 682)
vercel.json                                UPDATED — 8th cron entry
```

The cron route's per-tenant flow (executed concurrently, capped at 5 parallel):
1. **Idempotency**: skip if `agent_runs` already has a `status='succeeded'` row for this tenant + `agent_id='morning'` since UTC-midnight today. Vercel cron retries + manual triggers within the same UTC day land on `already_ran_today` outcome.
2. **runMorningAgent** → `MorningAgentOutput` (structured: greeting, headline, yesterdayMetrics, thingsCompleted, thingsNeedingApproval, insights, todaysSchedule, callToAction).
3. **renderMorningSummary** — inline renderer in the cron route, renders the struct into a Hebrew WhatsApp body using `*bold*` + emojis + section headers. Schema-required fields always render; nullable / array fields render only when populated to keep the message compact.
4. **Resolve owner_phone** from `tenants.config->>'owner_phone'`. Skip with `no_owner_phone` outcome if absent — this is one-time setup per tenant (admin populates via SQL or future onboarding UI).
5. **lookupWhatsAppIntegration** (from `helpers.ts`). Skip with `no_integration` / `missing_credentials` outcome if not configured.
6. **wasContactedInLast24h(ownerPhone)**. Same Meta 24h-window rule as customer paths — owner must have sent a WhatsApp to Spike's number within 24h for the session message to fly. Outside the window → skip with `outside_24h` outcome (post-Meta-Business-verification this becomes a template-message path; pre-verification, real-customer founders staying in their inbox daily will satisfy this most days).
7. **sendWhatsAppMessage**. On Meta failure → `send_failed` outcome with the categorized error. On success → `sent`.

**helpers.ts extraction (effectively Sprint 3B absorbed):**

Pre-3M, `lookupWhatsAppIntegration` (named `lookupTenantWhatsAppIntegration` in growth.ts), `wasContactedInLast24h`, and `mapSendErrorToHebrew` lived inline in BOTH `drafts.ts` and `growth.ts` — explicitly chosen as duplication in §10.37 to keep 2D's blast radius surgical. 3M needed a third caller (the cron route), and that flipped the cost-benefit on extraction. Single source of truth for all three helpers now lives in `src/lib/whatsapp/helpers.ts`. Function name harmonized to `lookupWhatsAppIntegration` (the "Tenant" prefix was redundant since tenant_id is always a parameter). Type signature uses `SupabaseClient<any, any, any>` so both the admin client (drafts.ts, cron route) and the user-scoped client (growth.ts) work without refactor — both work post-migration 025 because the integrations RLS policy allows admins via `user_admin_tenant_ids()`.

**Forward-compat with Vault encryption (deferred per §11.2 / §19.8):** when the `access_token` migrates from plaintext `integrations.metadata` to `vault.secrets` via a SECURITY DEFINER wrapper, only the body of `lookupWhatsAppIntegration` changes — its signature stays. All three callers benefit transparently.

**Pre-flight setup (one-time, manual):**

```sql
-- Set owner_phone in tenants.config for DEMO_TENANT (and each tenant that wants Morning)
UPDATE tenants
SET config = jsonb_set(coalesce(config, '{}'::jsonb), '{owner_phone}', '"+972509918196"'::jsonb)
WHERE id = '15ef2c6e-a064-49bf-9455-217ba937ccf2';
```

`CRON_SECRET` was already in env from prior cron routes; no change needed.

**End-to-end validation on 2026-05-10 ~22:55 IL:**

Step 1: Manual `curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/morning` after the deploy of `2e72f78` went green on Vercel.

Step 2: First curl → `{"send_failed":1, detail: "auth: בעיית גישה ל-WhatsApp"}`. Meta dev token had rotated (1-3hr TTL per §10.36). Generated a fresh token at `developers.facebook.com → Spike Engine Dev → WhatsApp → API Setup → Generate access token`, ran `UPDATE integrations SET metadata = jsonb_set(metadata, '{access_token}', to_jsonb('NEW_TOKEN'::text)) WHERE provider='whatsapp';`.

Step 3: Hit a side-issue — re-curling returned `{"already_ran_today":1}` because the failed run created an `agent_runs` row with `status='succeeded'` (the agent step succeeded; only the send-step failed, which is outside the agent_runs status). Tried `DELETE FROM agent_runs WHERE id = ...` — blocked by `cost_ledger_agent_run_id_fkey` foreign-key constraint (cost_ledger has rows referencing the run; FK has no ON DELETE CASCADE). Solved with `UPDATE agent_runs SET status = 'failed' WHERE ...` — sidesteps the FK entirely AND is more accurate (the overall outcome was a failure even though the agent step succeeded). See §15.24 for the lesson.

Step 4: Re-curl → `{"sent":1, results:[{"outcome":"sent"}]}`. **Spike's third real WhatsApp delivery** landed on +972509918196 ~5 seconds later: a fully-rendered Hebrew daily briefing.

**Iron Rule note for future Claude sessions:** the carve-out applies ONLY to messages where the **recipient is the owner of the same tenant** that produced the message. Any message that goes to a customer (third party) MUST go through the [אשר] flow. Don't generalize this carve-out to "Morning is special so it can do whatever" — generalize it to the principle: owner-self loopback is auto-OK; customer-facing is never auto. See §15.25.

**What's NOT done in 3M (deferred):**
- **Watcher auto-send (3X candidate)** — Watcher writes to `alerts`, same owner-facing pattern. Could auto-deliver via WhatsApp using the same helpers + cron template. Not blocking.
- **Manager weekly auto-send (3Y candidate)** — Manager writes to `manager_reports` weekly. Could auto-deliver Sunday morning. Same pattern. Not blocking.
- **owner_phone in onboarding UI** — currently set via SQL. Add to onboarding form as a follow-up so future tenants don't need DBA-level access to opt in. Not blocking for design partner #1.
- **Template message path** — once Meta Business verification + approved templates land (paperwork), the `outside_24h` branch can fire a pre-approved template instead of skipping. Until then, founder-grade users staying in their inbox daily will satisfy the 24h window most of the time.

**Commits:** `2e72f78` (3M — Morning auto-send + helpers extraction).

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
  - **Admin UI** (`/admin/integrations`): full management panel. `requireAdmin()` gate. Lists all tenants with WhatsApp status (3-stat strip: total/connected/pending), tenant picker dropdown + clickable list, per-tenant connect form (when not connected) or status display + disconnect button (when connected). Same `--color-*` design tokens as `/admin` command center. Sidebar shows 2 admin links when `isAdmin={true}` (`מרכז ניהול` + `אינטגרציות (admin)`).
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
- **Growth Agent — the 10th and final customer-facing agent (1.15)** — Surfaces revenue opportunities from the existing customer base (Reactivation) and unanswered prospect interest (Lead Discovery). Two-stage pipeline: Haiku 4.5 scores a batched candidate pool (1 call) → Sonnet 4.6 drafts personalized Hebrew messages for the top 15 (concurrency 5, prompt caching with 1h ephemeral TTL). Iron Rule preserved: every output is a `pending` row in `growth_candidates`, never sent until owner approves. **Triggers:** Sunday 07:00 IST cron via Inngest (free Hobby tier — 50K executions/month, plenty of headroom for ~500 paying tenants) + Pro/Chain tier on-demand button with 60-min cooldown. **Sources:** internal (`events.payload->>'contact_phone'` aggregated by JS) + Meta Inbox (new `meta_inbox_messages` table; webhook + sender deferred to Sprint 3). **Cost:** verified ~₪0.0319 per single-candidate run; ~₪3-5/month/tenant at typical SMB scale. **End-to-end test on demo tenant:** synthetic dormant customer "דנה כהן" (4 prior interactions 60-90 days ago) → Haiku scored 75/100 → Sonnet generated *"היי דנה! שמתי לב שפנית לפני כמה שבועות לגבי חידוש הקרטין ולא חזרנו אליך, סליחה על זה. אם את עדיין מחפשת תור, שמחה לבדוק מה פנוי בקרוב."* — picked up the specific service from the last message, used apologetic owner tone, no AI tells. **Migration `023_growth_agent.sql`** introduces 4 tables (meta_inbox_messages, growth_runs, growth_candidates, growth_outcomes) all with RLS matching Spike's pattern (Amendment 13 requirement). **Files:** `src/lib/agents/growth/{types,_shared,prompts,schemas,scan,draft,run}.ts`, `src/lib/inngest/{client,functions}.ts`, `src/app/api/inngest/route.ts`, `src/app/dashboard/actions/growth.ts`. **Commits:** `c9eb8ba` (Batch 1A — schema/types/helpers), `b62fd1a` (Batch 1B — scan/draft/orchestration), `2b4da8f` (Batch 1C — Inngest), `38f0bd8` (events.payload jsonb fix). **Sprint 2 Batch 2A done** (Sub-stage 1.15.1) — 6 dashboard server actions added: `listPendingGrowthCandidates`, `getGrowthRoi`, `approveGrowthCandidate`, `rejectGrowthCandidate`, `markGrowthCandidateClosed`, `editGrowthDraft`. Belt+suspenders auth (RLS + explicit tenant filter + status race guards). All return `{ ok, message }` for direct toast display. See §10.30. **What's NOT yet built:** dashboard UI page at `/dashboard/growth` (Sprint 2 Batch 2B), WhatsApp send integration in approve (Sprint 2 Batch 2C), Meta IG/FB DM integration (Sprint 3), WhatsApp digest notification (Sprint 1C TODO). See §10.29 for full details and §15.16-§15.18 for lessons.
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

### 11.2.2 Specs Ready to Implement

Pre-written design docs that save a future session of design work. All in `notes/` folder, not part of the build.

- **`notes/sprint-2-batch-2c-spec.md`** — Complete spec for the WhatsApp send wiring in `approveGrowthCandidate`. Covers the 24-hour window problem (Reactivation candidates are by definition outside the window — Option γ recommended: detect client-side and refuse to send, surfacing "copy-and-send-manually" guidance to the owner). Error matrix, test plan, ~2 hours of implementation work when ready.
- **`notes/whatsapp-2c-preflight.sql`** — 6 read-only checks against DEMO_TENANT to verify integration setup BEFORE starting 2C session: integration row, status=connected, required metadata fields, plausible token length, recent inbound events for 24h-window testing. Run in Supabase SQL Editor — pass = ready for 2C.
- **`notes/demo-seed-rich.sql`** — Replaces sparse single-customer demo seed with 18 realistic Hebrew customer scenarios for a salon vertical. Names ethnically diverse (Jewish + Arab + Russian), times spread across last 120 days. Exercises all 9 customer-facing agents — Hot Leads (3 examples at varying heat), Reviews (positive + negative), Growth (2 dormant + 2 negative-examples that should NOT pass filter), Inventory question, scheduling, Manager-aggregable patterns. Final query auto-classifies each into 🌱 Growth target / 🔥 Real-time / 💼 Active.

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

### 15.19 `server-only` Types Cannot Be Imported by Client Components — Use the Actions File as the Public API (1.15.1 lesson)

**The pattern:** when an agent has its own `types.ts` (e.g. `src/lib/agents/growth/types.ts`), that file may transitively import from server-only modules (`@anthropic-ai/sdk`, `next/cache`, or it may have `import "server-only";` at the top to prevent leakage of secrets or internal pipeline types). Importing such types from a Client Component (`"use client"`) breaks the build with cryptic "server-only module imported from client" errors.

**The rule:** Client Components must NEVER import from `src/lib/agents/<agent>/types.ts` directly. The public type API for Client Components is the **action file's exports**.

For Growth specifically, the action file `src/app/dashboard/actions/growth.ts` deliberately re-exports the types Client Components need:

```typescript
// src/app/dashboard/actions/growth.ts
export interface PendingGrowthCandidate {
  id: string;
  customerPhone: string | null;
  source: string;
  goal: string;
  priorityScore: number;
  whyExplanation: string;
  candidateLabel: string;
  candidateSubtitle: string | null;
  draftMessage: string;
  draftChannel: string;
  expiresAt: string;   // ISO
  createdAt: string;   // ISO
}

export interface GrowthRoiSnapshot { /* ... */ }
export interface OnDemandTriggerResult { /* ... */ }
```

These are the types `OpportunityCard.tsx`, `RoiStatStrip.tsx` etc. import. They mirror DB row shapes but are flatter / camelCased / nullable-aware — designed for UI consumption, not internal pipeline plumbing.

**Going forward:** every new agent's `types.ts` should declare `import "server-only";` at the top. The action file should re-export the subset of types Client Components need, with UI-friendly camelCase names. Treat the action file as the agent's "public API surface" — `types.ts` is internal to the server pipeline.

**Why we got this right by accident in 1.15.1:** the Growth actions file was written to define its own client-friendly types up front (separate from `GrowthCandidateRow` and `CandidateInput` in `types.ts`). When the Sprint 2 Batch 2B Claude session reading `growth/types.ts` reported "this is server-only, I'll import from actions instead", the architecture already supported that path. Future agents should follow the same separation deliberately rather than relying on it being noticed mid-build.

### 15.20 `current_tenant_id()` RLS Function Reads From JWT — Onboarding Doesn't Set That Claim (1.15.2 lesson) ⚠️ CRITICAL

**Symptom:** dashboard reads on `growth_candidates` (and probably any other table using the `(tenant_id = current_tenant_id())` RLS pattern) silently return empty arrays, even when `requireOnboarded()` correctly resolves the user's tenant and the SQL is correct. Only writes work — because writes go through Inngest's service-role admin client, which bypasses RLS entirely. Reads go through the user-scoped server client, which respects RLS.

**Root cause:**

```sql
CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid AS $$
  select nullif(
    (select auth.jwt() #>> '{app_metadata,tenant_id}'),
    ''
  )::uuid
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

The function reads `tenant_id` from the JWT's `app_metadata` claim. Spike's onboarding flow (sub-stage 1.6 `OnboardingBanner` and the underlying tenant-creation server action) populates `tenants`, `memberships`, `user_settings.active_tenant_id` — but **does NOT update `auth.users.raw_app_meta_data`**. So `auth.jwt() #>> '{app_metadata,tenant_id}'` is `NULL` for onboarded users, `current_tenant_id()` returns `NULL`, and `(tenant_id = NULL)` is false for every row. RLS blocks all reads.

**Why this didn't surface before 1.15.2:** every table built before Growth had its dashboard reads going through either (a) the admin client deliberately (e.g. `getAgentsOverview()`) or (b) RLS policies keyed on `auth.uid() = user_id` rather than tenant (`user_settings`, etc.). Growth was the first table where the dashboard actions use the user-scoped server client AND the RLS policy depends on `current_tenant_id()`. The bug was always present; we just hadn't built code that triggered it.

**Per-user workaround (immediate unblock):**

```sql
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('tenant_id', '<the-user-tenant-uuid>')
WHERE id = '<the-user-id>';
```

Then the user MUST log out and log in again — Spike's OTP flow only refreshes JWTs on re-auth, not on token refresh, and the `app_metadata` claim is baked into the JWT at issuance.

**Permanent fix — SHIPPED in 1.15.2 via migration `024_fix_current_tenant_id.sql` (commits `120f0f8` then `762da80` for file/DB sync):**

```sql
CREATE OR REPLACE FUNCTION public.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select active_tenant_id from user_settings where user_id = auth.uid()
$function$;

NOTIFY pgrst, 'reload schema';
```

**Why simple over coalesce:** the original proposal was a `coalesce(JWT-claim, user_settings.active_tenant_id)` for backwards compat. After running the simpler `select active_tenant_id from user_settings ...` version directly (in the SQL Editor) and verifying that `/dashboard/growth` rendered correctly, we kept the simpler shape. Reasoning: Spike has zero code paths that set `auth.users.raw_app_meta_data.tenant_id` on its own — the JWT path was vestigial. Keeping it as the primary lookup with user_settings as fallback would create the illusion that JWT-claim onboarding is supported, when it isn't. Single canonical path is easier to reason about, easier to audit, and matches how `requireOnboarded()` resolves tenants in the application code.

**Per-user app_metadata cleanup after the migration:** the workaround SQL above (set `tenant_id` claim on the developer's auth.users row) is no longer needed and can be reversed:
```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data - 'tenant_id'
WHERE id = '<the-user-id>';
```
This was done during 1.15.2 cleanup. After the migration, the function reads ONLY from user_settings, so any leftover JWT claim is harmless either way.

**Diagnostic recipe for the next time something silently returns empty:**

1. Run the action's query as service_role (Supabase SQL Editor) — confirms data exists.
2. Verify tenant alignment: `SELECT us.active_tenant_id, m.tenant_id FROM auth.users u LEFT JOIN user_settings us ON us.user_id=u.id LEFT JOIN memberships m ON m.user_id=u.id WHERE u.email = '<email>';` — confirms `requireOnboarded()` resolves to the right tenant.
3. Inspect the RLS policy: `SELECT policyname, cmd, qual::text FROM pg_policies WHERE tablename = '<table>';` — surfaces what `current_tenant_id()` (or whatever) the policy depends on.
4. Get the function body: `SELECT pg_get_functiondef('public.<fn>()'::regprocedure);` — reveals where it reads from.
5. Simulate the user-scoped read inside a transaction:
   ```sql
   BEGIN;
   SELECT set_config('role', 'authenticated', true);
   SELECT set_config('request.jwt.claims', '{"sub":"<user-id>","role":"authenticated"}', true);
   SELECT current_tenant_id() AS resolved;
   -- if NULL → fix pathway
   ROLLBACK;
   ```

**Don't do:** assume RLS is "the same problem" as before — verify the specific function the policy uses and what claim it expects. Different tables in this codebase have different RLS approaches; the root cause for one is not necessarily the root cause for another.

**Don't do:** "fix" by writing onboarding code that updates `app_metadata` per user. That works but adds a new failure mode (forgetting it on a future flow). The function-level fix is the right scope.

---

### 15.21 RLS Policies That Self-Reference Their Own Table = Infinite Recursion (1.15.3 lesson) ⚠️ CRITICAL

**Symptom:** any user-scoped read on `integrations` (or any table whose RLS policy queries `memberships`) returns PostgreSQL error `42P17: infinite recursion detected in policy for relation "memberships"`.

**Root cause:** the `memberships_select` policy contained a self-referential subquery:

```sql
USING (
  user_id = auth.uid()
  OR tenant_id IN (
    SELECT memberships_1.tenant_id
    FROM memberships memberships_1   -- ⚠️ subquery on memberships, INSIDE memberships' own RLS policy
    WHERE memberships_1.user_id = auth.uid()
      AND memberships_1.role = ANY(ARRAY['owner','admin'])
  )
  OR is_super_admin()
)
```

When PostgreSQL evaluates this policy for a row where `user_id != auth.uid()`, the first OR branch is false, so it evaluates the second branch — which queries memberships, triggering RLS evaluation again, which evaluates the policy, which queries memberships, ...

The same anti-pattern lived in `integrations_admin_only`, which queried memberships in an inline subquery. This bug doesn't recursively self-trigger like memberships_select, but it triggers memberships RLS, which then recurses.

**Why this didn't surface before 2C:** every user-scoped read on memberships in earlier code paths happened to filter by `user_id = auth.uid()` exclusively, so the first OR branch returned true and the recursive subquery was never evaluated. The integrations table was only read via the admin client (Inngest, service_role) or written user-scoped (which doesn't trigger SELECT policies). 2C's `lookupTenantWhatsAppIntegration` was the FIRST piece of code to read integrations user-scoped via supabase-js, and it went through `integrations_admin_only` → memberships subquery → recursion.

**Fix shipped in migration `025_fix_membership_rls_recursion.sql`:**

```sql
CREATE OR REPLACE FUNCTION public.user_admin_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tenant_id FROM memberships
  WHERE user_id = auth.uid()
    AND role = ANY (ARRAY['owner'::text, 'admin'::text])
$$;

CREATE POLICY memberships_select ON memberships
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT user_admin_tenant_ids())
    OR is_super_admin()
  );

CREATE POLICY integrations_admin_only ON integrations
  FOR ALL
  USING (tenant_id IN (SELECT user_admin_tenant_ids()) OR is_super_admin())
  WITH CHECK (tenant_id IN (SELECT user_admin_tenant_ids()) OR is_super_admin());
```

The `SECURITY DEFINER` qualifier makes the function execute with the function owner's privileges (postgres / schema owner), bypassing RLS on its internal memberships query. The recursion breaks at the function call boundary.

**Lesson going forward:** never write an RLS policy that queries the same table the policy is on, or that queries a table whose RLS could call back into the originating table. If you need a policy condition that depends on a SELECT on a guarded table, wrap it in a `SECURITY DEFINER` function. This is the canonical PostgreSQL pattern for breaking RLS recursion.

**Diagnostic recipe:**

```sql
-- 1. List policies on the suspected table
SELECT policyname, cmd, qual::text, with_check::text
FROM pg_policies
WHERE tablename = '<table>';

-- 2. Look for inline subqueries on the same table or on a cross-referenced table.
--    Pattern to flag: "tenant_id IN (SELECT ... FROM <same_table_or_cross_ref>)"

-- 3. Confirm recursion by simulating a user-scoped read inside a transaction:
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true);
SELECT * FROM <table> WHERE ...;
-- 42P17 confirms recursion
ROLLBACK;
```

---

### 15.22 New Tables Need Both Tenant SELECT and Admin Policies — Don't Stop at One (1.15.3 lesson) ⚠️

**Symptom:** `wasContactedInLast24h` (private helper in actions/growth.ts) returns `false` for events that demonstrably exist in the database. The function's query returns 0 rows when run user-scoped, but returns the expected row when run service-role.

**Root cause:** the `events` table had ONE RLS policy at the time of 2C:

```sql
CREATE POLICY events_admin_all ON events
  FOR ALL USING (is_super_admin());
```

Only super_admins can read events. Tenant users get filtered to 0 rows by RLS (which filters silently — no error, just empty result). Application code that depends on user-scoped reads returns false negatives.

**Why this didn't surface before 2C:** webhook ingestion uses the admin client (service_role) so writes were unaffected. All reads of events in pre-2C code (agent runs via Inngest, periodic reports) also used the admin client. The Growth approve flow's `wasContactedInLast24h` was the first user-scoped reader.

**Fix shipped in migration `026_events_select_own_tenant.sql`:**

```sql
CREATE POLICY events_select_own_tenant ON events
  FOR SELECT
  USING (tenant_id = (SELECT current_tenant_id()));
```

Permissive policy combines with `events_admin_all` via OR. Tenant users see their own tenant's events; super_admins continue to see everything; webhook ingestion via service_role unaffected. No path for a tenant user to forge events (INSERT still requires super_admin).

**Lesson going forward — checklist for any new table:** when creating a table that will be read by application code, add policies covering BOTH:
- A super_admin / service_role policy for backend ingestion + admin tooling (typically `cmd: ALL` with `is_super_admin()` qual)
- A tenant-scoped SELECT policy for application reads (typically `cmd: SELECT` with `tenant_id = current_tenant_id()` qual)

The second is easy to forget when the table is "for the system" (events, jobs, runs) — but as soon as ANY user-facing code reads it (a dashboard query, an action helper, a draft preview), the missing policy bites.

**Diagnostic recipe — check coverage on a table:**

```sql
-- 1. List all policies on the table
SELECT policyname, cmd, qual::text
FROM pg_policies
WHERE tablename = '<table>';

-- 2. Verify there's at least one policy that:
--    - has cmd = 'SELECT' (or 'ALL')
--    - has a qual that resolves true for the calling auth.uid() in the right tenant
--    - does NOT require is_super_admin() exclusively

-- 3. If unsure, simulate user-scoped read:
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true);
SELECT * FROM <table> WHERE tenant_id = '<tenant>' LIMIT 1;
ROLLBACK;
-- If 0 rows but service-role view shows rows → RLS gap
```

**Don't do:** assume "if writes work, reads work too." They use entirely different policy paths and entirely different clients in a typical Supabase app.

---

### 15.23 Server Actions Can Fire Twice Per Click in React 19 / Next.js 16 (1.15.4 lesson, 3A mitigations) ⚠️

**Symptom (visible):** clicking "אשר ושלח" once on `/dashboard/approvals` triggers two `approveDraft(draftId)` invocations ~ms apart. First succeeds (status flips, WhatsApp sends). Second finds `status='approved'` and returns `{success: false, error: "הטיוטה כבר טופלה."}`. The UI showed the error toast even though the underlying action succeeded.

**Symptom (worst-case, behind the visible one — surfaced during 3A code review):** if both invocations hit the initial-fetch step concurrently AND both see `status='pending'`, both UPDATEs run with the `WHERE status = 'pending'` race guard. The first matches 1 row; the second matches 0 rows — but **supabase-js does not return an error on 0 rows affected**, so without an explicit row-count check the second invocation proceeds past the UPDATE and calls `sendWhatsAppMessage`, producing a second WhatsApp delivery to the customer for one click. This is Iron-Rule-adjacent: the customer still got an approval; they just got it twice. Was a real risk in 2D's drafts.ts before 3A.

**Root cause (suspected, not fully confirmed):** Next.js 16's server action wrapper around React 19 `useTransition` / form-state primitives can re-fire the action under specific timing conditions — particularly when the action triggers a `revalidatePath` or `revalidateTag` that races with the user gesture. The first call commits, the revalidation schedules a re-render, the gesture handler also schedules another call, and the second call hits the now-mutated row.

**Diagnostic recipe:**

```sql
-- After clicking once, query the draft:
SELECT id, status, approved_at, approved_by FROM drafts WHERE id = '...';

-- If approved_at is set AND error toast was shown → confirms double-execute.
-- The status flip ran successfully on the first call; the second call hit
-- the race guard and returned the error.
```

**Mitigations (in order of preference):**

1. **Make the action idempotent at the data layer.** ✅ **Implemented in 3A.** The race guard `WHERE status = 'pending'` on the UPDATE prevents the *status flip* from happening twice, BUT supabase-js does not return an error on 0-rows-affected — so without an explicit row-count check the second invocation would proceed past the UPDATE and call `sendWhatsAppMessage`. 3A adds `.select("id")` to the UPDATE and an early-return when 0 rows affected. The early-return reuses the same `"הטיוטה כבר טופלה."` error string the initial-fetch path returns, so mitigation #2 (UI suppression) handles both cases uniformly.

2. **Treat "already processed" as a success in the UI consumer.** ✅ **Implemented in 3A.** `approvals-list.tsx` `handleApprove` checks `res.error === DOUBLE_EXECUTE_ERROR` (top-level constant set to `"הטיוטה כבר טופלה."`) and `router.refresh()` silently instead of alerting. `handleReject` has symmetric logic for safety though that path doesn't currently fire (rejectDraft has no race guard). The refresh re-fetches `listPendingDrafts` and the just-approved draft drops out of the list, so the user sees the right new state.

3. **Disable the button on click via `useTransition` `isPending`.** Already present in the codebase: `<button disabled={isPending && actioningId === d.id}>`. Doesn't always prevent the second fire because the second fire often happens within the same React commit, but reduces observable double-clicks.

4. **Server-side dedupe by request ID.** Generate a per-click idempotency key, attach to the action call, server-side cache "already-handled" for 5 seconds. Most robust but most code. Open follow-up for if mitigations 1+2 prove insufficient under real customer load.

**Don't do:** add a `setTimeout` or debounce client-side and call it fixed. The double-fire is sub-millisecond, not user-double-click; debouncing won't catch it reliably.

**Don't do:** disable the race guard on the UPDATE just to make the second call "succeed too." That re-introduces a real race condition (concurrent approves from different sessions could both succeed and both attempt to send).

**Why this didn't surface before 2D:** Growth's `approveGrowthCandidate` doesn't have a discrete `status='pending'` row to race-guard the same way (candidates use `decision_status` and the value `'pending'` is the default — the second call hits a row that already has `decision_status='approved'` and the same code returns success). 2D's drafts.ts uses an explicit pending check that surfaces the race as an error message to the UI.

**Why the worst-case wasn't observed in prod before 3A:** small timing window (single user, sub-millisecond), one user clicking, no concurrent-customer load. The possibility was real but the unlucky case statistically rare. Closed pre-customer regardless.

**Open question for future investigation:** is this a Next.js 16 / React 19 known issue, a `'use server'` regression, a Vercel runtime quirk, or interaction-specific? Worth filing a minimal repro and checking against the Next.js GitHub.

---

### 15.24 `agent_runs` FK to `cost_ledger` Blocks DELETE — UPDATE Status to Bypass Idempotency for Re-Test (3M lesson) ⚠️

**Symptom:** trying to delete a recent `agent_runs` row (e.g. to re-test a cron route's idempotency check after fixing whatever made the run fail downstream) returns:
```
ERROR: 23503: update or delete on table "agent_runs" violates foreign key constraint "cost_ledger_agent_run_id_fkey" on table "cost_ledger".
DETAIL: Key (id)=(8089ac3f-...) is still referenced from table "cost_ledger".
```

**Root cause:** the agent run lifecycle (§6.4) reserves spend BEFORE the executor and settles spend AFTER, both of which write rows to `cost_ledger` referencing `agent_runs.id`. The FK on `cost_ledger.agent_run_id` does NOT have `ON DELETE CASCADE` (intentional — cost telemetry is append-only, deletes shouldn't cascade silently). So the `agent_runs` row can't be deleted while cost_ledger entries reference it.

**Why this hits during testing of cron routes with idempotency checks:** the Sprint 3M Morning cron skips a tenant if `agent_runs` already has a `status='succeeded'` row for today. If the agent succeeded but the SEND step failed (e.g. expired Meta token), the row IS `status='succeeded'` (the agent succeeded; the send step is outside agent_runs scope). To re-test the cron after fixing the token, you naturally reach for `DELETE FROM agent_runs ...` — and hit the FK.

**Fix (the right one):** UPDATE the status instead of deleting:
```sql
UPDATE agent_runs
SET status = 'failed'
WHERE tenant_id = '...' AND agent_id = 'morning'
  AND status = 'succeeded'
  AND started_at >= date_trunc('day', now() at time zone 'UTC')
RETURNING id, status, started_at;
```

This sidesteps the FK constraint entirely (UPDATE doesn't violate FK), and the status change is genuinely accurate — the overall outcome WAS a failure even though the agent step succeeded.

**Don't do:** `DELETE FROM cost_ledger WHERE agent_run_id = ...; DELETE FROM agent_runs WHERE id = ...;` — this destroys cost telemetry. The cost_ledger rows are the canonical record of spend; losing them silently breaks `/dashboard/spend` reporting and the monthly `reset-monthly-spend` cron's accounting.

**Don't do:** disabling the idempotency check in production. The check is the one preventing Vercel's exactly-once-not-guaranteed cron retries from double-sending the owner.

**Generalizable pattern:** whenever an agent_runs row needs to "no longer count" for an idempotency / aggregation purpose, prefer UPDATE-status over DELETE. The status field is the source of truth for "did this succeed"; changing it is the right vocabulary. DELETE should be reserved for the cleanup cron's expiration sweep, not testing convenience.

---

### 15.25 Iron Rule Carve-Out — Owner-Self Loopback Is Auto-OK, Customer-Facing Never Is (3M lesson) ⚠️

**The principle:** "AI מסמן, בעלים מחליט" applies to **customer-facing** messages — the AI never speaks to a third party without the owner's [אשר]. Messages where the recipient IS the owner of the same tenant that produced the message (self-loopback) are not bound by the rule.

**Why this distinction matters:** the rule's harm model is: AI hallucinates → hallucination reaches a customer → customer is harmed (wrong info, brand damage, defamation, illegal medical advice, etc.). All risk vectors require a third party (the customer) on the receiving end. A daily briefing the AI generates for the owner about the owner's own business has zero of those failure modes — no third party, no PII leak, no brand exposure, no legal exposure. Forcing approval is friction without risk-reduction.

**What the carve-out covers (Sprint 3M precedent):**
- Morning agent's daily summary → owner's WhatsApp (auto-send via cron, no [אשר])
- Watcher alerts → could be auto-pushed to owner via WhatsApp (3X candidate)
- Manager weekly reports → could be auto-pushed Sunday (3Y candidate)

**What the carve-out absolutely does NOT cover:**
- ANY message to a customer (review reply, sales follow-up, growth reactivation, hot-lead response, social post). All of these stay drafts-and-[אשר], full stop.
- Any message where the recipient phone is NOT the owner's `tenants.config->>'owner_phone'`. The technical guard: `lookupOwnerPhone(tenantId)` → if recipient ≠ owner_phone → must go through approveDraft.
- "Internal notifications to a coworker / team member" — that's still a third party even if employed by the same business. If a tenant has multiple staff phones, only the designated `owner_phone` qualifies for auto-send. (Defensive: if there's any ambiguity about who's an "owner," route through [אשר].)

**How to spot the right carve-out moment in code review:** the question "does this message go to a customer?" is the test. Anything that answers "no, only to the owner" is a candidate for auto-send. Anything that answers "yes" or "we're not sure" must stay in the drafts flow.

**Marketing / TM implication:** the trademark filing for "AI מסמן, בעלים מחליט" should specify "for messages directed at customers" or similar language so this carve-out doesn't become a public-perception crack. The wedge promise is unchanged; the carve-out is an operational nuance about owner-self notifications.

**Don't do:** generalize from 3M to "Morning is autonomous, so other agents can be too if we feel like it." The carve-out is principled, not a precedent for autonomy creep. Each new auto-send proposal needs to pass the customer-facing test.

---

### 15.26 `"use server"` Files Cannot Export Non-Async Values (Sprint 3I attempt 1 lesson) ⚠️

**Symptom:** Vercel build fails with `Only async functions are allowed to be exported in a "use server" file. You cannot export non-async functions, classes, or other values.`

**What caused it (Sprint 3I attempt 1, commit `408b4ed`):** Added `export const BUSINESS_BRIEF_MAX_LENGTH = 2000;` to `src/app/dashboard/settings/actions.ts` which has `"use server"` at the top. `tsc --noEmit` passed. Vercel `next build` rejected it.

**The fix:** Extract the constant to a sibling neutral file that does NOT have `"use server"`:
```typescript
// src/app/dashboard/settings/constants.ts (no directive)
export const BUSINESS_BRIEF_MAX_LENGTH = 2000;
```
Then import from both `actions.ts` and any client component (`settings-form.tsx`) that needs the value. Commit that fixed it: `cadde7c` ("fix(settings): move BUSINESS_BRIEF_MAX_LENGTH to constants.ts").

**Generalized rule:** under `"use server"`, the only legal exports are async functions and `export type`/`export interface`. No `export const`, no `export class`, no `export function (non-async)`. If you need to share a value/constant/non-async helper between server action and a client component, put it in a neutral file.

**Why TypeScript misses it:** the `"use server"` directive is a Next.js framework constraint, not a TypeScript constraint. `tsc` doesn't know about it. Only the Next.js build pipeline enforces. Hence §15.27.

---

### 15.27 `tsc --noEmit` ≠ `next build` — Pre-Push Checklist Must Include `npm run build` ⚠️

**Long-standing assumption proven wrong (Sprint 3I session 2026-05-12):** `npx tsc --noEmit` is necessary but NOT sufficient as a pre-push gate. `tsc` catches type errors. It does NOT catch:

- `"use server"` non-async export violations (§15.26)
- Turbopack/SWC bundler bugs (§15.29)
- Server component / client component boundary violations enforced at build
- Edge runtime API surface restrictions (e.g., `node:crypto` usage in Edge code — §15.15)
- Missing required props on client components that Next.js validates at build time
- Module resolution issues that only manifest under Turbopack's bundle traversal

**The new pre-push checklist (mandatory for routes touching agents, server actions, or runtime config):**
```powershell
cd C:\Users\Din\Desktop\spike-engine
npx tsc --noEmit            # cheap — catches type errors
npm run build               # slower (~30-60s) — catches Next.js framework errors
# Only if both pass:
git add . && git commit -m "..." && git push
```

**Cost:** ~30-60s extra per push. **Benefit:** zero "build failed on Vercel after push" cycles. The Sprint 3I session lost ~3 hours iterating on Vercel build failures that `npm run build` would have caught locally in 60 seconds.

**Operational note:** if `npm run build` reports an error you don't understand, DO NOT push. Bring the exact error message to the session. The instinct "let me push and see what Vercel says" wasted the most time during 3I — Vercel's error surface is sometimes less detailed than local build output, especially for module-evaluation errors.

---

### 15.28 Vercel Hobby Plan Timeouts — Edge 25s vs Node 60s; Heavy Sonnet Agents Need Node Runtime ⚠️

**The discovery (2026-05-13 session):** all 4 heavy Sonnet 4.6 agents (Manager, Sales, Inventory, Social) were timing out at exactly 25 seconds with `Error: FUNCTION_INVOCATION_TIMEOUT` when triggered via "הרץ עכשיו" buttons on the dashboard. Vercel logs:
```
POST 504 /dashboard
Error: Your function was stopped as it did not return an initial response within 25s
Duration: 25029ms (precisely the Edge limit)
Runtime: edge
```

**Root cause:** Vercel Hobby plan has different function-invocation timeout limits by runtime:
- **Edge runtime:** 25 seconds (hard kill)
- **Node.js runtime:** 60 seconds (hard kill)
- **Vercel Pro plan:** 300 seconds (Edge) / 800 seconds (Node) — paid path

Heavy Sonnet 4.6 + thinking agents on a populated demo tenant exceed 25s but fit in 60s. The 5 working agents (Watcher, Morning, Reviews, Hot Leads, Growth) finish under 25s because they're Haiku 4.5 or simpler Sonnet flows.

**The fix (commit `7539dcd`):** change `src/app/dashboard/page.tsx` from `export const runtime = "edge"` to `export const runtime = "nodejs"`. Server actions inherit the runtime from the page that calls them. After this single-line change, all 4 heavy agents complete successfully (verified end-to-end: Inventory 34s, Manager produced full weekly report, Sales generated drafts, Social generated 3 posts).

**Tradeoffs of nodejs runtime on the dashboard page:**
- Slower cold start (~500-1000ms vs ~50ms on Edge) — acceptable for an authenticated route hit once per session
- More memory available (default 2048MB)
- Full Node.js API surface (less likely to hit Edge restrictions like `node:crypto` — §15.15)
- Same code, no API changes

**When to consider Inngest instead of just bumping runtime:**
- If even 60s isn't enough (Manager weekly reports on customers with thousands of weekly events)
- If you want UX where the button returns 200 immediately and the agent runs in the background
- If you want to avoid HTTP request-level retries on long operations
- Inngest is already in the stack (`src/lib/inngest/`) — Growth uses it. Pattern is documented in Growth's `_shared.ts`.

**Operational rule going forward:** any new route that triggers a heavy LLM-using server action (Sonnet 4.6 + thinking + non-trivial DB work) should default to `runtime = "nodejs"` from day 1. Edge is best for read-only or lightweight routes.

---

### 15.29 Turbopack/SWC `import type` + `"use server"` + nodejs Runtime Bug ⚠️ UNFIXED

**Symptom:** runtime error `ReferenceError: BusinessOwnerGender is not defined at module evaluation (.next/server/chunks/ssr/_0cwvw...)` when a server action is invoked. The function digest matches the SSR chunk that references a type-only import. Specifically observed in `src/app/dashboard/settings/actions.ts` when it had:
```typescript
import type { BusinessOwnerGender } from "@/lib/safety/gender-lock";
export type { BusinessOwnerGender };
// ...
interface TenantSettingsInput { businessOwnerGender: BusinessOwnerGender; ... }
const VALID_GENDERS = ["male", "female", "plural"] as const satisfies readonly BusinessOwnerGender[];
```

**Behavioral fingerprint:**
- Build succeeds (Turbopack accepts the syntax)
- First load of the page renders fine (page is a Server Component, no action invocation)
- The user fills the form and clicks "שמור הגדרות" → server action triggered → SSR chunk evaluates → `BusinessOwnerGender` is referenced as a value at module-load time but was never defined as a runtime value (it's a type)
- Crash happens before the action body executes — the error is at module evaluation, not inside the function

**Worked on Edge, broke on Node:** the SWC plugin Next.js uses for Edge runtime erases the `import type` correctly; the SWC plugin for Node runtime under Turbopack does not (as of Next.js 16.2.4, May 2026). The same file works in Edge but crashes in Node.

**Attempted fixes (all failed during 3I attempts 1-5):**
1. Remove `as const satisfies readonly BusinessOwnerGender[]` → still crashed (type still referenced via `interface`)
2. Use inline modifier `import { type BusinessOwnerGender }` instead of `import type { ... }` → still crashed
3. Remove the `export type` re-export → still crashed (other internal references)
4. Define `BusinessOwnerGender` LOCALLY in `actions.ts` as `"male" | "female" | "plural"` literal union, removing all imports from `gender-lock.ts` → still crashed (suggesting the bug is more subtle than just the import path)
5. Add comprehensive try-catch + logging → didn't address root cause; the crash is BEFORE the function runs

**Status:** UNRESOLVED as of session end 2026-05-13. The Sprint 3I attempts were rolled forward through commits `408b4ed` → `cadde7c` → `7580b4d` → `1aa4877` (reverts) → `331ebb7` → `59feb7b` → `7539dcd` (runtime change). The runtime change to nodejs fixed the dashboard but DID NOT fix settings save — settings save still crashes.

**Recommended approach for next attempt (session after 2026-05-13):**
1. Rollback to `f19c0fe` (pre-Sprint-3I, clean baseline)
2. Build Sprint 3I from scratch BUT:
   - Keep `src/app/dashboard/settings/actions.ts` on Edge runtime (default), where types erase correctly
   - Avoid mixing `nodejs` runtime + `"use server"` + transitive type imports in the same file
   - OR define ALL types locally without any cross-module type imports
3. Run `npm run build` locally before every commit (§15.27)
4. Test save action in production immediately after deploy goes green
5. If crash persists, check Vercel Runtime Logs for the exact module-evaluation error before iterating

**Open question for future investigation:** does the bug reproduce with a minimal repro (`actions.ts` with just `import type { X } from "./other"` and an async function)? If yes — file upstream issue with Next.js/Turbopack. If no — it's a Spike-specific code pattern issue and the fix is structural.

---

### 15.30 `agent_runs` Schema Reference + Cleanup Procedure for Stuck `running` Rows ⚠️

**The schema (verified 2026-05-13 via production DB SELECT):**
```
agent_runs columns:
  id                       uuid (PK)
  tenant_id                uuid (FK)
  agent_id                 text       ← NOT agent_type
  status                   text       ← 'running' | 'succeeded' | 'failed' | 'no_op'
  started_at               timestamptz
  finished_at              timestamptz nullable   ← NOT completed_at
  input                    jsonb nullable
  output                   jsonb nullable
  error_message            text nullable          ← NOT error
  model_used               text nullable
  thinking_used            boolean
  usage                    jsonb nullable          ← contains input_tokens, output_tokens, cache_*
  cost_ils                 numeric nullable (legacy)
  trigger_source           text       ← 'manual' | 'scheduled' | 'webhook' | 'admin_manual'
  cost_estimate_ils        numeric
  cost_actual_ils          numeric nullable
  is_mocked                boolean
```

**Why this matters:** the conventional names (`agent_type`, `completed_at`, `error`) are wrong for `agent_runs`. Any SQL query using them will fail with `column "X" does not exist`. Trust this section over memory.

**Stuck-runs cleanup (for after Vercel function timeouts):** when a Vercel function is killed mid-LLM-call by `FUNCTION_INVOCATION_TIMEOUT`, the agent's `agent_runs` row stays at `status='running'` forever because the code never reaches the status-update line. This blocks new "הרץ עכשיו" clicks because the dedup check sees a "live" run.

The cleanup query (run in Supabase SQL Editor):
```sql
UPDATE agent_runs
SET status = 'failed',
    finished_at = NOW(),
    error_message = COALESCE(error_message, 'auto-cleanup: stuck running after Vercel function timeout')
WHERE status = 'running'
  AND tenant_id = '<TENANT_UUID>'
  AND started_at < NOW() - INTERVAL '2 minutes'
RETURNING id, agent_id, started_at;
```

The 2-minute threshold is conservative — anything older than that is genuinely stuck (no real agent run takes more than 60s on Node runtime, and the cron's own slots are 5+ minutes apart).

**During the 2026-05-13 session:** the cleanup released 12 stuck rows for the DEMO tenant, some as old as May 1 (pre-runtime-fix, when Edge 25s kills were silent). After cleanup + the runtime fix in §15.28, "הרץ עכשיו" worked on all previously-blocked agents.

**Long-term fix (deferred):** add a Postgres function that auto-cleans `status='running'` rows older than N minutes, scheduled via `pg_cron` or a Vercel cron. Or add an HTTP cleanup endpoint. Until then, manual SQL is the procedure.

---

### 15.31 PowerShell `Compress-Archive` Collides Same-Named Files (Operational Lesson) ⚠️

**Symptom:** zipping 4 files all named `run.ts` from different directories collapses them into ONE file inside the archive. Three of the four are silently lost.

**Reproducer:**
```powershell
Compress-Archive -Path `
  "src\lib\agents\manager\run.ts", `
  "src\lib\agents\sales\run.ts", `
  "src\lib\agents\social\run.ts", `
  "src\lib\agents\inventory\run.ts" `
  -DestinationPath "all-runs.zip" -Force
# Inside all-runs.zip: a single file "run.ts" (one of the four, unpredictable which)
```

**Root cause:** PowerShell's `Compress-Archive` does NOT preserve relative paths inside the archive. It uses the basename of each file as the archive entry name. Multiple files with the same basename overwrite each other.

**Workarounds (any one works):**

(A) **Rename before zipping:**
```powershell
Copy-Item "src\lib\agents\manager\run.ts" "$HOME\Downloads\manager-run.ts" -Force
Copy-Item "src\lib\agents\sales\run.ts" "$HOME\Downloads\sales-run.ts" -Force
Copy-Item "src\lib\agents\social\run.ts" "$HOME\Downloads\social-run.ts" -Force
Copy-Item "src\lib\agents\inventory\run.ts" "$HOME\Downloads\inventory-run.ts" -Force
Compress-Archive -Path "$HOME\Downloads\*-run.ts" -DestinationPath "all-runs.zip" -Force
```

(B) **Use tar (Windows 10+):**
```powershell
tar -cf all-runs.zip -C src\lib\agents manager\run.ts sales\run.ts social\run.ts inventory\run.ts
```
This preserves the full relative path inside the archive.

(C) **Upload files individually** to chat instead of zipping. The chat interface supports multi-file drag-and-drop.

**Operational rule:** when sending Claude multiple files with potentially-colliding basenames (`run.ts`, `prompt.ts`, `schema.ts`, `types.ts`, `index.ts` — all common in Spike), either rename first or upload individually. Never trust `Compress-Archive` to preserve directory structure.

---

### 15.32 `withGenderLock` Is the Central Prompt-Caching Helper for Spike Agents ✓

**The helper (in `src/lib/safety/gender-lock.ts`):**
```typescript
export function withGenderLock(
  staticPrompt: string,
  gender: BusinessOwnerGender | null
): { type: "text"; text: string; cache_control?: { type: "ephemeral"; ttl: "1h" } }[] {
  const blocks = [
    {
      type: "text",
      text: staticPrompt,
      cache_control: { type: "ephemeral", ttl: "1h" },  // ← caching auto-applied
    },
  ];
  if (gender) blocks.push({ type: "text", text: buildGenderInstruction(gender) });
  else blocks.push({ type: "text", text: "...defensive sutmiyut..." });
  return blocks;
}
```

**Architectural property:** the static system prompt gets `cache_control: { type: "ephemeral", ttl: "1h" }` automatically; the dynamic gender instruction is appended AFTER the cache breakpoint, so it varies per tenant without invalidating the cache. The 1-hour TTL means cache persists across multiple "הרץ עכשיו" clicks within an hour.

**Caching status of all 5 LLM call sites (verified 2026-05-13):**
| Agent | run.ts location | Caching mechanism |
|---|---|---|
| Inventory | `src/lib/agents/inventory/run.ts:181` | Direct `cache_control` block in `system: [...]` |
| Manager | `src/lib/agents/manager/run.ts:181` | Direct `cache_control` block in `system: [...]` |
| Sales follow-up | `src/lib/agents/sales/run.ts:432` | Via `withGenderLock(SALES_AGENT_SYSTEM_PROMPT, gender)` |
| Sales quick-response | `src/lib/agents/sales/run.ts:702` | Via `withGenderLock(SALES_QUICK_RESPONSE_SYSTEM_PROMPT, gender)` |
| Social | `src/lib/agents/social/run.ts:178` | Via `withGenderLock(SOCIAL_AGENT_SYSTEM_PROMPT, gender)` |

**5/5 cached. No further optimization possible in the prompt-caching dimension.** A 2026-05-13 attempt to find unoptimized agents came up empty. Future agent additions that build their own `system: [...]` block must either use `withGenderLock` or add `cache_control` directly to be consistent.

**Speed expectations from prompt caching (corrected from earlier optimistic estimates):**
- Cache hit (within 1h TTL): 5-15% faster end-to-end (caching accelerates input processing, not generation)
- Cache miss (first run of the hour): 0% faster, ~25% more expensive (cache creation overhead)
- Cost saving on input tokens at cache hit: ~80% (this IS the main benefit)

**What caching does NOT fix:** Sonnet 4.6 generation latency (the bulk of the wait), thinking-token processing, cold function starts. The "feels slow" UX problem is solved by Inngest fire-and-forget, NOT by prompt caching.

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
> קראתי את CLAUDE.md. Spike Engine — 9 סוכני AI מול לקוח (Morning, Watcher, Reviews, Hot Leads, Social, Manager, Sales, Inventory, Growth) + cleanup פנימי, drafts-only **למעט carve-out של 3M ל-owner-self loopback** (ראה §15.25 + §10.39), עברית RTL, Anthropic only. Stage 1 הושלם במלואו + Post-Stage-1 polish דרך 1.16 + Sprint 2 Batch 2C/2D + 3A + **3M (Morning auto-send + helpers extraction = 3B absorbed)** + 2 RLS migrations (025 memberships recursion, 026 events tenant SELECT) + **Dashboard runtime fix (`7539dcd`, 2026-05-13)** שמתקן 4 סוכנים כבדים שנכשלו ב-25s Edge timeout — עכשיו רצים על nodejs runtime עם 60s. **שלוש WhatsApp deliveries אמיתיות הוכחו end-to-end:** Growth Reactivation (דנה כהן) ב-2026-05-08, Sales quick_response (מוחמד אבו ראס) ב-2026-05-09, Morning daily_summary auto-send לבעל-העסק (+972509918196) ב-2026-05-10. /dashboard/approvals מרנדר messageHebrew נכון לאחר 3A; double-execute race בdrafts.ts מוקשח (§15.23 mitigations 1+2); helpers משותפים ב-`src/lib/whatsapp/helpers.ts` (3M). **All 5 LLM call sites already optimally cached** (Manager + Inventory direct, Sales×2 + Social via `withGenderLock` — see §15.32). **Cron:** 8 jobs ב-vercel.json, Morning ב-`0 4 * * *`. הכל בייצור על app.spikeai.co.il. **חוסם פתוח: Sprint 3I — Business Context Brief** — settings page נשבר בלחיצת "שמור" עם `ReferenceError: BusinessOwnerGender is not defined at module evaluation` (Turbopack/SWC bug תחת nodejs runtime, §15.29). 5 ניסיונות תיקון נכשלו. הגישה המומלצת לסשן הבא: rollback ל-`f19c0fe`, בנייה מחדש על Edge runtime, `npm run build` לוקלי לפני כל commit (§15.27). **לקחים חדשים נוספו:** §15.26 (`"use server"` לא יכול לייצא non-async), §15.27 (`tsc --noEmit` ≠ `next build`), §15.28 (Vercel Hobby: Edge 25s vs Node 60s), §15.29 (Turbopack import type bug — unfixed), §15.30 (`agent_runs` schema + cleanup SQL), §15.31 (Compress-Archive collisions), §15.32 (`withGenderLock` caching). Latest commit: `7539dcd` (runtime fix + reapplied 3I); הLAST KNOWN GOOD לפני 3I זה `f19c0fe`. חוסמים חיצוניים: עוסק מורשה / Meta Business verification / מספר טלפון עסקי. אופציונלי-לא-חוסם: Vault encryption ל-access_token, sonner Toaster migration (alert→toast), Suspense pattern לדפים נוספים, marketing landing alignment, 3X (Watcher auto-send), 3Y (Manager weekly auto-send), Inngest fire-and-forget לסוכנים כבדים. **החלטות אסטרטגיות נעולות (§19):** pricing **revised** ל-package יחיד ₪999-1500 (§19.1 מציין שהמודל הישן של 4 tiers deprecated); BSP=360dialog; wedge=[אשר] button + voice notes + no-shows ROI; channel=periphery + bookkeepers + Achiya. מה אתה רוצה לעשות?

---

## 18. Appendix

### 18.1 Migrations (26 files)
Active 001-026. Latest: 
- `026_events_select_own_tenant.sql` (1.15.3 — adds tenant-scoped SELECT policy on events; previously only super_admin could read; required for `wasContactedInLast24h` to work user-scoped — see §15.22)
- `025_fix_membership_rls_recursion.sql` (1.15.3 — introduces `user_admin_tenant_ids()` SECURITY DEFINER helper; rewrites `memberships_select` and `integrations_admin_only` to break infinite recursion that was latent for months — see §15.21)
- `024_fix_current_tenant_id.sql` (1.15.2 — `current_tenant_id()` reads from `user_settings.active_tenant_id`)
- `023_growth_agent.sql` (1.15 — 4 tables for Growth Agent: meta_inbox_messages, growth_runs, growth_candidates, growth_outcomes; all with RLS).

Previous notable: `022_integrations_whatsapp_phone_lookup.sql` (1.14.2 — partial UNIQUE index for webhook tenant routing), `021_drafts_expired_status.sql` (1.5.4 — idempotent enum/text-aware).

Archive: `supabase/migrations/_archive/v1/`.
Note: 009 was skipped during initial scaffold; not a gap to fill.

### 18.2 Selected Commits (newest first)

| Hash | What |
|---|---|
| `7539dcd` | fix(dashboard): switch from edge to nodejs runtime to give heavy Sonnet agents 60s instead of 25s — also re-applied Sprint 3I (settings page still broken on save, see §15.29) |
| `59feb7b` | Reapply "fix(settings): move BUSINESS_BRIEF_MAX_LENGTH to constants.ts" (Sprint 3I attempt; settings save STILL crashes — §15.29) |
| `331ebb7` | Reapply "feat(settings): Sprint 3I Phase 1 — Business Context Brief in settings + reviews agent injection" (Sprint 3I attempt; settings save STILL crashes — §15.29) |
| `7580b4d` | Revert "feat(settings): Sprint 3I Phase 1" (intermediate rollback, later reapplied) |
| `1aa4877` | Revert "fix(settings): move BUSINESS_BRIEF_MAX_LENGTH to constants.ts" (intermediate rollback, later reapplied) |
| `cadde7c` | fix(settings): move BUSINESS_BRIEF_MAX_LENGTH to constants.ts (use server cannot export non-async values — §15.26) — build fixed, runtime still broken |
| `408b4ed` | feat(settings): Sprint 3I Phase 1 — Business Context Brief (had `use server` non-async export build error — §15.26) |
| `f19c0fe` | docs: add Sprint 3I + mark §19.1 pricing revised (LAST KNOWN GOOD before 3I attempts) |
| `5562bf6` | docs(claude): 3M shipped + §10.39 + §6.1 corrected (Morning + Inventory output) + §15.24 + §15.25 + §3.5 (8 crons) + sample reply refresh |
| `2e72f78` | feat(morning): auto-send daily summary to owner via WhatsApp + extract whatsapp helpers (Sprint 3M = 3B absorbed) |
| `2d899a4` | docs: backfill 1ab5a08 + b1bb36f hashes in 10.38 + 18.2 + header + 17 sample reply |
| `b1bb36f` | docs(claude): 3A shipped + Sprint 2D documented + §19 strategic decisions locked + §15.23 mitigations 1+2 implemented + §10.37 + §10.38 + sample reply refresh |
| `1ab5a08` | fix(approvals): render messageHebrew for sales_quick_response + render success message + harden double-send race (3A + 15.23 mitigations 1+2) |
| `f3b04bd` | feat(whatsapp): wire send to drafts approve for the 9 other agents (1.15.4 / Sprint 2D) |
| `24e0a5f` | fix(rls): break membership recursion + add events tenant SELECT (1.15.3 followup, migrations 025+026) |
| `a2a2ea1` | docs: update CLAUDE.md for 1.15.3 (Sprint 2C) + 1.16 (dashboard streaming) + RLS migration shipped |
| `0c78974` | perf(dashboard): Suspense streaming for KPIs / manager lock / onboarding banner (1.16) |
| `dbcb174` | feat(whatsapp): outbound send infra + Growth approve wiring (1.15.3 / Sprint 2 Batch 2C) |
| `762da80` | fix(rls): simplify current_tenant_id to user_settings only — drop unused JWT path (1.15.2 followup) |
| `120f0f8` | fix(rls): current_tenant_id fallback to user_settings when app_metadata missing (1.15.2) |
| `eb23672` | feat(growth): expose on agents overview page with growth_runs stats (1.15.2) |
| `a05c46a` | feat(growth): expose on dashboard grid + rename Opportunities to Growth (1.15.1 — Batch 2B-3) |
| `a831283` | feat(growth): Batch 2B-2b - sidebar and mobile-drawer Growth nav link with lime gradient (1.15.1) |
| `65e681d` | feat(growth): Batch 2B-2a - OpportunityCard, OnDemandTriggerButton, page route (1.15.1) |
| TBD | feat(growth): Batch 2B-1 - loading skeleton, ROI strip, EmptyState, DraftEditor (1.15.1) |
| `f9f6804` | docs: add WhatsApp 2C preflight + rich demo seed scripts (1.15.1) |
| TBD | docs: correct --color-* CSS prefix and add 15.19 lesson on server-only types (1.15.1) |
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
- Agents overview helper → `src/lib/agents/overview.ts` (1.8; 1.15.2 added growth_runs query for the 9th agent — see §10.33)
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
  - Growth → `src/app/dashboard/actions/growth.ts` (1.15.1 — also exports the client-facing types `PendingGrowthCandidate`, `GrowthRoiSnapshot`, `OnDemandTriggerResult` since `lib/agents/growth/types.ts` is server-only; 1.15.3 added send wiring + 3 private helpers)
- **WhatsApp outbound send (1.15.3 / Sprint 2 Batch 2C):**
  - Send transport → `src/lib/whatsapp/send.ts` (Meta Cloud API client, retry policy, phone normalization)
  - Send types → `src/lib/whatsapp/types.ts` (MetaErrorCategory, SendWhatsAppMessageInput/Result)
  - Inbound webhook (separate, pre-existing) → `src/lib/webhooks/whatsapp/`
- **Growth dashboard UI (1.15.1 Sprint 2 Batch 2B):**
  - Route → `src/app/dashboard/growth/page.tsx` (edge runtime)
  - Loading skeleton → `src/app/dashboard/growth/loading.tsx`
  - Candidate card → `src/components/dashboard/growth/OpportunityCard.tsx`
  - Edit modal → `src/components/dashboard/growth/DraftEditor.tsx`
  - 30-day ROI strip → `src/components/dashboard/growth/RoiStatStrip.tsx`
  - Empty state → `src/components/dashboard/growth/EmptyState.tsx`
  - On-demand CTA → `src/components/dashboard/growth/OnDemandTriggerButton.tsx`

---

## 19. Pre-Launch Strategic Decisions (LOCKED 2026-05-10)

This section captures the strategic decisions taken at the end of the 2026-05-10 session, after three deep research artifacts on the Israeli SMB AI market. These are working assumptions for the launch — not gospel; they may revise after first 10 paying customers — but Claude (the AI assistant) should NOT relitigate them in future sessions unless the founder explicitly opens them up. Per §13 (don't relitigate settled decisions), if the founder asks "should we charge ₪199 instead?" the answer is "we settled on ₪249 in 1.15.4-followup; here's why" + brief recap, not a fresh debate.

**Note on prior contradictions:** §2.4 (Settled Decisions) and §12.1 (Pricing) earlier in this file referenced the older Solo/Pro/Chain tier model with ₪290/₪690/₪1,490 + ₪990 setup, and §0/§13 said "Don't propose 360dialog or other BSP middlemen." §19 below SUPERSEDES both. The earlier sections are kept for historical context but the locked source of truth is §19.

### 19.1 Pricing — REVISED DIRECTION 2026-05-10 evening (exact number TBD)

**As of 2026-05-10 evening discussion:** the four-tier Solo/Team/Pro/Enterprise structure below is **being replaced with a single-package model**. Exact price TBD — directionally between ₪999 and ₪1,500/mo flat, leaning ₪999 if the channel stays periphery + bookkeepers + Achiya per §19.4. The multi-tier complexity wasn't justifying itself: most differentiators (number of users, message volume) were artificial — Spike's actual product is "all 10 agents, period," and tiers were inventing scarcity that didn't match the value model.

**The single-package direction (not yet a locked number):**
- One Spike plan: ₪999-1,500/mo (TBD), all agents on, all features
- Per-additional-location multiplier for chains: +₪500/mo each (avoids the Enterprise-tier overhead while still capturing multi-location revenue)
- Pilot onramp: ₪199 first month, then standard rate (replaces ₪99 pilot)
- Annual prepay 16.6% discount kept
- Design Partner: ₪499/mo locked 12 months, max 10, in exchange for case study + weekly call + named logo on landing

**Why pricing is parked, not locked:** the founder wants to validate with the first 3-5 paying customers what they'll actually pay before pinning a number. The risk of premature optimization is real — what we think is right vs what the market signals are different things. Decision deferred to after first 3-5 conversions.

**The original four-tier table below is preserved as historical context (the 2026-05-10 morning lock) but is NO LONGER the source of truth.** Any future Claude session should treat the single-package direction above as current and the table below as deprecated.

#### Original locked table (DEPRECATED — see direction above):

| Tier | Hebrew name | Price (NIS, monthly) + מע"מ | Includes |
|---|---|---|---|
| Starter | יחיד | **₪249** | 1 user, 5 agents on, 500 outbound msgs/mo |
| Team (recommended) | צוות | **₪449** | 3 users, all 10 agents, 2,000 msgs/mo, voice notes |
| Pro | עסק | **₪749** | 10 users, unlimited agents, 5,000 msgs/mo, priority support |
| Enterprise | מותאם | from ₪1,500 | Negotiated multi-location / chains |

- **Annual prepay discount: 16.6%** (pay 10, get 12). Not 20%. Cash collection priority over LTV maximization for solo-founder cash flow.
- **Trial: 14 days, no credit card required.** Demo mode for first 5 days, Embedded Signup nudge from day 5.
- **Parallel ₪99 first-month "פיילוט מודרך" track** for owners who want a 30-min Hebrew Zoom kickoff. Targets 60-70% conversion to ₪449 month 2.
- **No free tier.** Burns LLM cost on tire-kickers.
- **Design Partner pricing: ₪99/mo for 12 months locked, max 10 partners.** Separate from the trial track. In exchange: weekly feedback call + named case study at 90 days + priority feature request slot.
- **Currency: NIS only at launch.** USD secondary later for diaspora.
- **Payment methods: Cardcom (Visa/Mastercard/Isracard) + Tranzila as fallback.** No Bit/PayBox for B2B subs.

**Rationale (for the original table, now deprecated):** Israeli SMB benchmarks (Goldie $19.99/mo translated, GlossGenius $24/mo, Vagaro $23.99/mo, Mindbody ~₪600+/mo, Fireberry ₪150-500/mo per user, Achiya Cohen's public anchor ₪200-500/mo) put the receptionist-replacement band at ₪200-800. The 2026-05-10 evening reconsideration concluded that ₪200-800 was the wrong reference class — Spike isn't a booking tool, it's a 10-agent automation suite where Achiya sells single workflows at ₪200-500/each. The ₪999-1,500 single-package band reflects Spike's actual category.

### 19.2 BSP — LOCKED

**Primary: 360dialog.** €49/number/month + zero per-message markup over Meta's rates. Direct Meta partner. Cleanest pass-through model; the BSP most Israeli automation shops actually run.

**Fallback: Meta Cloud API direct** (already wired, the current setup).

**Skip: Twilio** ($0.005/message markup invisible at 1k SMBs, bleeds at 10k), **Wati** (it's a competitor), **Bird** (wrappers UI we don't need).

**Endgame: Spike becomes a Meta Tech Provider** post-Embedded Signup launch. Current 360dialog setup is forward-compatible.

### 19.3 Differentiation Wedges — LOCKED

Three wedges, in order of priority. Lead the homepage with the first. Reveal the others after click.

1. **"AI מסמן, בעלים מחליט" — the [אשר] button.** Spike's Iron Rule. Every other Israeli + global tool either fully autonomous (Plexa/Maya/AI Buddy/Manychat/Wati/Tidio) or passive inbox. None own the human-approval lane. **TM the phrase** (סימן מסחר, ~₪1,800 + agent fees, ~6 months registration).
2. **Voice-note-to-Hebrew-draft.** Israelis send voice notes constantly. ElevenLabs Scribe v2 (3.1% FLEURS WER, ~$0.024/min) for live path; Ivrit.AI `whisper-large-v3-turbo-ct2` for batch + long voice notes (self-hosted). No competitor does this well.
3. **No-show + dormant-customer ROI calculator** on the landing page. Inputs: avg appointment value, weekly bookings, current no-show %. Outputs: NIS recovered/month + payback time. Achiya Cohen's documented case (Ashdod dental clinic 25%→8% no-shows after WhatsApp reminders, validates 7x ROI on the ₪449 tier from no-show reduction alone).

### 19.4 Channel Strategy — LOCKED

**Primary: in-person door-knocking in periphery cities (Beit Shemesh, Hadera, Modi'in, Sderot, Yokneam, Carmiel).** Tel Aviv salons already use Goldie/Plannie. Periphery owners message manually from personal WhatsApp, lose 1-3 leads/week, have nobody selling to them. CAC ~₪400 fully loaded.

**Secondary: bookkeepers (מנהלות חשבונות) as channel partners.** ~5,000 active in Israel. Visit clients monthly, see WhatsApp chaos, recommend tools. Offer ₪50/customer/month recurring kickback for 24 months. Top 200 via מסלקה + Facebook groups.

**Tertiary: Achiya Cohen rev-share partnership.** 30% recurring rev-share for 12 months on referred customers. Co-branded "Powered by Achiya Automation" template pack.

**Skip: Israeli VC fundraising at this stage.** Apply to Tnufa (₪200K, 80% non-dilutive) and Pre-Seed Startup Fund (up to ₪1.5M, 60% non-dilutive). Innovation Authority is the effective seed VC for SMB SaaS at < $1M ARR.

**Skip: international expansion before 1,000 Israeli customers.**

**Skip: targeting Tel Aviv salons in the first 50 customers.**

### 19.5 Vertical Order — LOCKED

First 50 customers across:
1. **Hairdressers / beauty salons / nail salons** — highest no-show pain, fastest aha
2. **קוסמטיקאיות (solo)** — same as above, even smaller scale, easier to close
3. **Yoga / pilates studios** (single-location, 10-80 active members) — class fill + waitlist + winback
4. **Private clinics / therapists / mental health (solo practitioner)** — drafts-only positioning lands hardest due to PPL Amendment 13 sensitivity

Defer until after 50 customers: real estate, restaurants, retail, lawyers/accountants, home services, pet services, tutoring.

### 19.6 What NOT to Build (deferred 2026, not killed)

- AI calls / voice-out — Plexa already does this; matching distracts. Defer 12+ months.
- Native iOS/Android — PWA covers 80% of value. Defer until 1,000 customers.
- Multi-location for chains beyond 5 locations — wait for inbound demand.
- White-label for agencies — not at this stage.
- SOC 2 / ISO 27001 — not until $500K ARR.
- חברה בע"מ conversion — not until ~₪35K MRR (~₪400K ARR) or first hire.
- Stripe / international billing rails — Cardcom + Tranzila cover Israel.
- WhatsApp Pay-as-a-feature for customers' customers — at best a 2027 conversation.
- Telegram, web chat widget, Apple Calendar — long tail, defer.

### 19.7 What TO Build Next (Sprints, ordered)

Each is a separate session / batch. Don't combine.

- **Sprint 3A — UI fix for approvals page** ✅ DONE — display `messageHebrew` + render `message` field from approveDraft response + double-execute hardening (§15.23 mitigations 1+2). See §10.38. Commit `1ab5a08`.
- **Sprint 3B — helpers extraction** ✅ DONE (absorbed into 3M, see §10.39) — `src/lib/whatsapp/helpers.ts` now houses `lookupWhatsAppIntegration`, `wasContactedInLast24h`, `mapSendErrorToHebrew`. Function name harmonized (was `lookupTenantWhatsAppIntegration` in growth.ts). All three callers (drafts.ts, growth.ts, cron/morning/route.ts) import from one place. Commit `2e72f78`.
- **Sprint 3M — Morning auto-send to owner via WhatsApp** ✅ DONE — first Iron-Rule carve-out (owner-self loopback, §15.25). Cron at `0 4 * * *` UTC. End-to-end validated 2026-05-10 with the third real WhatsApp delivery from Spike (owner's own daily briefing). See §10.39. Commit `2e72f78`.
- **Sprint 3I — Business Context Brief (self-service brand voice)** ⚠️ **BLOCKED** (attempts 2026-05-12/13 failed, see §15.29) — `/dashboard/settings` page where the owner writes a free-form Hebrew description of their business: what they sell, how they work, how they talk to customers, their style, anything that defines their voice. Stored in `tenants.config->>'business_brief'` (or new dedicated column `tenants.brief text`). Injected into the system prompt of every customer-facing agent (Sales QR, Sales Followup, Reviews, Social, Growth, Hot Leads, Morning summary) as a `<business_context>...</business_context>` block. Effect: drafts already match the owner's voice on first generation — no manual editing required. **This is the missing killer-differentiator** the product has been operating without — every Spike draft is currently "generic Hebrew SMB voice" rather than "this owner's voice." 4-8 hours of work: migration (optional — config JSONB works); settings UI (textarea + save action); prompt injection across 7 agents (find-and-replace pattern in `src/lib/agents/*/prompt.ts`). **Status as of 2026-05-13:** Phase 1 implementation was attempted across commits `408b4ed` → `cadde7c` → `7580b4d`/`1aa4877` (reverts) → `331ebb7` → `59feb7b` → `7539dcd`. Settings page renders the new Card 3 with textarea correctly, but clicking "שמור הגדרות" crashes with `ReferenceError: BusinessOwnerGender is not defined at module evaluation` (Turbopack/SWC bug under nodejs runtime — see §15.29). 5 fix attempts failed. **Recommended approach for next attempt:** rollback to `f19c0fe`, build Sprint 3I from scratch using Edge runtime (where the type-erasure works correctly), and add `npm run build` to pre-push checklist (§15.27). **Relationship to Sprint 3G:** 3G is the AI-driven version of this — auto-extract the brief from the business's website / Google reviews / Instagram during onboarding. 3I ships the manual version first (the foundation); 3G later auto-populates 3I via Sonnet during onboarding (the magic moment). Ship 3I before 3G.
- **Sprint 3X — Watcher auto-send alerts to owner** (candidate, not started) — same template as 3M applied to Watcher's `alerts` table. Eligible for the same owner-self carve-out per §15.25. Estimated ~30-45 min using the established pattern. Pre-flight: decide which alert severities trigger WhatsApp (probably `high` only) vs which stay dashboard-only.
- **Sprint 3Y — Manager weekly auto-send to owner** (candidate, not started) — same template applied to Manager's weekly `manager_reports`. Sundays. Estimated ~30-45 min. Higher-leverage than 3X for Israeli SMBs because Sunday-morning weekly digest matches the actual week-start there.
- **Sprint 3C — Voice-note-to-Hebrew-draft pipeline** — ElevenLabs Scribe ingestion + Haiku post-pass for code-switching + draft generation (~3 weeks, the highest-ROI feature on the backlog).
- **Sprint 3D — Smart Waitlist Agent** — auto-fill from waitlist when cancellation detected (~2 weeks).
- **Sprint 3E — GreenInvoice integration** — most Israeli עוסק use it (~1 week).
- **Sprint 3F — Google Calendar 2-way sync** — table stakes for service businesses (~2 weeks).
- **Sprint 3G — Hebrew brand-voice extractor (AUTO version of 3I)** — Sonnet reads the business's website / Google Maps profile / public Instagram → auto-populates the `tenants.brief` field set up by 3I. Pre-fills the settings page with a Hebrew first-draft brief that the owner reviews and edits. Magic moment in onboarding (~2 weeks). Depends on 3I shipping first.
- **Sprint 3H — Self-service WhatsApp connection UI** — `/dashboard/integrations/whatsapp` with Meta Embedded Signup (post-Tech Provider enrollment, ~2 weeks).

External (not code, not a sprint, parallel work for the founder):
- עוסק מורשה registration (~30 min online)
- Business phone number (~₪50-100/mo SIM or virtual)
- Meta Business verification (~2-4 weeks)
- Israeli TM filing for "AI מסמן, בעלים מחליט" (~₪1,800 + agent fees, ~6 months)
- Hebrew DPA template via Israeli privacy lawyer (~₪3K-6K, ~2 weeks)
- Cardcom merchant account opening (~1 week)
- 360dialog Tech Provider application (~3-4 weeks)
- Lawyer engagement (Tier-2 boutique, ₪15K-25K fixed-fee) for ToS v0.1 → v1.0 review
- Cyber + Tech E&O insurance bundle (₪7K-12K/year) with affirmative AI coverage endorsement

### 19.8 Internal Hygiene Backlog (not Sprints, not external — small things)

- **Marketing landing alignment** in `spike-agents` repo (`https://github.com/DinSpikeAI/spike-agents`). Currently promises "Telegram delivery 7am" while engine ships WhatsApp; lists Cleanup as a customer-facing card while §6.2 / §10.29 say it's internal-only; missing Growth (the 10th customer-facing agent). README last-updated April 2026 predates the locked decisions. Fix before door-knocking begins.
- **Vault encryption for `integrations.metadata.access_token`.** Currently plaintext JSONB; pre-launch debt per §11.2. Single migration + small `lookupWhatsAppIntegration` (drafts.ts + growth.ts) + admin/integrations actions update.
- **Sonner Toaster migration.** `sonner@^2.0.7` is in package.json but `<Toaster />` mount status in `app/layout.tsx` was not audited as part of 3A. Migrating `alert()` → `toast.success/error` in `approvals-list.tsx` (and likely other places) would be a clean follow-up.

### 19.9 Reference Documents Produced This Session

Three deep research artifacts produced during 2026-05-10 session, available in chat history:

1. **"Spike Engine: Hebrew-RTL AI SaaS Market Opportunity for Israeli SMBs"** (~10K words) — initial market scan, JTBD per vertical, pricing benchmarks
2. **"Spike Engine Pre-Launch Strategy"** (~38K words) — comprehensive Israeli SMB market with Plexa/Maya/AI Buddy competitive depth, regulatory analysis (PPL Amendment 13, EU AI Act Art 50, BCCRT Air Canada precedent), 30/60/90 plan
3. **"Spike Engine 0-to-100 Playbook"** (~50K words) — technical architecture (MCP, prompt caching, Hebrew ASR stack), vertical deep dives, onboarding flow with 5-minute path, Hebrew GTM channels, threats ranked, long-term strategy to ₪50M ARR

The decisions in §19.1-19.7 are distillations of those three documents. The documents themselves are the source-of-truth for "why" — refer back when a decision needs justification or revisiting.

---

**End of CLAUDE.md.**

If something here is wrong or outdated, the priority is to update **this file first**, then the code. This file is a load-bearing document.
