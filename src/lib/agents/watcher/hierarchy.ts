// src/lib/agents/watcher/hierarchy.ts
//
// Source of truth for Watcher classification policy.
//
// CORE PRINCIPLE — "AI marks, owner decides":
//   The LLM is a CLASSIFIER, not a filter. It must NEVER silently drop
//   an event that matches one of the categories below. Every event the
//   LLM sees that fits a category MUST appear in the alerts array.
//
//   Filtering, ranking, and "is this worth showing" decisions all happen
//   in code (or, eventually, in user-facing controls). Severity here is
//   the policy lever — change one line, no LLM retraining.
//
// This file is INTENTIONALLY isomorphic (no "server-only"): the UI button
// imports CATEGORY_LABELS_HE / SEVERITY_LABELS_HE for rendering. There
// are no secrets here — just a public taxonomy.

// ─────────────────────────────────────────────────────────────
// Categories (closed set — LLM must pick exactly one of these)
// ─────────────────────────────────────────────────────────────

export const WATCHER_CATEGORIES = [
  // critical
  "negative_review",
  "customer_complaint",
  "urgent_message",
  "new_lead",
  // high
  "payment_issue",
  "hot_inquiry",
  // medium
  "schedule_change",
  "low_inventory",
  "appointment_soon",
  // low
  "positive_review",
  "routine_update",
] as const;

export type WatcherCategory = (typeof WATCHER_CATEGORIES)[number];

// ─────────────────────────────────────────────────────────────
// Severity tiers
// ─────────────────────────────────────────────────────────────

export type WatcherSeverity = "critical" | "high" | "medium" | "low";

// ─────────────────────────────────────────────────────────────
// Category → Severity mapping (THE policy — change this, not the prompt)
// ─────────────────────────────────────────────────────────────

export const CATEGORY_SEVERITY: Record<WatcherCategory, WatcherSeverity> = {
  // critical
  negative_review:    "critical",
  customer_complaint: "critical",
  urgent_message:     "critical",
  new_lead:           "critical",
  // high
  payment_issue:      "high",
  hot_inquiry:        "high",
  // medium
  schedule_change:    "medium",
  low_inventory:      "medium",
  appointment_soon:   "medium",
  // low
  positive_review:    "low",
  routine_update:     "low",
};

// ─────────────────────────────────────────────────────────────
// Sort rank (lower = more urgent)
// ─────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<WatcherSeverity, number> = {
  critical: 0,
  high:     1,
  medium:   2,
  low:      3,
};

export function severityRank(severity: WatcherSeverity): number {
  return SEVERITY_RANK[severity];
}

// ─────────────────────────────────────────────────────────────
// Hebrew labels (for UI rendering)
// ─────────────────────────────────────────────────────────────

export const CATEGORY_LABELS_HE: Record<WatcherCategory, string> = {
  negative_review:    "ביקורת שלילית",
  customer_complaint: "תלונת לקוח",
  urgent_message:     "הודעה דחופה",
  new_lead:           "ליד חדש",
  payment_issue:      "תקלת תשלום",
  hot_inquiry:        "פנייה חמה",
  schedule_change:    "שינוי בלו״ז",
  low_inventory:      "מלאי נמוך",
  appointment_soon:   "פגישה קרובה",
  positive_review:    "ביקורת חיובית",
  routine_update:     "עדכון שגרתי",
};

export const SEVERITY_LABELS_HE: Record<WatcherSeverity, string> = {
  critical: "קריטי",
  high:     "גבוה",
  medium:   "בינוני",
  low:      "נמוך",
};
