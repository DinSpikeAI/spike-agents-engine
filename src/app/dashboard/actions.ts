// src/app/dashboard/actions.ts
//
// ────────────────────────────────────────────────────────────────────
// Refactored 2026-05-04 (session 6): split from a 1430-line monolith
// into 6 focused files under ./actions/ for maintainability.
// This file now ONLY re-exports — the implementation lives in:
//
//   ./actions/_shared.ts           → internal helpers (NOT re-exported)
//   ./actions/manager.ts           → Manager weekly-lock state machine
//   ./actions/agent-triggers.ts    → 7 trigger* functions for non-Manager agents
//   ./actions/drafts.ts            → Approval inbox: list/approve/reject
//   ./actions/leads.ts             → Hot Leads board: list/contact/dismiss
//   ./actions/reports-kpis.ts      → Manager reports + Dashboard KPI strip
//   ./actions/inventory.ts         → CSV upload + snapshot/analysis queries
//
// Why re-export instead of migrating imports across 15+ Client Components:
//   - Zero risk of accidentally breaking a consumer
//   - Splits structural change from any future behavior changes
//   - Existing imports like `from "@/app/dashboard/actions"` keep working
//
// IMPORTANT: this file does NOT have "use server" at the top because
// it does not define any new server actions itself — the actual actions
// live in the sibling files, each of which has its own "use server"
// directive. Re-exports inherit the directive from the source file.
// ────────────────────────────────────────────────────────────────────

// Manager
export type { ManagerLockState } from "./actions/manager";
export {
  getManagerLockState,
  markManagerReportRead,
  triggerManagerAgentAction,
} from "./actions/manager";

// Non-Manager agent triggers
export {
  triggerMorningAgentAction,
  triggerWatcherAgentAction,
  triggerReviewsAgentAction,
  triggerHotLeadsAgentAction,
  triggerSocialAgentAction,
  triggerSalesAgentAction,
  triggerInventoryAgentAction,
} from "./actions/agent-triggers";

// Drafts (Approval inbox)
export type { PendingDraft } from "./actions/drafts";
export {
  listPendingDrafts,
  approveDraft,
  rejectDraft,
} from "./actions/drafts";

// Leads (Hot Leads board)
export type { ClassifiedLead } from "./actions/leads";
export {
  listClassifiedLeads,
  markLeadContacted,
  dismissLead,
} from "./actions/leads";

// Reports + KPIs
export type {
  ManagerReportRow,
  DashboardKpis,
} from "./actions/reports-kpis";
export {
  listManagerReports,
  getDashboardKpis,
} from "./actions/reports-kpis";

// Inventory
export type {
  UploadInventoryResult,
  InventorySnapshotRow,
} from "./actions/inventory";
export {
  uploadInventoryCsv,
  getLatestInventorySnapshot,
  getLatestInventoryAnalysis,
} from "./actions/inventory";
