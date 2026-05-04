"use client";

// src/components/dashboard/settings-form.tsx
//
// Sub-stage 1.7 — Settings form.
//
// Client component that owns the form state, calls updateTenantSettings
// server action on submit, and displays both inline field errors AND a
// sonner toast on success/failure (decision (ג) from spec discussion).
//
// Style: Calm Frosted — Glass primitive cards, CSS variables for colors,
// inline styles for system colors.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { Glass } from "@/components/ui/glass";
import {
  updateTenantSettings,
  type Vertical,
  type BusinessOwnerGender,
} from "@/app/dashboard/settings/actions";

interface SettingsFormProps {
  initialOwnerName: string;
  initialBusinessName: string;
  initialGender: BusinessOwnerGender;
  initialVertical: Vertical;
}

const VERTICAL_LABELS: Record<Vertical, string> = {
  general: "כללי",
  clinic: "מרפאה / קליניקה",
  financial: "פיננסי",
  restaurant: "מסעדה / בית קפה",
  retail: "קמעונאות / חנות",
  services: "שירותים",
  beauty: "יופי / מספרה",
  education: "חינוך / הוראה",
};

type FieldErrors = Partial<
  Record<"ownerName" | "businessName" | "businessOwnerGender" | "vertical", string>
>;

export function SettingsForm({
  initialOwnerName,
  initialBusinessName,
  initialGender,
  initialVertical,
}: SettingsFormProps) {
  const [ownerName, setOwnerName] = useState(initialOwnerName);
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [gender, setGender] = useState<BusinessOwnerGender>(initialGender);
  const [vertical, setVertical] = useState<Vertical>(initialVertical);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Track if the form has changed from initial — used to disable button when nothing to save.
  const hasChanges =
    ownerName !== initialOwnerName ||
    businessName !== initialBusinessName ||
    gender !== initialGender ||
    vertical !== initialVertical;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError(null);

    startTransition(async () => {
      const result = await updateTenantSettings({
        ownerName,
        businessName,
        businessOwnerGender: gender,
        vertical,
      });

      if (result.ok) {
        toast.success("ההגדרות נשמרו");
        return;
      }

      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
      const errMsg = result.error ?? "השמירה נכשלה";
      setGeneralError(errMsg);
      toast.error(errMsg);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* ─── Card 1: Identity ─────────────────────────────── */}
      <Glass className="space-y-4 p-5 sm:p-6">
        <div>
          <h2
            className="text-[15.5px] font-semibold tracking-tight"
            style={{ color: "var(--color-ink)" }}
          >
            פרטי העסק
          </h2>
          <p
            className="mt-1 text-[12px] leading-[1.5]"
            style={{ color: "var(--color-ink-3)" }}
          >
            השם והמגדר מופיעים בכל הודעה שהסוכנים מנסחים בשמך.
          </p>
        </div>

        {/* Owner name */}
        <div className="space-y-1.5">
          <label
            htmlFor="owner_name"
            className="block text-[12.5px] font-medium"
            style={{ color: "var(--color-ink-2)" }}
          >
            שם בעל העסק
          </label>
          <input
            id="owner_name"
            type="text"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            disabled={isPending}
            maxLength={80}
            placeholder="למשל: רונית כהן"
            className="w-full rounded-[10px] px-3 py-2 text-[14px] outline-none transition-colors disabled:opacity-60"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: fieldErrors.ownerName
                ? "1px solid var(--color-sys-pink)"
                : "1px solid var(--color-hairline)",
              color: "var(--color-ink)",
            }}
            dir="rtl"
          />
          {fieldErrors.ownerName && (
            <p
              className="text-[11.5px]"
              style={{ color: "var(--color-sys-pink)" }}
            >
              {fieldErrors.ownerName}
            </p>
          )}
        </div>

        {/* Business name */}
        <div className="space-y-1.5">
          <label
            htmlFor="business_name"
            className="block text-[12.5px] font-medium"
            style={{ color: "var(--color-ink-2)" }}
          >
            שם העסק
          </label>
          <input
            id="business_name"
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            disabled={isPending}
            maxLength={120}
            placeholder="למשל: סלון רונית"
            className="w-full rounded-[10px] px-3 py-2 text-[14px] outline-none transition-colors disabled:opacity-60"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: fieldErrors.businessName
                ? "1px solid var(--color-sys-pink)"
                : "1px solid var(--color-hairline)",
              color: "var(--color-ink)",
            }}
            dir="rtl"
          />
          {fieldErrors.businessName && (
            <p
              className="text-[11.5px]"
              style={{ color: "var(--color-sys-pink)" }}
            >
              {fieldErrors.businessName}
            </p>
          )}
        </div>

        {/* Gender — radio buttons */}
        <div className="space-y-1.5">
          <label
            className="block text-[12.5px] font-medium"
            style={{ color: "var(--color-ink-2)" }}
          >
            מגדר בעל העסק
          </label>
          <p
            className="text-[11.5px] leading-[1.5]"
            style={{ color: "var(--color-ink-3)" }}
          >
            הסוכנים ינסחו בעברית מותאמת לזכר או נקבה ("שלך"/"שלך", "תוכל"/"תוכלי")
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setGender("male")}
              disabled={isPending}
              className="flex-1 rounded-[10px] px-4 py-2.5 text-[13.5px] font-medium transition-all disabled:opacity-60"
              style={{
                background:
                  gender === "male"
                    ? "rgba(10, 132, 255, 0.1)"
                    : "rgba(255,255,255,0.5)",
                border:
                  gender === "male"
                    ? "1.5px solid var(--color-sys-blue)"
                    : "1px solid var(--color-hairline)",
                color:
                  gender === "male"
                    ? "var(--color-sys-blue)"
                    : "var(--color-ink-2)",
              }}
            >
              {gender === "male" && (
                <Check
                  size={14}
                  strokeWidth={2.5}
                  className="ml-1 inline-block"
                  aria-hidden
                />
              )}
              זכר
            </button>
            <button
              type="button"
              onClick={() => setGender("female")}
              disabled={isPending}
              className="flex-1 rounded-[10px] px-4 py-2.5 text-[13.5px] font-medium transition-all disabled:opacity-60"
              style={{
                background:
                  gender === "female"
                    ? "rgba(10, 132, 255, 0.1)"
                    : "rgba(255,255,255,0.5)",
                border:
                  gender === "female"
                    ? "1.5px solid var(--color-sys-blue)"
                    : "1px solid var(--color-hairline)",
                color:
                  gender === "female"
                    ? "var(--color-sys-blue)"
                    : "var(--color-ink-2)",
              }}
            >
              {gender === "female" && (
                <Check
                  size={14}
                  strokeWidth={2.5}
                  className="ml-1 inline-block"
                  aria-hidden
                />
              )}
              נקבה
            </button>
          </div>
          {fieldErrors.businessOwnerGender && (
            <p
              className="text-[11.5px]"
              style={{ color: "var(--color-sys-pink)" }}
            >
              {fieldErrors.businessOwnerGender}
            </p>
          )}
        </div>
      </Glass>

      {/* ─── Card 2: Vertical ─────────────────────────────── */}
      <Glass className="space-y-4 p-5 sm:p-6">
        <div>
          <h2
            className="text-[15.5px] font-semibold tracking-tight"
            style={{ color: "var(--color-ink)" }}
          >
            ענף העסק
          </h2>
          <p
            className="mt-1 text-[12px] leading-[1.5]"
            style={{ color: "var(--color-ink-3)" }}
          >
            הסוכנים מתאימים את הטון, הביטויים והגישה לתחום העסק שלך. למשל,
            עורכי דין יקבלו טון פורמלי יותר; מרפאות שיניים יקבלו טון מקצועי-חם.
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="vertical"
            className="block text-[12.5px] font-medium"
            style={{ color: "var(--color-ink-2)" }}
          >
            תחום העסק
          </label>
          <select
            id="vertical"
            value={vertical}
            onChange={(e) => setVertical(e.target.value as Vertical)}
            disabled={isPending}
            className="w-full rounded-[10px] px-3 py-2 text-[14px] outline-none transition-colors disabled:opacity-60"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: fieldErrors.vertical
                ? "1px solid var(--color-sys-pink)"
                : "1px solid var(--color-hairline)",
              color: "var(--color-ink)",
            }}
            dir="rtl"
          >
            {(Object.keys(VERTICAL_LABELS) as Vertical[]).map((v) => (
              <option key={v} value={v}>
                {VERTICAL_LABELS[v]}
              </option>
            ))}
          </select>
          {fieldErrors.vertical && (
            <p
              className="text-[11.5px]"
              style={{ color: "var(--color-sys-pink)" }}
            >
              {fieldErrors.vertical}
            </p>
          )}
        </div>
      </Glass>

      {/* ─── Submit + general error ───────────────────────── */}
      <div className="flex flex-col gap-3">
        {generalError && !Object.keys(fieldErrors).length && (
          <Glass
            className="px-4 py-3 text-[12.5px]"
            style={{
              borderColor: "var(--color-sys-pink)",
              color: "var(--color-sys-pink)",
            }}
          >
            {generalError}
          </Glass>
        )}

        <div className="flex items-center justify-between gap-3">
          <p
            className="text-[11.5px]"
            style={{ color: "var(--color-ink-3)" }}
          >
            {hasChanges ? "יש שינויים שלא נשמרו" : "אין שינויים לשמירה"}
          </p>
          <button
            type="submit"
            disabled={isPending || !hasChanges}
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-medium text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: "var(--color-sys-blue)",
              boxShadow: "0 2px 8px rgba(10,132,255,0.25)",
            }}
          >
            {isPending && <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />}
            {isPending ? "שומר..." : "שמור הגדרות"}
          </button>
        </div>
      </div>
    </form>
  );
}
