"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markLeadContacted,
  dismissLead,
  type ClassifiedLead,
} from "@/app/dashboard/actions";
import type { LeadBucket } from "@/lib/agents/types";

// ─────────────────────────────────────────────────────────────
// Bucket styling
// ─────────────────────────────────────────────────────────────

const BUCKET_CONFIG: Record<
  LeadBucket,
  { label: string; emoji: string; bg: string; border: string; text: string; order: number }
> = {
  blazing: {
    label: "בוער",
    emoji: "🔥",
    bg: "rgba(239, 68, 68, 0.10)",
    border: "rgba(239, 68, 68, 0.40)",
    text: "#FCA5A5",
    order: 1,
  },
  hot: {
    label: "חם",
    emoji: "🟠",
    bg: "rgba(249, 115, 22, 0.10)",
    border: "rgba(249, 115, 22, 0.40)",
    text: "#FDBA74",
    order: 2,
  },
  warm: {
    label: "פושר",
    emoji: "🟡",
    bg: "rgba(252, 211, 77, 0.10)",
    border: "rgba(252, 211, 77, 0.40)",
    text: "#FDE68A",
    order: 3,
  },
  cold: {
    label: "קר",
    emoji: "🔵",
    bg: "rgba(59, 130, 246, 0.10)",
    border: "rgba(59, 130, 246, 0.40)",
    text: "#93C5FD",
    order: 4,
  },
  spam_or_unclear: {
    label: "ספאם / לא ברור",
    emoji: "🚫",
    bg: "rgba(100, 116, 139, 0.10)",
    border: "rgba(100, 116, 139, 0.40)",
    text: "#94A3B8",
    order: 5,
  },
};

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram_dm: "Instagram",
  website_form: "טופס אתר",
  email: "Email",
  phone_call_transcript: "שיחה",
};

