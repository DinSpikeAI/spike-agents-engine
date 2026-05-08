# Sprint 2 Batch 2C — WhatsApp Send Integration

**Status:** SPEC READY (not yet implemented). Author: Claude. Date: 2026-05-08.

**Prerequisite:** Batch 2B (UI) merged + deployed. The `OpportunityCard` button "אשר" calls `approveGrowthCandidate(candidateId)` which currently just sets `status='approved'`.

**Goal of 2C:** wire the actual WhatsApp Cloud API send into `approveGrowthCandidate`, append a `growth_outcomes` row of type `'sent'`, and surface success/error to the user.

---

## Iron Rule reminder

The Iron Rule says "AI מסמן, בעלים מחליט" — drafts only. **2C does NOT violate this.** The owner has already explicitly clicked "אשר" — that click IS the human approval. The send happens AS A RESULT of human approval, not autonomously. Same flow as `/dashboard/approvals` for the existing 8 agents.

---

## What needs to change

### 1. `src/app/dashboard/actions/growth.ts` — extend `approveGrowthCandidate`

**Current behavior** (Batch 2A):
1. Validate candidate exists, is pending, not expired
2. Optionally update `draft_message` if `editedMessage` provided
3. Update status to `'approved'`, set `decided_at` + `decided_by`
4. Return `{ ok: true, message: "אושר. (Sprint 2C יוסיף שליחה אוטומטית)" }`

**New behavior** (Batch 2C):
1-3. Same as above
4. **NEW:** Look up the customer's phone — for `source='interactions'` it's `customer_phone` (already on the row). For Meta sources (instagram/facebook) we cannot send via WhatsApp — return error "שליחה ב-Instagram/Facebook עדיין לא נתמכת (Sprint 3)".
5. **NEW:** Look up tenant's WhatsApp connection from `integrations` table:
   ```typescript
   const { data: integration } = await db
     .from("integrations")
     .select("metadata, status")
     .eq("tenant_id", tenantId)
     .eq("provider", "whatsapp")
     .eq("status", "connected")
     .maybeSingle();
   ```
   If no connected integration → return `{ ok: false, message: "WhatsApp לא מחובר. פנה לתמיכה." }`.
6. **NEW:** Call `sendWhatsAppMessage(...)` (see #2 below).
7. **NEW:** On success — insert `growth_outcomes` row (`outcome_type: 'sent'`).
8. **NEW:** On failure — leave status='approved' (so user can retry from UI), return error message.

Updated return message on success: `{ ok: true, message: "ההודעה נשלחה." }`.

### 2. `src/lib/whatsapp/send.ts` — verify or create the send helper

**Likely already exists** for the existing 8 agents. Path may be `src/lib/whatsapp/send-message.ts` or similar. Need to verify before 2C session.

**Expected contract:**
```typescript
interface SendWhatsAppMessageInput {
  tenantId: string;
  toPhone: string;            // E.164 format (e.g. '+972541234567')
  messageBody: string;
  phoneNumberId: string;      // From integrations.metadata.phone_number_id
  accessToken: string;        // From integrations.metadata.access_token (encrypted at rest — TODO Vault)
  /** Optional: track which agent triggered the send for analytics */
  triggeredBy?: { agent: 'growth'; candidateId: string };
}

interface SendWhatsAppMessageResult {
  ok: boolean;
  whatsappMessageId?: string;  // wamid.xxxxx returned by Meta
  errorCode?: string;          // Meta error code if failed (e.g. '131051' = 24h window expired)
  errorMessage?: string;
}

async function sendWhatsAppMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult>;
```

**If the helper exists:** use it. Just import and call.

**If it does not exist or has different shape:** the WhatsApp Cloud API call itself is:
```typescript
// POST https://graph.facebook.com/v22.0/{phone_number_id}/messages
// Headers: Authorization: Bearer {access_token}, Content-Type: application/json
// Body:
{
  "messaging_product": "whatsapp",
  "to": "+972541234567",                     // E.164, no leading +/spaces
  "type": "text",
  "text": { "body": "ההודעה כאן" }
}
```

Response on success:
```json
{
  "messaging_product": "whatsapp",
  "contacts": [{"input": "+972541234567", "wa_id": "972541234567"}],
  "messages": [{"id": "wamid.HBgM..."}]
}
```

### 3. The 24-hour window problem

WhatsApp Cloud API has a hard rule: outbound messages to a customer require either:
- (a) The customer messaged YOU within the last 24 hours (open conversation window), OR
- (b) You use a **pre-approved HSM template** (no editable text — placeholders only)

**Reactivation candidates by definition violate (a)** — they're 45+ days dormant. So they cannot receive a free-text message.

**Implication for Batch 2C:**

Either:
- **Option α (clean, expensive):** require a pre-approved template like `growth_reactivation_v1` with one variable `{{1}}` for the customer's first name. The Sonnet draft becomes the template's variable. **But:** Meta templates have content rules — they can't be too sales-y, can't have all the personalization Sonnet generates. This kills the value of the personalized draft.
- **Option β (cheap, broken):** just try to send the freeform text and let it fail. UI shows the error. User confused.
- **Option γ (pragmatic, MVP):** **detect the situation client-side and refuse to send.** When `approveGrowthCandidate` runs, check: was there an inbound message from this customer in the last 24h? If yes → send freeform. If no → return a special error: "הלקוח לא פנה ב-24 השעות האחרונות. WhatsApp לא מאפשר שליחה ישירה ב-state הזה. תוכל להעתיק את הטקסט ולשלוח ידנית."

**Recommendation: γ for Batch 2C.** Real fix = Option α post-launch when we have approved templates.

The 24h check query:
```typescript
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const { data: recentInbound } = await db
  .from("events")
  .select("id")
  .eq("tenant_id", tenantId)
  .eq("provider", "whatsapp")
  .eq("event_type", "whatsapp_message_received")
  .filter("payload->>contact_phone", "eq", customerPhone)
  .gte("received_at", cutoff)
  .limit(1);

const isWithin24hWindow = (recentInbound ?? []).length > 0;
```

For Lead Discovery (source='interactions' but candidate is a recent unanswered DM in our system rather than truly dormant), they're typically WITHIN the 24h window so freeform send works.

For Reactivation (45+ days dormant), they're typically OUTSIDE the window. UI will show the "copy + send manually" guidance.

**UI implication for OpportunityCard (already in 2B):** consider adding a small badge "מחוץ לחלון 24 שעות" on the card if the candidate is outside the window. Optional polish — not strictly needed for 2C correctness.

### 4. Error handling matrix

| Scenario | What to do | User-facing message |
|---|---|---|
| Tenant has no WhatsApp integration connected | Don't attempt send, leave status='approved' | `"WhatsApp לא מחובר. פנה לתמיכה."` |
| Customer phone null (Meta source) | Don't attempt send | `"שליחה ב-Instagram/Facebook עדיין לא נתמכת (Sprint 3)."` |
| Outside 24h window | Don't attempt send | `"הלקוח לא פנה ב-24 שעות. העתק את הטקסט ושלח ידנית כעת."` |
| Meta returns 401/auth error | Don't retry, mark integration broken? | `"בעיית גישה ל-WhatsApp. פנה לתמיכה."` |
| Meta returns 4xx (template required, etc.) | Don't retry | `"WhatsApp דחה את ההודעה: {error_message}"` |
| Meta returns 5xx (transient) | Retry up to 2 times with exponential backoff | If still failed: `"שגיאה זמנית. נסה שוב בעוד דקה."` |
| Network timeout | Retry up to 2 times | If still failed: same as above |
| Send succeeds | Insert outcome row, return success | `"ההודעה נשלחה."` |

In ALL non-success cases, status remains `'approved'` so user can retry by clicking "אשר" again. No automatic retries on the same click — only manual.

### 5. The `growth_outcomes` insert

On success only:
```typescript
await db.from("growth_outcomes").insert({
  tenant_id: tenantId,
  candidate_id: candidateId,
  outcome_type: "sent" satisfies GrowthOutcomeType,
  reported_value_ils: null,  // payload metadata can come later via migration
});
```

Note: We don't currently store the WhatsApp `message_id` in growth_outcomes. Future migration could add a `metadata jsonb` column to `growth_outcomes` to track the wamid for reply correlation. For 2C MVP, just having the outcome row is enough.

### 6. revalidatePath

After successful send, `revalidatePath("/dashboard/growth")` is already called by 2A. The candidate's status is still `'approved'` (we don't add a 'sent' status — see §10.30 of CLAUDE.md). So the candidate disappears from the pending list naturally.

