"use client";

// src/components/admin/admin-integrations-form.tsx
//
// Sub-stage 1.14.3 — Card-based admin integrations UI.
//
// Replaces the previous "dropdown + WhatsApp section + tenant list" layout
// (which had 4 competing elements on screen) with a single clean list of
// tenant cards. Click a card → inline expand → form OR connected details.
//
// Why this design:
//   - No dropdown: the dropdown was redundant with the tenant list below
//   - No tenant_id text exposed in body: distracting UUIDs hidden
//     unless explicitly toggled
//   - One card per tenant, click to expand: matches Stripe/Linear admin patterns
//   - Connected vs disconnected state visible at a glance via badge color

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ChevronDown,
  ChevronUp,
  MessageCircle,
} from "lucide-react";
import {
  connectWhatsappAsAdmin,
  disconnectIntegrationAsAdmin,
} from "@/app/admin/integrations/actions";
import type { TenantWithIntegrations } from "@/app/admin/integrations/page";

interface AdminIntegrationsManagerProps {
  tenants: TenantWithIntegrations[];
}

type FieldErrors = Partial<
  Record<
    "phoneNumberId" | "displayPhoneNumber" | "whatsappBusinessAccountId",
    string
  >
>;

export function AdminIntegrationsManager({
  tenants,
}: AdminIntegrationsManagerProps) {
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState("");
  const [whatsappBusinessAccountId, setWhatsappBusinessAccountId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isConnecting, startConnecting] = useTransition();
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  function resetForm() {
    setPhoneNumberId("");
    setDisplayPhoneNumber("");
    setWhatsappBusinessAccountId("");
    setFieldErrors({});
    setGeneralError(null);
  }

  function handleToggleExpand(tenantId: string) {
    if (expandedTenantId === tenantId) {
      setExpandedTenantId(null);
      resetForm();
    } else {
      setExpandedTenantId(tenantId);
      resetForm();
    }
  }

  function handleConnect(tenant: TenantWithIntegrations) {
    if (
      !phoneNumberId.trim() ||
      !displayPhoneNumber.trim() ||
      !whatsappBusinessAccountId.trim()
    ) {
      return;
    }
    setFieldErrors({});
    setGeneralError(null);

    startConnecting(async () => {
      const result = await connectWhatsappAsAdmin({
        tenantId: tenant.id,
        phoneNumberId: phoneNumberId.trim(),
        displayPhoneNumber: displayPhoneNumber.trim(),
        whatsappBusinessAccountId: whatsappBusinessAccountId.trim(),
      });

      if (!result.ok) {
        if (result.fieldErrors) {
          setFieldErrors(
            result.fieldErrors as FieldErrors // tenantId not shown in card UI
          );
        }
        if (result.error) {
          setGeneralError(result.error);
          toast.error(result.error);
        }
        return;
      }

      toast.success(`WhatsApp חובר ל-${tenantLabel(tenant)}`);
      resetForm();
      // keep the card expanded so user sees the new connected state
    });
  }

  function handleDisconnect(
    tenant: TenantWithIntegrations,
    integrationId: string
  ) {
    if (
      !window.confirm(
        `לנתק WhatsApp של ${tenantLabel(tenant)}? הודעות נכנסות יפסיקו להגיע.`
      )
    ) {
      return;
    }

    setDisconnectingId(integrationId);
    void (async () => {
      const result = await disconnectIntegrationAsAdmin(integrationId);
      setDisconnectingId(null);

      if (!result.ok) {
        toast.error(result.error ?? "ניתוק נכשל");
        return;
      }
      toast.success("נותק בהצלחה");
    })();
  }

  if (tenants.length === 0) {
    return (
      <div
        className="rounded-[14px] p-6 text-center"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px dashed rgba(255,255,255,0.10)",
          color: "var(--spike-text-mute)",
        }}
      >
        אין tenants במערכת עדיין. כשמשתמשים יסיימו onboarding הם יופיעו כאן.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tenants.map((tenant) => {
        const isExpanded = expandedTenantId === tenant.id;
        const isConnected = tenant.whatsapp?.status === "connected";

        return (
          <TenantCard
            key={tenant.id}
            tenant={tenant}
            isExpanded={isExpanded}
            isConnected={isConnected}
            onToggle={() => handleToggleExpand(tenant.id)}
            // form state
            phoneNumberId={phoneNumberId}
            displayPhoneNumber={displayPhoneNumber}
            whatsappBusinessAccountId={whatsappBusinessAccountId}
            setPhoneNumberId={setPhoneNumberId}
            setDisplayPhoneNumber={setDisplayPhoneNumber}
            setWhatsappBusinessAccountId={setWhatsappBusinessAccountId}
            fieldErrors={fieldErrors}
            generalError={generalError}
            isConnecting={isConnecting}
            disconnectingId={disconnectingId}
            onConnect={() => handleConnect(tenant)}
            onDisconnect={(integrationId) =>
              handleDisconnect(tenant, integrationId)
            }
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TenantCard — clickable header + collapsible body
// ─────────────────────────────────────────────────────────────────

function TenantCard({
  tenant,
  isExpanded,
  isConnected,
  onToggle,
  phoneNumberId,
  displayPhoneNumber,
  whatsappBusinessAccountId,
  setPhoneNumberId,
  setDisplayPhoneNumber,
  setWhatsappBusinessAccountId,
  fieldErrors,
  generalError,
  isConnecting,
  disconnectingId,
  onConnect,
  onDisconnect,
}: {
  tenant: TenantWithIntegrations;
  isExpanded: boolean;
  isConnected: boolean;
  onToggle: () => void;
  phoneNumberId: string;
  displayPhoneNumber: string;
  whatsappBusinessAccountId: string;
  setPhoneNumberId: (v: string) => void;
  setDisplayPhoneNumber: (v: string) => void;
  setWhatsappBusinessAccountId: (v: string) => void;
  fieldErrors: FieldErrors;
  generalError: string | null;
  isConnecting: boolean;
  disconnectingId: string | null;
  onConnect: () => void;
  onDisconnect: (integrationId: string) => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-[14px] transition-colors"
      style={{
        background: isExpanded
          ? "rgba(255,255,255,0.06)"
          : "rgba(255,255,255,0.03)",
        border: isExpanded
          ? "1px solid rgba(50, 215, 195, 0.25)"
          : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Header — always visible, clickable */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-4 transition-colors hover:bg-white/5"
      >
        {/* Avatar */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold"
          style={{
            background: isConnected
              ? "rgba(50, 215, 195, 0.15)"
              : "rgba(255, 159, 10, 0.15)",
            color: isConnected ? "var(--spike-teal)" : "#ff9f0a",
          }}
        >
          {tenantInitials(tenant)}
        </div>

        {/* Name + sub */}
        <div className="flex-1 min-w-0 text-right">
          <div
            className="text-[15px] font-semibold leading-[1.2]"
            style={{ color: "var(--spike-text)" }}
          >
            {tenantLabel(tenant)}
          </div>
          <div
            className="mt-0.5 flex items-center gap-2 text-[12px]"
            style={{ color: "var(--spike-text-dim)" }}
          >
            <MessageCircle size={12} strokeWidth={1.75} />
            {isConnected && tenant.whatsapp?.displayPhoneNumber ? (
              <span style={{ direction: "ltr" }}>
                {tenant.whatsapp.displayPhoneNumber}
              </span>
            ) : (
              <span>WhatsApp לא מחובר</span>
            )}
          </div>
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          {isConnected ? (
            <StatusBadge accent="var(--spike-teal)" Icon={CheckCircle2}>
              מחובר
            </StatusBadge>
          ) : (
            <StatusBadge accent="#ff9f0a" Icon={AlertCircle}>
              ממתין
            </StatusBadge>
          )}
        </div>

        {/* Chevron */}
        <div className="shrink-0" style={{ color: "var(--spike-text-mute)" }}>
          {isExpanded ? (
            <ChevronUp size={16} strokeWidth={1.75} />
          ) : (
            <ChevronDown size={16} strokeWidth={1.75} />
          )}
        </div>
      </button>

      {/* Body — only when expanded */}
      {isExpanded && (
        <div
          className="border-t px-5 py-5"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          {isConnected && tenant.whatsapp ? (
            <ConnectedBody
              whatsapp={tenant.whatsapp}
              isDisconnecting={disconnectingId === tenant.whatsapp.id}
              onDisconnect={() => onDisconnect(tenant.whatsapp!.id)}
            />
          ) : (
            <SetupBody
              tenantLabel={tenantLabel(tenant)}
              phoneNumberId={phoneNumberId}
              displayPhoneNumber={displayPhoneNumber}
              whatsappBusinessAccountId={whatsappBusinessAccountId}
              setPhoneNumberId={setPhoneNumberId}
              setDisplayPhoneNumber={setDisplayPhoneNumber}
              setWhatsappBusinessAccountId={setWhatsappBusinessAccountId}
              fieldErrors={fieldErrors}
              generalError={generalError}
              isConnecting={isConnecting}
              onConnect={onConnect}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SetupBody — form for connecting WhatsApp
// ─────────────────────────────────────────────────────────────────

function SetupBody({
  tenantLabel,
  phoneNumberId,
  displayPhoneNumber,
  whatsappBusinessAccountId,
  setPhoneNumberId,
  setDisplayPhoneNumber,
  setWhatsappBusinessAccountId,
  fieldErrors,
  generalError,
  isConnecting,
  onConnect,
}: {
  tenantLabel: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  whatsappBusinessAccountId: string;
  setPhoneNumberId: (v: string) => void;
  setDisplayPhoneNumber: (v: string) => void;
  setWhatsappBusinessAccountId: (v: string) => void;
  fieldErrors: FieldErrors;
  generalError: string | null;
  isConnecting: boolean;
  onConnect: () => void;
}) {
  const canSubmit =
    phoneNumberId.trim().length > 0 &&
    displayPhoneNumber.trim().length > 0 &&
    whatsappBusinessAccountId.trim().length > 0 &&
    !isConnecting;

  return (
    <div className="space-y-3">
      <p
        className="text-[12px] leading-[1.55]"
        style={{ color: "var(--spike-text-dim)" }}
      >
        העתק מ-Meta Business Manager → WhatsApp Manager → Phone Numbers,
        ובחר את המספר של {tenantLabel}.
      </p>

      <Field
        label="phone_number_id"
        value={phoneNumberId}
        onChange={setPhoneNumberId}
        placeholder="123456789012345"
        error={fieldErrors.phoneNumberId}
        disabled={isConnecting}
      />
      <Field
        label="display_phone_number"
        value={displayPhoneNumber}
        onChange={setDisplayPhoneNumber}
        placeholder="+972-50-1234567"
        error={fieldErrors.displayPhoneNumber}
        disabled={isConnecting}
      />
      <Field
        label="WABA ID"
        value={whatsappBusinessAccountId}
        onChange={setWhatsappBusinessAccountId}
        placeholder="987654321098765"
        error={fieldErrors.whatsappBusinessAccountId}
        disabled={isConnecting}
      />

      {generalError && (
        <p className="text-[12px]" style={{ color: "#ff453a" }}>
          {generalError}
        </p>
      )}

      <button
        type="button"
        onClick={onConnect}
        disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-[13.5px] font-semibold transition-all disabled:opacity-50"
        style={{
          background: canSubmit ? "var(--spike-teal)" : "rgba(255,255,255,0.08)",
          color: canSubmit ? "#0b0c0e" : "var(--spike-text-mute)",
        }}
      >
        {isConnecting ? (
          <>
            <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />
            מחבר...
          </>
        ) : (
          "חבר WhatsApp"
        )}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ConnectedBody — read-only details + disconnect
// ─────────────────────────────────────────────────────────────────

function ConnectedBody({
  whatsapp,
  isDisconnecting,
  onDisconnect,
}: {
  whatsapp: NonNullable<TenantWithIntegrations["whatsapp"]>;
  isDisconnecting: boolean;
  onDisconnect: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <KV label="display" value={whatsapp.displayPhoneNumber} />
        <KV label="phone_number_id" value={whatsapp.phoneNumberId} />
        <KV label="WABA" value={whatsapp.wabaId} />
        <KV
          label="connected_at"
          value={new Date(whatsapp.connectedAt).toLocaleString("he-IL")}
          ltr={false}
        />
      </div>

      <button
        type="button"
        onClick={onDisconnect}
        disabled={isDisconnecting}
        className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-60"
        style={{
          background: "rgba(255, 69, 58, 0.10)",
          border: "1px solid rgba(255, 69, 58, 0.30)",
          color: "#ff453a",
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
  );
}

// ─────────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────────

function StatusBadge({
  Icon,
  accent,
  children,
}: {
  Icon: typeof CheckCircle2;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide"
      style={{
        background: `${accent}20`,
        color: accent,
      }}
    >
      <Icon size={11} strokeWidth={2.25} />
      {children}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label
        className="mb-1 block text-[11px] font-medium uppercase tracking-wide"
        style={{ color: "var(--spike-text-mute)" }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        dir="ltr"
        className="w-full rounded-[10px] px-3 py-2.5 text-[13px] transition-colors disabled:opacity-60"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: error
            ? "1.5px solid #ff453a"
            : "1px solid rgba(255,255,255,0.12)",
          color: "var(--spike-text)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      />
      {error && (
        <p className="mt-1 text-[11px]" style={{ color: "#ff453a" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function KV({
  label,
  value,
  ltr = true,
}: {
  label: string;
  value: string | null;
  ltr?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2 text-[12px]">
      <span
        style={{ color: "var(--spike-text-mute)", minWidth: "120px" }}
      >
        {label}:
      </span>
      <span
        style={{
          color: "var(--spike-text)",
          direction: ltr ? "ltr" : "rtl",
          fontFamily: ltr
            ? "ui-monospace, SFMono-Regular, Menlo, monospace"
            : undefined,
          fontSize: ltr ? "11.5px" : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function tenantLabel(t: TenantWithIntegrations): string {
  return t.name || t.ownerName || t.id.slice(0, 8);
}

function tenantInitials(t: TenantWithIntegrations): string {
  const label = tenantLabel(t);
  // For Hebrew/Latin: take the first 2 visible chars
  const trimmed = label.trim();
  if (trimmed.length === 0) return "?";
  if (trimmed.length === 1) return trimmed[0].toUpperCase();
  return (trimmed[0] + trimmed[1]).toUpperCase();
}