// ─────────────────────────────────────────────────────────────
// Single lead card
// ─────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  onContact,
  onDismiss,
  isPending,
}: {
  lead: ClassifiedLead;
  onContact: () => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  const bucket = (lead.bucket ?? "spam_or_unclear") as LeadBucket;
  const config = BUCKET_CONFIG[bucket];
  const ageMinutes = Math.floor(
    (Date.now() - new Date(lead.received_at).getTime()) / (60 * 1000)
  );
  const ageLabel =
    ageMinutes < 60
      ? `לפני ${ageMinutes} דק׳`
      : ageMinutes < 1440
      ? `לפני ${Math.floor(ageMinutes / 60)} שע׳`
      : `לפני ${Math.floor(ageMinutes / 1440)} ימים`;

  const features = lead.score_features as Record<string, unknown>;
  const intentCount = Number(features.intentKeywordsCount ?? 0);
  const urgencyCount = Number(features.urgencySignalsCount ?? 0);
  const hasProduct = !!features.hasSpecificProduct;
  const hasBudget = !!features.mentionedBudget;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
      }}
    >
      {/* Header: source + age */}
      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
        <span>{SOURCE_LABELS[lead.source] ?? lead.source}</span>
        <span>{ageLabel}</span>
      </div>

      {/* Display name */}
      <div className="mb-2 text-sm font-bold text-slate-100">
        {lead.display_name ?? "אנונימי"}
      </div>

      {/* Message preview */}
      <p className="mb-3 text-sm text-slate-300 leading-relaxed line-clamp-3">
        {lead.raw_message}
      </p>

      {/* Behavior signals row */}
      <div className="mb-3 flex flex-wrap gap-1 text-[10px]">
        {intentCount > 0 && (
          <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-slate-300">
            כוונה ×{intentCount}
          </span>
        )}
        {urgencyCount > 0 && (
          <span className="rounded bg-red-700/30 px-1.5 py-0.5 text-red-200">
            דחיפות ×{urgencyCount}
          </span>
        )}
        {hasProduct && (
          <span className="rounded bg-emerald-700/30 px-1.5 py-0.5 text-emerald-200">
            מוצר ספציפי
          </span>
        )}
        {hasBudget && (
          <span className="rounded bg-cyan-700/30 px-1.5 py-0.5 text-cyan-200">
            תקציב
          </span>
        )}
      </div>

      {/* Reason from LLM */}
      {lead.reason && (
        <div className="mb-2 rounded border border-slate-700 bg-slate-950/50 p-2">
          <div className="mb-0.5 text-[10px] font-medium text-slate-500">
            למה זה?
          </div>
          <div className="text-xs text-slate-300">{lead.reason}</div>
        </div>
      )}

      {/* Suggested action */}
      {lead.suggested_action && (
        <div
          className="mb-3 rounded p-2 text-xs"
          style={{ background: config.bg, color: config.text }}
        >
          <span className="font-semibold">המלצה: </span>
          {lead.suggested_action}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-1.5">
        <button
          onClick={onContact}
          disabled={isPending}
          className="flex-1 rounded bg-teal-500 px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-teal-400 disabled:opacity-50"
        >
          ✓ סומן ככת
        </button>
        <button
          onClick={onDismiss}
          disabled={isPending}
          className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
        >
          ✕ דחה
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Board
// ─────────────────────────────────────────────────────────────

export function LeadsBoard({ leads }: { leads: ClassifiedLead[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actioningId, setActioningId] = useState<string | null>(null);

  const handleContact = (id: string) => {
    setActioningId(id);
    startTransition(async () => {
      const res = await markLeadContacted(id);
      if (res.success) router.refresh();
      else alert(`שגיאה: ${res.error ?? "לא ידוע"}`);
      setActioningId(null);
    });
  };

  const handleDismiss = (id: string) => {
    if (!confirm("לדחות את הליד הזה?")) return;
    setActioningId(id);
    startTransition(async () => {
      const res = await dismissLead(id);
      if (res.success) router.refresh();
      else alert(`שגיאה: ${res.error ?? "לא ידוע"}`);
      setActioningId(null);
    });
  };

  // Group leads by bucket
  const grouped: Record<LeadBucket, ClassifiedLead[]> = {
    blazing: [],
    hot: [],
    warm: [],
    cold: [],
    spam_or_unclear: [],
  };
  for (const lead of leads) {
    const bucket = (lead.bucket ?? "spam_or_unclear") as LeadBucket;
    grouped[bucket].push(lead);
  }

  // Active buckets: blazing → cold (spam handled separately)
  const activeBuckets: LeadBucket[] = ["blazing", "hot", "warm", "cold"];

  return (
    <div className="space-y-6">
      {/* 4-column board */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {activeBuckets.map((bucket) => {
          const config = BUCKET_CONFIG[bucket];
          const items = grouped[bucket];
          return (
            <div key={bucket} className="space-y-3">
              <div
                className="rounded-lg p-3 text-center"
                style={{
                  background: config.bg,
                  border: `1px solid ${config.border}`,
                }}
              >
                <div className="text-2xl">{config.emoji}</div>
                <div className="text-sm font-bold" style={{ color: config.text }}>
                  {config.label}
                </div>
                <div className="text-xs text-slate-500">
                  {items.length} {items.length === 1 ? "ליד" : "לידים"}
                </div>
              </div>
              <div className="space-y-3">
                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-700 p-4 text-center text-xs text-slate-500">
                    אין לידים
                  </div>
                ) : (
                  items.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onContact={() => handleContact(lead.id)}
                      onDismiss={() => handleDismiss(lead.id)}
                      isPending={isPending && actioningId === lead.id}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Spam row (collapsible if exists) */}
      {grouped.spam_or_unclear.length > 0 && (
        <details className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-400 hover:text-slate-200">
            🚫 ספאם / לא ברור ({grouped.spam_or_unclear.length})
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {grouped.spam_or_unclear.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onContact={() => handleContact(lead.id)}
                onDismiss={() => handleDismiss(lead.id)}
                isPending={isPending && actioningId === lead.id}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
