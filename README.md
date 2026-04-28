# 🤖 Spike Engine

> **Multi-tenant SaaS engine running 9 AI agents for Israeli SMBs.**
> Hebrew-first dashboard. Anthropic Claude. WhatsApp-native. Privacy by design.

[![Status](https://img.shields.io/badge/status-pre--launch-orange)]()
[![Day](https://img.shields.io/badge/day-3%20of%2014-blue)]()
[![Stack](https://img.shields.io/badge/Next.js-16.2.4-black)]()
[![License](https://img.shields.io/badge/license-proprietary-red)]()

---

## What is Spike Engine?

A done-for-you operational AI platform for Israeli small businesses (SMBs) — clinics, salons, real estate agents, e-commerce stores. Business owners log into a clean Hebrew RTL dashboard at `app.spikeai.co.il`, see drafts the agents prepared, and approve with one tap. **Agents never speak with end customers** — only with the business owner.

Built as the proven architectural successor to [Spike AI Studio](https://spikeai.studio) (13 production agents on the same Next.js + Supabase + Claude stack).

---

## The 9 Agents

| # | Agent | Schedule | Model |
|---|---|---|---|
| ☀️ | **בוקר** (Morning) | Daily 7:00 | Haiku 4.5 |
| ⭐ | **ביקורות** (Reviews) | Every 2h | Sonnet 4.6 |
| 📱 | **רשתות** (Social) | 3x daily | Sonnet 4.6 (Batch API) |
| 🧠 | **מנהל** (Manager) | Daily 19:00 | Sonnet 4.6 + thinking 8000 |
| 🎯 | **מעקב** (Watcher) | Real-time / 15min | Haiku 4.5 |
| 🧹 | **ניקיון** (Cleanup) | Sunday 9:00 | Haiku 4.5 |
| 💰 | **מכירות** (Sales) | Mon-Fri 10:00 | Sonnet 4.6 |
| 📦 | **מלאי** (Inventory) | Daily 8:00 | Haiku 4.5 + thinking 2048 |
| 🔥 | **לידים חמים** (Hot Leads) | Every 30min | Haiku 4.5 (bucketed) |

All agents run server-side, write drafts to a queue, and notify the business owner via WhatsApp + Web Push + email digest.

---

## Tech Stack

```
Frontend:   Next.js 16.2.4 (App Router) + Tailwind v4 + shadcn/ui RTL + Heebo
Auth:       Supabase Magic Link + Custom Access Token Hook (tenant_id in JWT)
Database:   Supabase Postgres + RLS + Realtime Broadcast + pg_cron
Backend:    Vercel Fluid Compute (Node, NOT Edge) + QStash queues
AI:         Anthropic only — Haiku 4.5 / Sonnet 4.6 / Opus 4.7
            Native JSON Schema output, prompt caching ttl: "1h"
Email:      Resend (auth.spikeai.co.il, click-tracking off)
Region:     Frankfurt (eu-central-1)
```

**Why these choices:** see `01_TECHNICAL_STACK.md` in the docs repo.

---

## Architecture Highlights

- **Multi-tenant from day 1** — every table has RLS, `tenant_id` injected into JWT via Custom Access Token Hook
- **Atomic spend cap** — `reserve_spend → call → settle_spend / refund_spend` flow prevents tenant overspend, with unique partial indexes for idempotency
- **Native JSON Schema** for all Anthropic calls (no `tool_use` hacks, no prefilling)
- **Right-RTL Hebrew dashboard** — Israeli convention, sidebar on the right, WhatsApp FAB always visible
- **Privacy by design** — Israeli Privacy Law Amendment 13 compliant, audit log per tenant, "why did this agent act?" traceability

---

## Project Status

**Currently:** Day 3 of 14 (pre-launch).

### ✅ Done
- Schema 2.0 (16 tables, 30+ RLS policies, atomic spend cap)
- Custom Access Token Hook live
- Authentication (Hebrew Magic Link via Resend SMTP)
- Dashboard app shell (sidebar, header KPIs, 9 agent cards, WhatsApp FAB)
- DNS infrastructure (Vercel as authority for `spikeai.co.il`)

### 🔄 In Progress
- Morning Agent end-to-end (Day 3)
- Master scheduler + QStash (Day 4)
- Other agents (Days 5-7)

### 📅 Next Milestones
- **Day 8:** Onboarding wizard + first paying customer
- **Day 14:** Production launch + Day-1 customer onboarded

See `03_ROADMAP_DAYS_3_TO_14.md` (private docs).

---

## Local Development

```bash
# Clone (Public repo, no auth needed)
git clone https://github.com/DinSpikeAI/spike-agents-engine.git
cd spike-agents-engine

# Install
npm install

# Environment (copy .env.example to .env.local and fill in)
cp .env.example .env.local
# Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY

# Dev server
npm run dev
# → http://localhost:3000
```

### Database setup

The `supabase/migrations/` folder contains schema 2.0 migrations applied in order:
1. `001_reset.sql` — drop any v1 schema
2. `002_schema.sql` — 16 tables
3. `003_rls.sql` — Row-Level Security policies
4. `004_grants.sql` — role permissions
5. `005_functions.sql` — atomic spend cap functions
6. `006_hook.sql` — Custom Access Token Hook
7. `007_seed.sql` — 9 agents seed data

Apply via Supabase SQL Editor or `supabase db reset` if using local Supabase CLI.

---

## Documentation

This repo contains the **code only**. Full project documentation lives in a private repository:

🔒 **`DinSpikeAI/spike-engine-docs`** (Private) — 11 master docs covering:
- Project overview & decisions
- Technical stack deep-dive
- Database schema & RLS patterns
- 9 agents detailed specs
- Hebrew brand voice & UI copy
- Code patterns (auth, agent infrastructure, RLS)
- Known issues & gotchas
- Daily progress log
- Chat handoff templates
- Secrets inventory (registry, not values)

Access is restricted. If you're a collaborator, contact [@DinSpikeAI](https://github.com/DinSpikeAI).

---

## Related Projects

- 🎬 [**Spike AI Studio**](https://spikeai.studio) — proven predecessor, 13 agents in production. Same Next.js + Supabase + Telegram + Claude stack. Live since 2026.
- 📄 [**spike-agents**](https://github.com/DinSpikeAI/spike-agents) — marketing landing page for `agents.spikeai.co.il` (separate repo).

---

## License

Proprietary — All rights reserved © 2026 Spike AI / Dean Moshe.

This source is published for transparency and recruiting purposes. Not for redistribution, fork, or commercial use without written permission.

---

## Maintainer

**Dean Moshe** — Founder & Solo Developer
[@DinSpikeAI](https://github.com/DinSpikeAI) · Israel

> Built one day at a time, with Claude as pair programmer.
> Day 1: Apr 26, 2026. Target launch: May 9, 2026.
