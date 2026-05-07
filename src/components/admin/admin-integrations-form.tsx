"use client";

// src/components/admin/admin-integrations-form.tsx
//
// Sub-stage 2.0 (revision 2026-05-07) — Admin integrations manager.
//
// Single-screen admin tool. Pick a tenant from the dropdown; that tenant's
// WhatsApp connection state is shown below. If not connected, the form
// appears for setup. If connected, status + a Disconnect button.
//
// Style: matches /admin theme (--spike-* tokens).

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
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
    "tenantId" | "phoneNumberId" | "displayPhoneNumber" | "whatsappBusinessAccountId",
    string
  >
>;

export function AdminIntegrationsManager({
  tenants,
}: AdminIntegrationsManagerProps) {
  const [selectedTenantId, setSelectedTenantId] = useState<string>(
    tenants[0]?.id ?? ""
  );
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState("");
  const [whatsappBusinessAccountId, setWhatsappBusinessAccountId] =
    useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isConnecting, startConnecting] = useTransition();
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const selected = tenants.find((t) => t.id === selectedTenantId) ?? null;
  const isConnected = selected?.whatsapp?.status === "connected";

  const canSubmit =
    !!selected &&
    !isConnected &&
    phoneNumberId.trim().length > 0 &&
    displayPhoneNumber.trim().length > 0 &&
    whatsappBusinessAccountId.trim().length > 0 &&
    !isConnecting;

  function handleSelectTenant(id: string) {
    setSelectedTenantId(id);
    setPhoneNumberId("");
    setDisplayPhoneNumber("");
    setWhatsappBusinessAccountId("");
    setFieldErrors({});
    setGeneralError(null);
  }

  function handleConnect() {
    if (!canSubmit || !selected) return;
    setFieldErrors({});
    setGeneralError(null);

    startConnecting(async () => {
      const result = await connectWhatsappAsAdmin({
        tenantId: selected.id,
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

      toast.success(`WhatsApp חובר ל-${tenantLabel(selected)}`);
      setPhoneNumberId("");
      setDisplayPhoneNumber("");
      setWhatsappBusinessAccountId("");
    });
  }

  function handleDisconnect(integrationId: string) {
    if (!selected) return;
    if (
      !window.confirm(
        `לנתק את WhatsApp של ${tenantLabel(selected)}? הודעות נכנסות יפסיקו להגיע ל-tenant הזה.`
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

      toast.success("האינטגרציה נותקה");
    })();
  }

  // ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Tenant picker */}
      <AdminCard>
        <Label>בחר tenant</Label>
        <div className="mt-2 grid gap-2">
          <select
            value={selectedTenantId}
            onChange={(e) => handleSelectTenant(e.target.value)}
            className="w-full rounded-[10px] px-3 py-2.5 text-[14px]"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "var(--spike-text)",
            }}
          >
            {tenants.length === 0 ? (
              <option value="">אין tenants במערכת</option>
            ) : (
              tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {tenantLabel(t)} {t.whatsapp?.status === "connected" ? "✓" : ""}
                </option>
              ))
            )}
          </select>
          <div
            className="text-[11px]"
            style={{ color: "var(--spike-text-mute)", direction: "ltr" }}
          >
            tenant_id: {selectedTenantId || "—"}
          </div>
        </div>
      </AdminCard>

      {/* Selected tenant's WhatsApp state */}
      {selected && (
        <AdminCard>
          <div className="flex items-center justify-between">
            <Label>WhatsApp</Label>
            {isConnected ? (
              <StatusBadge accent="var(--spike-teal)" Icon={CheckCircle2}>
                מחובר
              </StatusBadge>
            ) : (
              <StatusBadge accent="#ff9f0a" Icon={AlertCircle}>
                לא מחובר
              </StatusBadge>
            )}
          </div>

          {isConnected && selected.whatsapp ? (
            <div className="mt-4 space-y-2">
              <KV label="display" value={selected.whatsapp.displayPhoneNumber} />
              <KV
                label="phone_number_id"
                value={selected.whatsapp.phoneNumberId}
              />
              <KV label="WABA" value={selected.whatsapp.wabaId} />
              <KV
                label="connected_at"
                value={new Date(selected.whatsapp.connectedAt).toLocaleString(
                  "he-IL"
                )}
                ltr={false}
              />

              <button
                type="button"
                onClick={() =>
                  selected.whatsapp && handleDisconnect(selected.whatsapp.id)
                }
                disabled={disconnectingId !== null}
                className="mt-3 flex items-center gap-2 rounded-[8px] px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-60"
                style={{
                  background: "rgba(255, 69, 58, 0.1)",
                  border: "1px solid rgba(255, 69, 58, 0.3)",
                  color: "#ff453a",
                }}
              >
                {disconnectingId ? (
                  <Loader2 size={12} strokeWidth={2.5} className="animate-spin" />
                ) : (
                  <Trash2 size={12} strokeWidth={2} />
                )}
                {disconnectingId ? "מנתק..." : "נתק"}
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p
                className="text-[12px] leading-[1.55]"
                style={{ color: "var(--spike-text-dim)" }}
              >
                העתק את הערכים מ-Meta Business Manager → WhatsApp Manager →
                Phone Numbers → המספר של ה-tenant הזה.
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
                label="whatsapp_business_account_id (WABA)"
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
                onClick={handleConnect}
                disabled={!canSubmit}
                className="flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-[13.5px] font-semibold transition-all disabled:opacity-50"
                style={{
                  background: canSubmit
                    ? "var(--spike-teal)"
                    : "rgba(255,255,255,0.08)",
                  color: canSubmit ? "#0b0c0e" : "var(--spike-text-mute)",
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
                  `חבר WhatsApp עבור ${tenantLabel(selected)}`
                )}
              </button>
            </div>
          )}
        </AdminCard>
      )}

      {/* Tenant overview table */}
      <AdminCard>
        <Label>כל ה-tenants ({tenants.length})</Label>
        <div className="mt-3 space-y-1.5">
          {tenants.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleSelectTenant(t.id)}
              className="flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-[12.5px] transition-colors"
              style={{
                background:
                  t.id === selectedTenantId
                    ? "rgba(50, 215, 195, 0.10)"
                    : "rgba(255,255,255,0.03)",
                border:
                  t.id === selectedTenantId
                    ? "1px solid rgba(50, 215, 195, 0.30)"
                    : "1px solid rgba(255,255,255,0.06)",
                color: "var(--spike-text)",
              }}
            >
              <span className="flex flex-col items-start gap-0.5">
                <span className="font-medium">{tenantLabel(t)}</span>
                <span
                  className="text-[10px]"
                  style={{
                    color: "var(--spike-text-mute)",
                    direction: "ltr",
                  }}
                >
                  {t.id}
                </span>
              </span>
              <span
                className="text-[11px] font-medium uppercase tracking-wide"
                style={{
                  color:
                    t.whatsapp?.status === "connected"
                      ? "var(--spike-teal)"
                      : "var(--spike-text-mute)",
                }}
              >
                {t.whatsapp?.status === "connected" ? "✓ מחובר" : "ללא חיבור"}
              </span>
            </button>
          ))}
        </div>
      </AdminCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function AdminCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[14px] p-5"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[12.5px] font-semibold uppercase tracking-wide"
      style={{ color: "var(--spike-text-mute)" }}
    >
      {children}
    </div>
  );
}

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
        className="mb-1 block text-[11.5px] font-medium uppercase tracking-wide"
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
        <p className="mt-1 text-[11.5px]" style={{ color: "#ff453a" }}>
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
        style={{ color: "var(--spike-text-mute)", minWidth: "140px" }}
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

function tenantLabel(t: TenantWithIntegrations): string {
  return t.name || t.ownerName || t.id.slice(0, 8);
}
