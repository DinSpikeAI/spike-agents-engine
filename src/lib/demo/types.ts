// src/lib/demo/types.ts
//
// Shared types and constants for the Demo UI (Sub-stage 1.4).
//
// This file is a NEUTRAL module — no "use server" or "use client" directive.
// It can be safely imported by:
//   - Server Actions (src/app/dashboard/demo/actions.ts)
//   - Client Components (src/components/demo/demo-panel.tsx)
//   - Route Handlers (src/app/api/demo/status/route.ts)
//
// Why this file exists: a "use server" file (Server Action) can ONLY export
// async functions. Constants and interfaces declared in such a file are
// stripped at build time, leaving them as `undefined` in client imports.
// This caused a runtime crash on the first render of the demo panel.
//
// Lesson: when a constant or type needs to be shared between a Server
// Action file and a Client Component, put it in a neutral module.

// ─────────────────────────────────────────────────────────────
// Template definitions
// ─────────────────────────────────────────────────────────────

export type DemoTemplate = "hot_lead" | "question" | "complaint" | "review";

export interface DemoTemplateConfig {
  contactName: string;
  contactPhone: string;
  text: string;
  expectedBucket: "hot" | "warm" | "cold" | "burning" | "spam_or_unclear";
  expectedCascade: boolean;
  description: string;
}

/**
 * Four prebuilt templates that exercise different pipeline paths.
 *
 * - hot_lead    → bucket=hot/burning  → Sales QuickResponse cascades
 * - question    → bucket=warm         → no cascade (owner replies manually)
 * - complaint   → bucket=cold/spam    → no cascade (Watcher categorizes as complaint)
 * - review      → bucket=cold/spam    → no cascade (Watcher categorizes as positive_review)
 *
 * The "expectedBucket" / "expectedCascade" fields are advisory only — used
 * for the UI to set initial expectations. The actual classification comes
 * from the LLM, which is the whole point of the demo.
 */
export const DEMO_TEMPLATES: Record<DemoTemplate, DemoTemplateConfig> = {
  hot_lead: {
    contactName: "מוחמד אבו ראס",
    contactPhone: "+972541234567",
    text: "שלום, אני צריך דחוף לקבוע פגישה היום. רוצה לבדוק את הטיפול. תקציב 2000 שקל. מתי אתם פנויים?",
    expectedBucket: "hot",
    expectedCascade: true,
    description: "ליד חם — דחיפות + intent + תקציב. cascade ל-Sales.",
  },
  question: {
    contactName: "דנה לוי",
    contactPhone: "+972502222222",
    text: "שלום, רציתי לבדוק מחירים לטיפול שיער",
    expectedBucket: "warm",
    expectedCascade: false,
    description: "שאלה כללית — לא חם מספיק ל-cascade.",
  },
  complaint: {
    contactName: "שרה כהן",
    contactPhone: "+972503333333",
    text: "הייתי אצלכם אתמול ולא הייתי מרוצה בכלל. השירות היה איטי והרגשתי לא בנוח. מצפה לתגובה.",
    expectedBucket: "spam_or_unclear",
    expectedCascade: false,
    description: "תלונה — Watcher יסמן, Hot Leads לא יזהה כליד.",
  },
  review: {
    contactName: "יוסי כהן",
    contactPhone: "+972504444444",
    text: "תודה רבה על השירות המעולה היום! ממש נהניתי, אחזור בוודאי.",
    expectedBucket: "spam_or_unclear",
    expectedCascade: false,
    description: "ביקורת חיובית — Watcher יסמן, Hot Leads לא ליד.",
  },
};

// ─────────────────────────────────────────────────────────────
// Action result type
// ─────────────────────────────────────────────────────────────

export interface RunDemoTemplateResult {
  ok: boolean;
  eventId?: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Status polling response type
// ─────────────────────────────────────────────────────────────

export interface DemoStatusResponse {
  ok: boolean;
  error?: string;
  event: {
    id: string;
    received_at: string;
  } | null;
  watcher: {
    status: "running" | "succeeded" | "failed" | "no_op" | null;
    cost_ils: number | null;
    finished_at: string | null;
  };
  hot_leads: {
    bucket: string | null;
    reason: string | null;
    suggested_action: string | null;
    classified_at: string | null;
  };
  sales_qr: {
    status:
      | "pending_classification"  // hot_leads not yet done
      | "skipped_cold_bucket"     // hot_leads done, bucket cold/warm/spam — no cascade
      | "drafting"                // bucket=hot/burning, draft not yet ready
      | "draft_ready"             // draft inserted
      | null;
    draft_id: string | null;
    message_text: string | null;
  };
}
