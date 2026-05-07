// src/app/dashboard/integrations/actions.ts
//
// Sub-stage 2.0 (revision 2026-05-07) — Customer-side integrations.
//
// Customers do NOT manage their own integrations directly. The setup flow
// (entering Meta phone_number_id, WABA id, etc.) is handled by Spike admin
// staff via /admin/integrations on behalf of the customer. This file
// intentionally exports only types — no action functions — because the
// customer-facing page is read-only.
//
// If you're looking for connect/disconnect logic, see:
//   src/app/admin/integrations/actions.ts

export interface IntegrationMetadata {
  phone_number_id?: string;
  display_phone_number?: string;
  whatsapp_business_account_id?: string;
  connected_via?: string;
  connected_at?: string;
  [k: string]: unknown;
}
