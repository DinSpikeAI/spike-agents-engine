"use client";

// src/components/dashboard/integrations-form.tsx
//
// Sub-stage 2.0 — Integrations management UI.
//
// Lists existing integrations (WhatsApp for now) and provides a manual
// connect form. The form is the pre-Embedded-Signup path: tenant manually
// pastes phone_number_id + display_phone_number + WABA id from Meta
// Business Manager. Once Embedded Signup ships, this same component will
// host the Meta SDK button instead — the integrations list view stays
// identical.
//
// Style: Calm Frosted — matches settings-form.tsx (Glass cards, CSS vars,
// sonner toast pattern).

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Loader2,
  MessageCircle,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Glass } from "@/components/ui/glass";
import {
  connectWhatsappIntegration,
  disconnectIntegration,
} from "@/app/dashboard/integrations/actions";
import type { IntegrationRow } from "@/app/dashboard/integrations/page";

interface IntegrationsFormProps {
  initialIntegrations: IntegrationRow[];
}

type FieldErrors = Partial<
  Record<
    "phoneNumberId" | "displayPhoneNumber" | "whatsappBusinessAccountId",
    string
  >
>;

export function IntegrationsForm({
  initialIntegrations,
}: IntegrationsFormProps) {
  // Server passes integrations on every render (revalidatePath after mutations);
  // we don't need local copy management beyond optimistic UX, which is handled
  // via isPending + toasts.

  const [isFormOpen, setIsFormOpen] = useState(initialIntegrations.length === 0);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState("");
  const [whatsappBusinessAccountId, setWhatsappBusinessAccountId] =
    useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isConnecting, startConnectingTransition] = useTransition();
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const whatsappConnected = initialIntegrations.find(
    (it) => it.provider === "whatsapp" && it.status === "connected"
  );
  const whatsappHistory = initialIntegrations.filter(
    (it) => it.provider === "whatsapp" && it.status !== "connected"
  );

  const canSubmit =
    phoneNumberId.trim().length > 0 &&
    displayPhoneNumber.trim().length > 0 &&
    whatsappBusinessAccountId.trim().length > 0 &&
    !isConnecting;

  function handleConnect() {
    if (!canSubmit) return;
    setFieldErrors({});
    setGeneralError(null);

    startConnectingTransition(async () => {
      const result = await connectWhatsappIntegration({
        phoneNumberId: phoneNumberId.trim(),
        displayPhoneNumber: displayPhoneNumber.trim(),
        whatsappBusinessAccountId: whatsappBusinessAccountId.trim(),
      });

      if (!result.ok) {
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        if (result.error) {
          setGeneralError(result.error);
          toast.error(result.error);
        }
        return;
      }

      toast.success("WhatsApp חובר בהצלחה");
      setPhoneNumberId("");
      setDisplayPhoneNumber("");
      setWhatsappBusinessAccountId("");
      setFieldErrors({});
      setGeneralError(null);
      setIsFormOpen(false);
    });
  }

  function handleDisconnect(integrationId: string) {
    if (
      !window.confirm(
        "לנתק את האינטגרציה? הודעות נכנסות יפסיקו להגיע לחשבון שלך עד חיבור חוזר."
      )
    ) {
      return;
    }

    setDisconnectingId(integrationId);
    void (async () => {
      const result = await disconnectIntegration(integrationId);
      setDisconnectingId(null);

      if (!result.ok) {
        toast.error(result.error ?? "ניתוק נכשל");
        return;
      }

      toast.success("האינטגרציה נותקה");
    })();
  }

  // ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ─── WhatsApp section ─────────────────────────────────────── */}
      <Glass>
        <div className="flex items-center gap-3 border-b pb-3.5"
          style={{ borderColor: "var(--color-hairline)" }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[10px]"
            style={{
              background: "rgba(37, 211, 102, 0.12)",
              color: "#25d366",
            }}
          >
            <MessageCircle size={18} strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <div
              className="text-[14.5px] font-semibold leading-[1.2]"
              style={{ color: "var(--color-ink)" }}
            >
              WhatsApp Business
            </div>
            <div
              className="text-[11.5px] leading-[1.4]"
              style={{ color: "var(--color-ink-3)" }}
            >
              Meta Cloud API · ערוץ ההודעות הראשי של Spike Engine
            </div>
          </div>
        </div>

        <div className="pt-4">
          {whatsappConnected ? (
            <ConnectedCard
              integration={whatsappConnected}
              isDisconnecting={disconnectingId === whatsappConnected.id}
              onDisconnect={() => handleDisconnect(whatsappConnected.id)}
            />
          ) : (
            <EmptyState onConnect={() => setIsFormOpen(true)} />
          )}

          {/* Connect form (collapsible) */}
          {!whatsappConnected && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setIsFormOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-[13px] font-medium transition-colors"
                style={{
                  background: "rgba(255,255,255,0.5)",
                  border: "1px solid var(--color-hairline)",
                  color: "var(--color-ink-2)",
                }}
              >
                <span className="flex items-center gap-2">
                  <Plus size={14} strokeWidth={2} />
                  חבר WhatsApp ידנית
                </span>
                {isFormOpen ? (
                  <ChevronUp size={14} strokeWidth={2} />
                ) : (
                  <ChevronDown size={14} strokeWidth={2} />
                )}
              </button>

              {isFormOpen && (
                <div className="mt-3 space-y-3">
                  <p
                    className="text-[11.5px] leading-[1.5]"
                    style={{ color: "var(--color-ink-3)" }}
                  >
                    העתק את הערכים מ-Meta Business Manager → WhatsApp Manager →
                    Phone Numbers. בעתיד הקרוב יוחלף בכפתור "התחבר עם
                    Facebook" (Embedded Signup).
                  </p>

                  <FormField
                    label="phone_number_id"
                    sub="המזהה המספרי של מספר הטלפון ב-Meta (15+ ספרות)"
                    value={phoneNumberId}
                    onChange={setPhoneNumberId}
                    placeholder="123456789012345"
                    error={fieldErrors.phoneNumberId}
                    disabled={isConnecting}
                    monospace
                  />

                  <FormField
                    label="מספר טלפון לתצוגה"
                    sub="המספר כפי שיוצג בלקוחות (פורמט E.164)"
                    value={displayPhoneNumber}
                    onChange={setDisplayPhoneNumber}
                    placeholder="+972-50-1234567"
                    error={fieldErrors.displayPhoneNumber}
                    disabled={isConnecting}
                    monospace
                  />

                  <FormField
                    label="WABA ID"
                    sub="WhatsApp Business Account ID — מאותו דף ב-Meta"
                    value={whatsappBusinessAccountId}
                    onChange={setWhatsappBusinessAccountId}
                    placeholder="987654321098765"
                    error={fieldErrors.whatsappBusinessAccountId}
                    disabled={isConnecting}
                    monospace
                  />

                  {generalError && (
                    <p
                      className="text-[12px]"
                      style={{ color: "var(--color-sys-pink)" }}
                    >
                      {generalError}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={!canSubmit}
                    className="flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-semibold transition-all disabled:opacity-50"
                    style={{
                      background: canSubmit
                        ? "var(--color-sys-blue)"
                        : "var(--color-hairline)",
                      color: canSubmit ? "white" : "var(--color-ink-3)",
                    }}
                  >
                    {isConnecting ? (
                      <>
                        <Loader2
                          size={14}
                          strokeWidth={2.5}
                          className="animate-spin"
                        />
                        מחבר...
                      </>
                    ) : (
                      "חבר WhatsApp"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </Glass>

      {/* ─── History (disconnected integrations) ──────────────────── */}
      {whatsappHistory.length > 0 && (
        <Glass>
          <div
            className="text-[12.5px] font-medium pb-2"
            style={{ color: "var(--color-ink-2)" }}
          >
            היסטוריית חיבורים
          </div>
          <div className="space-y-2">
            {whatsappHistory.map((it) => (
              <HistoryRow key={it.id} integration={it} />
            ))}
          </div>
        </Glass>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function FormField({
  label,
  sub,
  value,
  onChange,
  placeholder,
  error,
  disabled,
  monospace,
}: {
  label: string;
  sub?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  monospace?: boolean;
}) {
  return (
    <div>
      <label
        className="mb-1 block text-[12.5px] font-medium"
        style={{ color: "var(--color-ink-2)" }}
      >
        {label}
      </label>
      {sub && (
        <p
          className="mb-1.5 text-[11.5px] leading-[1.4]"
          style={{ color: "var(--color-ink-3)" }}
        >
          {sub}
        </p>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        dir="ltr"
        className="w-full rounded-[10px] px-3 py-2.5 text-[13px] transition-colors disabled:opacity-60"
        style={{
          background: "rgba(255,255,255,0.7)",
          border: error
            ? "1.5px solid var(--color-sys-pink)"
            : "1px solid var(--color-hairline)",
          color: "var(--color-ink)",
          fontFamily: monospace
            ? "ui-monospace, SFMono-Regular, Menlo, monospace"
            : undefined,
        }}
      />
      {error && (
        <p
          className="mt-1 text-[11.5px]"
          style={{ color: "var(--color-sys-pink)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

function ConnectedCard({
  integration,
  isDisconnecting,
  onDisconnect,
}: {
  integration: IntegrationRow;
  isDisconnecting: boolean;
  onDisconnect: () => void;
}) {
  const md = integration.metadata ?? {};
  return (
    <div
      className="rounded-[12px] p-4"
      style={{
        background: "rgba(52, 199, 89, 0.08)",
        border: "1px solid rgba(52, 199, 89, 0.25)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--color-sys-green)" }}
            />
            <span
              className="text-[12.5px] font-semibold"
              style={{ color: "var(--color-sys-green)" }}
            >
              מחובר
            </span>
          </div>
          <div
            className="text-[16px] font-semibold"
            style={{ color: "var(--color-ink)", direction: "ltr" }}
          >
            {md.display_phone_number ?? "—"}
          </div>
          <div className="space-y-0.5">
            <KV label="phone_number_id" value={md.phone_number_id} />
            <KV
              label="WABA"
              value={md.whatsapp_business_account_id}
            />
            {md.connected_at && (
              <KV
                label="חובר"
                value={new Date(md.connected_at).toLocaleString("he-IL")}
                ltr={false}
              />
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={isDisconnecting}
          className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-60"
          style={{
            background: "transparent",
            border: "1px solid var(--color-hairline)",
            color: "var(--color-sys-pink)",
          }}
        >
          {isDisconnecting ? (
            <Loader2 size={12} strokeWidth={2.5} className="animate-spin" />
          ) : (
            <Trash2 size={12} strokeWidth={2} />
          )}
          {isDisconnecting ? "מנתק..." : "נתק"}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onConnect: _ }: { onConnect: () => void }) {
  return (
    <div
      className="rounded-[12px] p-4 text-[12.5px] leading-[1.55]"
      style={{
        background: "rgba(255,255,255,0.4)",
        border: "1px dashed var(--color-hairline)",
        color: "var(--color-ink-3)",
      }}
    >
      עוד לא חיברת WhatsApp. בלי החיבור הזה אין דרך לסוכנים שלך לראות הודעות
      נכנסות מלקוחות. השתמש בטופס למטה כדי להוסיף את ה-Meta phone_number_id
      ידנית, או המתן ל-Embedded Signup (השיק בקרוב).
    </div>
  );
}

function HistoryRow({ integration }: { integration: IntegrationRow }) {
  const md = integration.metadata ?? {};
  return (
    <div
      className="flex items-center justify-between rounded-[10px] px-3 py-2 text-[12px]"
      style={{
        background: "rgba(255,255,255,0.4)",
        border: "1px solid var(--color-hairline)",
        color: "var(--color-ink-3)",
      }}
    >
      <span style={{ direction: "ltr" }}>
        {md.display_phone_number ?? md.phone_number_id ?? integration.id}
      </span>
      <span>
        {integration.status} ·{" "}
        {new Date(integration.updated_at).toLocaleDateString("he-IL")}
      </span>
    </div>
  );
}

function KV({
  label,
  value,
  ltr = true,
}: {
  label: string;
  value?: unknown;
  ltr?: boolean;
}) {
  if (!value || typeof value !== "string") return null;
  return (
    <div
      className="flex items-baseline gap-2 text-[11.5px]"
      style={{ color: "var(--color-ink-3)" }}
    >
      <span style={{ minWidth: "110px", color: "var(--color-ink-3)" }}>
        {label}:
      </span>
      <span
        className="font-medium"
        style={{
          color: "var(--color-ink-2)",
          direction: ltr ? "ltr" : "rtl",
          fontFamily: ltr
            ? "ui-monospace, SFMono-Regular, Menlo, monospace"
            : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}
