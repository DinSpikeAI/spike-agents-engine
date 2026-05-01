"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markLeadContacted,
  dismissLead,
  type ClassifiedLead,
} from "@/app/dashboard/actions";
import type { LeadBucket } from "@/lib/agents/types";
import { Glass } from "@/components/ui/glass";
import { Check, X, Phone, Mail, Camera, MessageCircle, Globe } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Bucket styling — Calm Frosted edition
// Subtle accent colors, no neon. Status conveyed through label + icon.
// ─────────────────────────────────────────────────────────────

const BUCKET_CONFIG: Record<
  LeadBucket,
  {
    label: string;
    emoji: string;
    accent: string;
    accentSoft: string;
    order: number;
  }
> = {
  blazing: {
    label: "בוער",
    emoji: "🔥",
    accent: "var(--color-sys-pink)",
    accentSoft: "rgba(214, 51, 108, 0.10)",
    order: 1,
  },
  hot: {
    label: "חם",
    emoji: "🟠",
    accent: "var(--color-sys-amber)",
    accentSoft: "rgba(224, 169, 61, 0.12)",
    order: 2,
  },
  warm: {
    label: "פושר",
    emoji: "🟡",
    accent: "#C99D2E",
    accentSoft: "rgba(201, 157, 46, 0.10)",
    order: 3,
  },
  cold: {
    label: "קר",
    emoji: "🔵",
    accent: "var(--color-sys-blue)",
    accentSoft: "var(--color-sys-blue-soft)",
    order: 4,
  },
  spam_or_unclear: {
    label: "ספאם / לא ברור",
    emoji: "🚫",
    accent: "var(--color-ink-3)",
    accentSoft: "rgba(114, 121, 136, 0.10)",
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
// Contact link logic
// ─────────────────────────────────────────────────────────────

interface ContactAction {
  href: string;
  display: string;
  Icon: typeof Phone;
  label: string;
}

function buildContactAction(
  source: string,
  handle: string | null
): ContactAction | null {
  if (!handle) return null;

  switch (source) {
    case "whatsapp":
    case "phone_call_transcript": {
      const digits = handle.replace(/\D/g, "");
      const intl = digits.startsWith("972")
        ? digits
        : digits.startsWith("0")
        ? `972${digits.slice(1)}`
        : digits;
      const local = digits.startsWith("972") ? `0${digits.slice(3)}` : digits;
      const display =
        local.length === 10
          ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`
          : handle;
      return {
        href: source === "whatsapp" ? `https://wa.me/${intl}` : `tel:+${intl}`,
        display,
        Icon: source === "whatsapp" ? MessageCircle : Phone,
        label: source === "whatsapp" ? "פתח WhatsApp" : "חייג",
      };
    }

    case "email": {
      return {
        href: `mailto:${handle}`,
        display: handle,
        Icon: Mail,
        label: "שלח email",
      };
    }

    case "instagram_dm": {
      const username = handle.replace(/^@/, "");
      return {
        href: `https://instagram.com/${username}`,
        display: `@${username}`,
        Icon: Camera,
        label: "פתח Instagram",
      };
    }

    case "website_form":
      if (handle.includes("@")) {
        return {
          href: `mailto:${handle}`,
          display: handle,
          Icon: Mail,
          label: "שלח email",
        };
      }
      return {
        href: "#",
        display: handle,
        Icon: Globe,
        label: "פרטי קשר",
      };

    default:
      return null;
  }
}

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

  const contact = buildContactAction(lead.source, lead.source_handle);

  return (
    <Glass className="p-4">
      {/* Header: source + age */}
      <div
        className="mb-2 flex items-center justify-between text-[11px]"
        style={{ color: "var(--color-ink-3)" }}
      >
        <span>{SOURCE_LABELS[lead.source] ?? lead.source}</span>
        <span>{ageLabel}</span>
      </div>

      {/* Display name + clickable contact */}
      <div className="mb-3">
        <div
          className="text-[14px] font-semibold tracking-tight"
          style={{ color: "var(--color-ink)" }}
        >
          {lead.display_name ?? "אנונימי"}
        </div>
        {contact && (
          <a
            href={contact.href}
            target={contact.href.startsWith("http") ? "_blank" : undefined}
            rel={
              contact.href.startsWith("http")
                ? "noopener noreferrer"
                : undefined
            }
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] transition-colors hover:bg-white"
            dir="ltr"
            style={{
              direction: "ltr",
              unicodeBidi: "embed",
              background: "rgba(255,255,255,0.7)",
              borderColor: "var(--color-hairline)",
              color: "var(--color-ink-2)",
            }}
            title={contact.label}
          >
            <contact.Icon size={11} strokeWidth={1.75} />
            <span>{contact.display}</span>
          </a>
        )}
      </div>

      {/* Message preview */}
      <p
        className="mb-3 line-clamp-3 text-[12.5px] leading-relaxed"
        style={{ color: "var(--color-ink-2)" }}
      >
        {lead.raw_message}
      </p>

      {/* Behavior signals row */}
      <div className="mb-3 flex flex-wrap gap-1 text-[10px]">
        {intentCount > 0 && (
          <span
            className="rounded-md px-1.5 py-0.5"
            style={{
              background: "rgba(15,20,30,0.05)",
              color: "var(--color-ink-2)",
            }}
          >
            כוונה ×{intentCount}
          </span>
        )}
        {urgencyCount > 0 && (
          <span
            className="rounded-md px-1.5 py-0.5"
            style={{
              background: "rgba(214, 51, 108, 0.08)",
              color: "var(--color-sys-pink)",
            }}
          >
            דחיפות ×{urgencyCount}
          </span>
        )}
        {hasProduct && (
          <span
            className="rounded-md px-1.5 py-0.5"
            style={{
              background: "var(--color-sys-green-soft)",
              color: "var(--color-sys-green)",
            }}
          >
            מוצר ספציפי
          </span>
        )}
        {hasBudget && (
          <span
            className="rounded-md px-1.5 py-0.5"
            style={{
              background: "var(--color-sys-blue-soft)",
              color: "var(--color-sys-blue)",
            }}
          >
            תקציב
          </span>
        )}
      </div>

      {/* Reason from LLM */}
      {lead.reason && (
        <div
          className="mb-2 rounded-md p-2"
          style={{
            background: "rgba(15,20,30,0.04)",
            border: "1px solid var(--color-hairline)",
          }}
        >
          <div
            className="mb-0.5 text-[10px] font-medium"
            style={{ color: "var(--color-ink-3)" }}
          >
            למה זה?
          </div>
          <div
            className="text-[11.5px]"
            style={{ color: "var(--color-ink-2)" }}
          >
            {lead.reason}
          </div>
        </div>
      )}

      {/* Suggested action */}
      {lead.suggested_action && (
        <div
          className="mb-3 rounded-md p-2 text-[11.5px]"
          style={{
            background: config.accentSoft,
            color: config.accent,
          }}
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
          className="flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11.5px] font-semibold text-white transition-all disabled:opacity-50"
          style={{
            background: "var(--color-sys-green)",
            boxShadow: "0 4px 12px rgba(48,179,107,0.28)",
          }}
        >
          <Check size={11} strokeWidth={2.5} />
          סומן ככת
        </button>
        <button
          onClick={onDismiss}
          disabled={isPending}
          className="flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[11.5px] font-medium transition-all disabled:opacity-50"
          style={{
            background: "rgba(255,255,255,0.7)",
            borderColor: "var(--color-hairline)",
            color: "var(--color-ink-2)",
          }}
        >
          <X size={11} strokeWidth={2} />
          דחה
        </button>
      </div>
    </Glass>
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

  const activeBuckets: LeadBucket[] = ["blazing", "hot", "warm", "cold"];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {activeBuckets.map((bucket) => {
          const config = BUCKET_CONFIG[bucket];
          const items = grouped[bucket];
          return (
            <div key={bucket} className="space-y-3">
              {/* Column header */}
              <Glass deep className="px-3 py-2.5 text-center">
                <div className="text-[20px] leading-none">{config.emoji}</div>
                <div
                  className="mt-1 text-[13px] font-semibold tracking-tight"
                  style={{ color: config.accent }}
                >
                  {config.label}
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: "var(--color-ink-3)" }}
                >
                  {items.length} {items.length === 1 ? "ליד" : "לידים"}
                </div>
              </Glass>

              {/* Cards */}
              <div className="space-y-3">
                {items.length === 0 ? (
                  <div
                    className="rounded-[14px] border border-dashed p-4 text-center text-[11.5px]"
                    style={{
                      borderColor: "var(--color-hairline-s)",
                      color: "var(--color-ink-3)",
                    }}
                  >
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

      {/* Spam/unclear collapsed section */}
      {grouped.spam_or_unclear.length > 0 && (
        <Glass className="p-4">
          <details>
            <summary
              className="cursor-pointer text-[13px] font-medium transition-colors"
              style={{ color: "var(--color-ink-2)" }}
            >
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
        </Glass>
      )}
    </div>
  );
}
