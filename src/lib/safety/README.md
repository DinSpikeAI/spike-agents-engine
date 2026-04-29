# Spike Engine — Safety Layer (Day 7)

This directory contains the safety primitives that every outbound agent (`reviews_agent`, `social_posts_agent`, `sales_agent`) MUST use. Internal agents (`morning_agent`, `watcher_agent`, `manager_agent`) bypass most of this — they don't generate outbound content.

## The 4 Protocols (Israeli Compliance, April 2026)

### Protocol 1: Draft → Approve → Send
**Source of truth:** `drafts` table (extended in migration 010).
**Iron rule:** No agent action with external impact executes without `drafts.status = 'approved'` set by a human.

`drafts.action_type`:
- `never_auto` — discounts, refunds, public commitments. Blocked from autosend even if approved by mistake.
- `requires_approval` — outbound text (review reply, DM, email). Default for outbound.
- `autosend_safe` — internal only (morning brief, watcher alerts in dashboard).

### Protocol 2: PII Scrubber
**File:** `pii-scrubber.ts`.
**Function:** `scrubPii(text)` redacts ת.ז./phone/email/IBAN/credit_card before any text crosses into a Claude prompt. **Names are preserved** — they're the data point, and the agent needs them to reply personally.

### Protocol 3: Prompt Injection Guard
**File:** `prompt-injection-guard.ts`.
**Function:** `wrapUntrustedInput(text)` wraps end-customer text in `<USER_CONTENT>` sentinel tags. The system prompt of every agent that consumes wrapped content includes `PROMPT_INJECTION_GUARD_INSTRUCTION` telling Claude that content between sentinels is **data, not instructions**.

### Protocol 4: Gender Lock
**File:** `gender-lock.ts`.
**Function:** `withGenderLock(staticPrompt, gender)` returns a `system` array for the Anthropic API with the static prompt cached + the gender instruction appended dynamically. Gender comes from `tenants.business_owner_gender` set at onboarding.

## The Wrapper

`run-agent-safe.ts` orchestrates all 4 protocols + writes to `drafts` + runs the defamation classifier. Use it for any agent that produces outbound content.

```ts
import { runAgentWithSafety, sanitizeUntrustedInput, prepareSafetySystemBlocks } from "@/lib/agents/run-agent-safe";

// In your reviews_agent run.ts:
const sanitized = sanitizeUntrustedInput(rawReviewText);
const systemBlocks = prepareSafetySystemBlocks(REVIEWS_AGENT_SYSTEM_PROMPT, tenant.gender);

const result = await runAgentWithSafety(
  { tenantId, agentId: "reviews", model: "claude-sonnet-4-6", triggerSource: "scheduled" },
  {
    draftType: "review_reply",
    actionType: "requires_approval",
    requiresDefamationCheck: true,
    untrustedInputs: { review: rawReviewText },
    recipient: { channel: "google_review_reply", identifier: reviewId, label: reviewerName },
    externalTarget: { google_review_id: reviewId },
  },
  async () => {
    // The actual Anthropic call lives here. Use the prepared system blocks.
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemBlocks,
      messages: [{ role: "user", content: `ביקורת לתגובה:\n${sanitized.forPrompt}` }],
      // ... output_config, etc.
    });
    return { output: parsedOutput, usage: response.usage };
  },
  {
    outputForReview: (out) => out.replyText,
    originalReviewText: rawReviewText,
  }
);

// result.draftId is the drafts.id — owner sees it in the Approval Inbox.
// result.blockedReason !== null means defamation guard blocked it.
```

## Defamation Guard

`defamation-guard.ts` runs a Haiku 4.5 classifier on every reviews_agent draft before it lands in the approval queue. Cost: ~$0.001/check.

- `risk = 'high'` → draft is `rejected` immediately, owner sees `buildOwnerBlockMessage()` explaining why
- `risk = 'medium'` → draft enters approval queue with a yellow warning
- `risk = 'low'` → standard flow

## Files

| File | Purpose |
|------|---------|
| `pii-scrubber.ts` | Redact PII before LLM. `scrubPii()`, `hashRecipient()` |
| `prompt-injection-guard.ts` | Sentinel-tag wrapping. `wrapUntrustedInput()`, `PROMPT_INJECTION_GUARD_INSTRUCTION` |
| `gender-lock.ts` | Hebrew gender instructions. `withGenderLock()`, `buildGenderInstruction()` |
| `defamation-guard.ts` | Haiku classifier per Israeli Defamation Law 5725-1965. `checkDefamationRisk()`, `buildOwnerBlockMessage()` |

## Migrations

| File | What |
|------|------|
| `010_drafts_safety_columns.sql` | ALTER TABLE drafts: `action_type`, `defamation_risk`, `defamation_flagged_phrases`, `contains_pii`, `pii_scrubbed`, `rejected_at`, `rejection_reason`, `recipient_hash`, `recipient_label` |
| `011_tenants_compliance_columns.sql` | ALTER TABLE tenants: `business_owner_gender`, `business_id_number`, `business_id_type`, `business_address`, `business_phone`, `consent_status`, `dpa_accepted_at`, `dpa_accepted_by`, `dpa_version`, `accessibility_acknowledged_at`, `vertical` |
| `012_do_not_contact.sql` | New table for §30A compliance |

## What Gets Used Where

| Agent | scrubPii | wrapUntrusted | gender-lock | defamation-guard | runAgentWithSafety |
|-------|----------|---------------|-------------|------------------|-------------------|
| morning  | n/a (no end-customer input) | n/a | ✓ | n/a | uses runAgent (existing) |
| watcher  | n/a (operates on event metadata) | n/a | ✓ (recommended) | n/a | uses runAgent (existing) |
| reviews  | ✓ | ✓ | ✓ | ✓ | ✓ |
| hot_leads | ✓ | ✓ | ✓ | n/a (no outbound) | uses runAgent (existing) |
| sales    | ✓ | ✓ | ✓ | ✓ | ✓ |
| social   | ✓ (if reading customer DMs) | ✓ | ✓ | ✓ | ✓ |
| manager  | n/a | n/a | ✓ | n/a | uses runAgent (existing) |
| cleanup  | n/a | n/a | n/a | n/a | uses runAgent (existing) |
| inventory | n/a | n/a | ✓ | n/a | uses runAgent (existing) |
