"use client";

// src/components/dashboard/integrations-form.tsx
//
// Sub-stage 2.0 (revision 2026-05-07) — Customer-side integrations VIEW.
//
// Customers see this read-only page. No technical setup, no form, no
// disconnect button, no phone_number_id / WABA / metadata details.
// Setup and management is done by Spike admin staff via /admin/integrations.
//
// What customers DO see:
//   1. Hero status banner (when WhatsApp connected) — "פעיל ומחובר"
//   2. WhatsApp section card with status + display_phone_number only
//   3. Coming Soon cards for Stripe, Google Calendar
//   4. Copy explaining "ההקמה והניהול ע"י צוות Spike"
//
// Style: Calm Frosted — Glass primitive cards, CSS variables.

import {
  MessageCircle,
  CheckCircle2,
  CreditCard,
  Calendar,
  Clock,
  Activity,
  Headphones,
} from "lucide-react";
import { Glass } from "@/components/ui/glass";
import type { IntegrationRow } from "@/app/dashboard/integrations/page";

interface IntegrationsFormProps {
  initialIntegrations: IntegrationRow[];
}

export function IntegrationsForm({ initialIntegrations }: IntegrationsFormProps) {
  const whatsappConnected = initialIntegrations.find(
    (it) => it.provider === "whatsapp" && it.status === "connected"
  );

  return (
    <div className="space-y-4">
      {whatsappConnected && <ActiveStatusHero />}

      <Glass>
        <div
          className="flex items-center gap-3 border-b pb-3.5"
          style={{ borderColor: "var(--color-hairline)" }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-[12px]"
            style={{
              background: "rgba(37, 211, 102, 0.12)",
              color: "#25d366",
            }}
          >
            <MessageCircle size={20} strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <div
              className="text-[15px] font-semibold leading-[1.2]"
              style={{ color: "var(--color-ink)" }}
            >
              WhatsApp Business
            </div>
            <div
              className="text-[12px] leading-[1.4]"
              style={{ color: "var(--color-ink-3)" }}
            >
              Meta Cloud API · ערוץ ההודעות הראשי של Spike Engine
            </div>
          </div>
        </div>

        <div className="pt-5">
          {whatsappConnected ? (
            <ConnectedDisplay integration={whatsappConnected} />
          ) : (
            <PendingSetupState />
          )}

          <ManagedByCopy />
        </div>
      </Glass>

      <ComingSoonCard
        Icon={CreditCard}
        title="Stripe"
        subtitle="גביית תשלומים מלקוחות · סוכן Sales יציע קישור תשלום בטיוטות"
        accent="#635bff"
      />
      <ComingSoonCard
        Icon={Calendar}
        title="Google Calendar"
        subtitle="קביעת פגישות אוטומטית · הסוכן יציע סלוטים פנויים מהיומן שלך"
        accent="#4285f4"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function ActiveStatusHero() {
  return (
    <div
      className="rounded-[14px] px-4 py-3.5"
      style={{
        background:
          "linear-gradient(135deg, rgba(52, 199, 89, 0.08) 0%, rgba(52, 199, 89, 0.04) 100%)",
        border: "1px solid rgba(52, 199, 89, 0.20)",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{
            background: "rgba(52, 199, 89, 0.15)",
            color: "var(--color-sys-green)",
          }}
        >
          <Activity size={16} strokeWidth={2} />
        </div>
        <div className="flex-1">
          <div
            className="text-[13.5px] font-semibold leading-[1.25]"
            style={{ color: "var(--color-ink)" }}
          >
            WhatsApp פעיל ומחובר
          </div>
          <div
            className="text-[11.5px] leading-[1.4]"
            style={{ color: "var(--color-ink-3)" }}
          >
            הסוכנים מקבלים כל הודעה נכנסת ומכינים טיוטה לאישורך תוך שניות
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectedDisplay({ integration }: { integration: IntegrationRow }) {
  const md = integration.metadata ?? {};
  const connectedAtRaw =
    (typeof md.connected_at === "string" && md.connected_at) ||
    integration.created_at;
  const connectedAt = formatHebrewDate(connectedAtRaw);

  return (
    <div
      className="rounded-[14px] p-5"
      style={{
        background: "rgba(52, 199, 89, 0.05)",
        border: "1px solid rgba(52, 199, 89, 0.20)",
      }}
    >
      <div className="flex items-center gap-2">
        <CheckCircle2
          size={16}
          strokeWidth={2.25}
          style={{ color: "var(--color-sys-green)" }}
        />
        <span
          className="text-[12.5px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-sys-green)" }}
        >
          מחובר
        </span>
      </div>

      <div className="mt-4">
        <div
          className="text-[24px] font-semibold leading-[1.1] tracking-tight"
          style={{
            color: "var(--color-ink)",
            direction: "ltr",
            fontFeatureSettings: '"tnum"',
          }}
        >
          {(typeof md.display_phone_number === "string" &&
            md.display_phone_number) ||
            "—"}
        </div>
        {connectedAt && (
          <div
            className="mt-1 flex items-center gap-1.5 text-[11.5px]"
            style={{ color: "var(--color-ink-3)" }}
          >
            <Clock size={11} strokeWidth={1.75} />
            מחובר מאז {connectedAt}
          </div>
        )}
      </div>
    </div>
  );
}

function PendingSetupState() {
  return (
    <div
      className="rounded-[14px] p-5"
      style={{
        background: "rgba(255,255,255,0.4)",
        border: "1px dashed var(--color-hairline)",
      }}
    >
      <div
        className="text-[14px] font-semibold leading-[1.3]"
        style={{ color: "var(--color-ink-2)" }}
      >
        WhatsApp עוד לא מחובר
      </div>
      <p
        className="mt-1.5 text-[12px] leading-[1.55]"
        style={{ color: "var(--color-ink-3)" }}
      >
        ההקמה דורשת חיבור עם Meta Business. צוות Spike יעשה זאת עבורך —
        פנה אלינו דרך הצ'אט בפינה למטה והדרכת ההקמה תיקבע בתיאום אישי.
      </p>
    </div>
  );
}

function ManagedByCopy() {
  return (
    <div
      className="mt-4 flex items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-[11.5px] leading-[1.5]"
      style={{
        background: "rgba(0, 122, 255, 0.04)",
        border: "1px solid rgba(0, 122, 255, 0.15)",
        color: "var(--color-ink-3)",
      }}
    >
      <Headphones
        size={13}
        strokeWidth={1.75}
        style={{
          color: "var(--color-sys-blue)",
          marginTop: "1px",
          flexShrink: 0,
        }}
      />
      <div>
        <div
          className="text-[12px] font-medium"
          style={{ color: "var(--color-ink-2)" }}
        >
          ההקמה והניהול ע"י צוות Spike
        </div>
        <div className="mt-0.5">
          לשינויים בחיבור ה-WhatsApp (החלפת מספר, ניתוק, הוספת מספר נוסף) —
          פנה אלינו דרך הצ'אט. אנחנו מטפלים בכל החלקים הטכניים מולך, וזה
          חלק מהשירות.
        </div>
      </div>
    </div>
  );
}

function ComingSoonCard({
  Icon,
  title,
  subtitle,
  accent,
}: {
  Icon: typeof CreditCard;
  title: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <Glass>
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-[12px] opacity-60"
          style={{
            background: `${accent}1F`,
            color: accent,
          }}
        >
          <Icon size={20} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="flex items-center gap-2 text-[15px] font-semibold leading-[1.2]"
            style={{ color: "var(--color-ink-2)" }}
          >
            {title}
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{
                background: "rgba(0,0,0,0.04)",
                color: "var(--color-ink-3)",
                letterSpacing: "0.05em",
              }}
            >
              בקרוב
            </span>
          </div>
          <div
            className="mt-0.5 text-[12px] leading-[1.4]"
            style={{ color: "var(--color-ink-3)" }}
          >
            {subtitle}
          </div>
        </div>
      </div>
    </Glass>
  );
}

function formatHebrewDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return null;
  }
}
