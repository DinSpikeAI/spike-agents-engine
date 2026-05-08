# Voice-Note Triage in Watcher — Spec

**Status:** SPEC READY (not yet implemented). Author: Claude (parallel session). Date: 2026-05-08.

**Why this matters:** Israeli SMB customers send 50%+ of business WhatsApp messages as voice notes. Watcher currently sees `message_type: 'audio'` events and treats the placeholder text (`[הודעה קולית — 0:14]`) as the message body. That means half the messages slip through unclassified — Hot Leads aren't detected, complaints don't trigger alerts, Growth misses dormant-customer signals. **Adding voice transcription is the single biggest classification-coverage upgrade Spike can ship.**

---

## ⚠️ Iron Rule 1.3 ("Anthropic Only") — must clarify first

**Discovery from May 2026 search:**
- Claude API does NOT natively transcribe audio — it's text-only.
- Claude.ai's Voice Mode supports 20 languages — **Hebrew is NOT among them.**
- The standard pattern (used by AssemblyAI's LeMUR, etc.) is: **transcribe with provider X → classify with Anthropic.**

**Tension:** Iron Rule 1.3 says "Anthropic Only — no OpenAI, no Gemini." Strict reading would forbid even Whisper for transcription.

**Recommended interpretation (pragmatic):**

| Reading | Allowed | Forbidden |
|---|---|---|
| **Strict:** Anthropic for ALL ML | (only Anthropic) | Whisper, Google STT, AssemblyAI, anything else |
| **Pragmatic:** Anthropic for ALL **LLM** work | Anthropic for classification + drafts; STT provider for transcription | OpenAI/Gemini/etc. for ANY language model task |

The intent of Rule 1.3 is "all LLM/text-generation goes through Anthropic so prompts, anti-AI hygiene, and quality control stay consistent." Speech recognition is a different layer — like image OCR or PDF parsing.

**ACTION ITEM (before implementing):** Dean to confirm the pragmatic reading and update CLAUDE.md §1.3 to clarify: "Anthropic for all LLM/text-generation work. Speech-to-text and other non-LLM ML services can use other providers."

---

## Provider choice

| Provider | Hebrew quality | Cost (per minute) | Per voice note (~15s avg) | Notes |
|---|---|---|---|---|
| **OpenAI Whisper API** | Excellent | $0.006/min | ~₪0.005 | Cheapest, best Hebrew. Strict-reading violation. |
| **AssemblyAI** | Very good | $0.011/min | ~₪0.011 | Has Anthropic LeMUR integration. **Pragmatic-clean.** |
| **Google Cloud STT** | Good | $0.024/min | ~₪0.022 | Most expensive. Free 60min/month. |
| **Azure Speech** | Good | $0.008/min | ~₪0.007 | Strong RTL. |
| **Local Whisper (self-hosted)** | Excellent | ~$50/mo VPS | ~₪0 | Ops burden. Bootstrap-incompatible. |

**Recommendation: AssemblyAI for v1.**

Rationale:
- Pragmatic Iron Rule reading + AssemblyAI's "Claude as analysis model" support honors the rule cleanly
- Hebrew quality is sufficient for SMB voice notes (clear single-speaker, OK audio quality)
- Cost ~₪0.011/voice-note × 100/month/tenant = ~₪1.10/month — negligible
- Migration path: if quality disappoints, swap to Azure (similar API)

---

## Architecture

```
WhatsApp webhook (POST /api/webhooks/whatsapp)
    ↓
Existing flow: validate sig, route to tenant, write to events table
    ↓
NEW: detect message_type='audio' → fire Inngest event 'voice/transcribe.message'
    ↓
NEW: Inngest function transcribeVoiceMessage (concurrency 5)
    1. Download media from WhatsApp Graph API (media_id → bytes)
    2. POST audio to AssemblyAI
    3. Poll for completion (5-15s typical)
    4. Update events.payload: transcription, transcription_lang, etc.
       Overwrite raw_message with the transcription so downstream
       agents see it as normal text.
    5. Fire 'message/transcribed' event to re-route through Watcher
    ↓
Existing Watcher flow runs unchanged on the transcribed text.
```

**Key design choice — async, not blocking:**
- WhatsApp webhook MUST ACK in <2s (Meta hard requirement)
- Transcription takes 5-15s typically, 30-60s for long notes
- Async via Inngest is durable: retries on failure, resumes on crash
- User-perceived latency: voice note → classification within ~10-20s

---

## Schema changes

**Migration `024_voice_transcription.sql`:**

```sql
-- The transcription itself goes inside events.payload (jsonb).
-- Keeps events generic, no DDL per new media type.
--
-- Convention:
--   payload->>'transcription'              Text result
--   payload->>'transcription_lang'         ISO code (typically 'he')
--   payload->>'transcription_at'           ISO timestamp
--   payload->>'transcription_provider'     'assemblyai' / 'whisper'
--   payload->>'transcription_confidence'   0..1
--
-- We retro-fit raw_message to be the transcription, so existing
-- queries reading raw_message JustWork.
--
-- This migration adds a tracking-only voice_transcription_jobs table
-- for debugging/cost-attribution. No DDL on events.

CREATE TABLE IF NOT EXISTS public.voice_transcription_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id      text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending',  -- pending|running|succeeded|failed|too_short|cost_capped
  provider      text NOT NULL DEFAULT 'assemblyai',
  duration_ms   integer,
  cost_ils      numeric(10,4),
  error_message text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);

CREATE INDEX idx_vtj_tenant_status ON public.voice_transcription_jobs(tenant_id, status);
CREATE INDEX idx_vtj_event ON public.voice_transcription_jobs(event_id);

ALTER TABLE public.voice_transcription_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant isolation read" ON public.voice_transcription_jobs
  FOR SELECT USING (
    tenant_id = public.current_tenant_id() OR public.is_super_admin()
  );

-- Writes only via service role (no user-facing INSERT/UPDATE)

NOTIFY pgrst, 'reload schema';  -- §15.16 lesson
```

**Why a tracking table at all:**
- Per-tenant cost attribution (sum cost_ils for monthly invoicing)
- Debug visibility ("why isn't voice transcription happening for tenant X?")
- Retry decision-making (succeeded vs failed status)

---

## File layout

| File | Type | Purpose |
|---|---|---|
| `supabase/migrations/024_voice_transcription.sql` | New | Schema above |
| `src/lib/transcription/types.ts` | New | `TranscriptionResult`, `TranscribeInput` types |
| `src/lib/transcription/assemblyai.ts` | New | AssemblyAI client, `transcribeAudio()` |
| `src/lib/transcription/_shared.ts` | New | Cost calc, error normalization |
| `src/lib/inngest/functions.ts` | Modify | Add `transcribeVoiceMessage` function |
| `src/lib/inngest/client.ts` | Modify | Add `INNGEST_EVENTS.VOICE_TRANSCRIBE_MESSAGE` |
| `src/app/api/webhooks/whatsapp/route.ts` | Modify | Detect audio, fire transcribe event |
| `src/lib/whatsapp/media-download.ts` | New (or extend) | Download media bytes from WhatsApp Graph API given media_id |
| `package.json` | Modify | Add `assemblyai` SDK |

**Estimated total: ~600-800 new lines.** Larger than 2C, smaller than Sprint 1.

---

## Error handling matrix

| Scenario | Action | Tenant-visible state |
|---|---|---|
| WhatsApp media download fails (4xx) | Mark failed, NO retry | Event with placeholder. Watcher skipped. Logged. |
| Media download fails (5xx/network) | Mark failed, Inngest auto-retries | Resolves automatically usually |
| AssemblyAI returns 4xx (bad audio) | Mark failed, NO retry | Tenant sees "voice not transcribed" badge in UI |
| AssemblyAI returns 5xx | Auto-retry up to 4× | Resolves automatically |
| Audio too short (<1s) | Skip, mark `'too_short'` | No cost burn on fat-finger sends |
| Non-Hebrew language detected | Transcribe anyway, set `transcription_lang` | Watcher prompts are Hebrew-only — may classify oddly. v1 acceptable. |
| Cost cap exceeded | Skip, mark `'cost_capped'` | Solo tier with extreme volume. Edge case. |

In ALL non-success cases, the event ROW is preserved with placeholder text. Tenant doesn't lose the message — they just don't get LLM classification of it.

---

## Cost analysis

Per voice note: ~$0.003 (~₪0.011) at AssemblyAI rates.

Per tenant per month at typical volumes:
- 50 voice notes/month: ~₪0.55
- 100 voice notes/month: ~₪1.10
- 200 voice notes/month: ~₪2.20

Negligible relative to per-tenant Anthropic spend (~₪3-5/month for the existing 9 agents). Total compute ~₪5-7/tenant/month including voice.

In Pro tier (₪690/mo) and Chain (₪1,490/mo) this is invisible. In Solo (₪290/mo) it's still 1-2% of revenue, well within margin.

**Per-tenant cap:** add `voice_transcription: 0.02` to `AGENT_COST_ESTIMATES_ILS`. Tenants on Solo with extreme voice volume (>500/month — unusual) would hit the cap and miss transcriptions — graceful degradation.

---

## UI implications

**Existing showcase / approvals views:** voice messages currently render with placeholder. After this change, they'll render with the transcription. Nice-to-haves (NOT required for v1):
- 🎤 indicator that the message originated as voice (so tenant knows it's a transcription)
- Link to download/play the original audio
- Show transcription confidence as a small note

**v1 just needs raw_message to contain the transcription** so existing UI components display useful text. Polish in a follow-up sub-stage.

---

## Test plan

1. **Unit:** mock AssemblyAI response, verify transcription written to `events.payload->>'transcription'` and `raw_message` overwritten.
2. **Integration:** seed an audio event in DEMO_TENANT (use a real Hebrew voice note from your phone). Trigger the transcription Inngest function. Verify:
   - voice_transcription_jobs row created with status='succeeded'
   - cost_ils populated
   - events.payload updated with transcription
3. **End-to-end:** send yourself a voice note via WhatsApp on the connected DEMO phone. Within 30 seconds:
   - Webhook receives the audio event
   - voice_transcription_jobs row appears: pending → running → succeeded
   - Watcher classifies the resulting text (visible in agent_runs)
   - If voice note contains hot-lead language, hot_leads agent fires
4. **Cost:** check 5 voice notes — verify cost_ils total around ~₪0.05.
5. **Failure path:** intentionally send a 0.3-second clip. Verify status='too_short' and no cost incurred.

---

## What's NOT in v1 (deferred)

- **UI badge for voice messages** — backend only for v1, UI polish later
- **Per-tenant transcription provider selection** — locked to AssemblyAI for v1
- **Speaker diarization** (multi-speaker detection) — irrelevant for SMB use case
- **Translation** (non-Hebrew → Hebrew) — Watcher prompts assume Hebrew; tenants with multilingual customers can revisit
- **Voice-specific classification signals** (sarcasm, urgency from tone) — v1 just transcribes; tone analysis is future
- **Self-hosted Whisper** for cost optimization — only worth it >5,000 transcriptions/month

---

## Estimated effort

- Migration + types/helpers: 30 min
- AssemblyAI client: 45 min
- Webhook integration (audio detection + event firing): 30 min
- Inngest transcription function: 60 min
- Media download from WhatsApp Graph: 30 min
- End-to-end testing: 60 min
- **Total: ~4-5 hours.** One focused session.

---

## Open questions for Dean before implementing

1. **Iron Rule 1.3 reading** — strict or pragmatic? (Recommendation: pragmatic + clarify in CLAUDE.md.)
2. **AssemblyAI vs alternatives** — sticking with my recommendation, or strong preference?
3. **Cost cap default** — `voice_transcription: 0.02` in AGENT_COST_ESTIMATES_ILS, or different?
4. **UI badge in v1 or v2?** — backend-only first is faster but tenants will be slightly confused initially.

Answer these before opening the implementation session and the work goes smoothly. Half the spec was eliminating ambiguity that would have wasted a session of back-and-forth.
