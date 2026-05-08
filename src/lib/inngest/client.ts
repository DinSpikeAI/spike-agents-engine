// src/lib/inngest/client.ts
//
// Singleton Inngest client.
//
// This is the entry point for sending events from anywhere in the app
// (server actions, API routes, agent cron handlers). The client picks
// up INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY from process.env at
// runtime; no manual configuration needed here.
//
// In local development the Inngest Dev Server runs on port 8288 — the
// SDK auto-detects when running locally and routes events there. In
// production, events route to Inngest Cloud.
//
// SERVER-ONLY: do not import this from Client Components.

import "server-only";
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "spike-engine",
  // Event key + signing key are auto-loaded from the environment.
  // INNGEST_EVENT_KEY (required in prod): used to send events
  // INNGEST_SIGNING_KEY (required in prod): used to verify webhook signatures
});

/**
 * Event-name registry — keep this list in sync with the function
 * triggers in functions.ts.
 *
 * Convention: namespace/verb.subject (e.g. "growth/run.tenant")
 */
export const INNGEST_EVENTS = {
  GROWTH_RUN_TENANT: "growth/run.tenant",
} as const;

export type InngestEventName =
  (typeof INNGEST_EVENTS)[keyof typeof INNGEST_EVENTS];