### 7. UI feedback (already in 2B)

`OpportunityCard` already calls `approveGrowthCandidate` via `useTransition` and shows the result toast. Nothing UI-side needs to change — the new error messages from 2C just flow through the existing toast.

---

## Files touched by 2C

| File | Type | Change |
|---|---|---|
| `src/app/dashboard/actions/growth.ts` | Modify | Extend `approveGrowthCandidate` with send wiring |
| `src/lib/whatsapp/send.ts` (or wherever it is) | Verify | Confirm contract; only modify if missing/wrong |
| `src/lib/agents/growth/types.ts` | Possibly modify | Add `WhatsAppSendError` type if useful |

**Estimated total: ~80-150 new lines** (mostly in growth.ts).

---

## Test plan after 2C deploy

1. **Setup:** ensure DEMO_TENANT has a connected WhatsApp integration in `integrations` table with valid `phone_number_id` + `access_token`.
2. **Seed:** invoke `triggerGrowthOnDemand` to generate a fresh draft (use the synthetic seed approach).
3. **Test 1 — outside 24h window:** approve a candidate whose customer hasn't messaged in 24h. Expect error toast with "העתק ושלח ידנית" message. Verify candidate status is `'approved'` (not `'sent'`). No `growth_outcomes` row inserted.
4. **Test 2 — inside 24h window:** seed a customer with an inbound message in the last 24h, then approve. Expect success toast. Verify `growth_outcomes` row of type `'sent'`. Verify the WhatsApp message actually arrived on Meta side.
5. **Test 3 — broken integration:** disconnect the integration, try to approve. Expect "WhatsApp לא מחובר" error. Status remains `'approved'`.

---

## What's NOT in 2C (deferred)

- **Reply tracking** (`growth_outcomes` of type `'replied'`) — needs webhook integration to detect replies and correlate with sent candidates via wamid. Future sub-stage.
- **HSM template support** for outside-24h-window sends — requires Meta template approval (external, weeks of waiting). Future sub-stage.
- **Vault encryption for `access_token`** — currently plain in `integrations.metadata`. Pre-revenue acceptable; pre-launch must address.
- **Meta IG/FB DM sending** (Sprint 3 — different graph API, different token format).
- **Bulk approve** — currently one-at-a-time. If the owner has 15 drafts, they click 15 times. Acceptable for MVP given each draft is bespoke; bulk would defeat the personalization premise.

---

## Estimated effort

- Reading existing WhatsApp send code: 15 min
- Implementing the extended approveGrowthCandidate: 45-60 min
- Testing end-to-end: 30 min
- **Total: ~2 hours.**

Smaller than Batch 2B by design — most complexity already lives in 2A's actions and the existing WhatsApp send infra.
