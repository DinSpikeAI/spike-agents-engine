"use client";

// src/components/dashboard/settings-form.tsx
//
// Sub-stage 1.7 — Settings form (extended for Sprint 3I — business_brief).
//
// Client component that owns the form state, calls updateTenantSettings
// server action on submit, and displays both inline field errors AND a
// sonner toast on success/failure (decision (ג) from spec discussion).
//
// §15.29 mitigation (attempt 6 — RESOLVED 2026-05-13, commit c4b6942):
// types are imported from @/app/dashboard/settings/types (neutral file),
// NOT re-exported via the "use server" actions file. Function import
// stays from actions; type and constant imports come from types.
//
// Sprint 3I additions:
//   - Card 3 with a 2000-char textarea for the business voice brief
//   - char counter that turns amber at 90% and pink at the cap
//   - initialBusinessBrief prop wired through from the page
//
// Style: Calm Frosted — Glass primitive cards, CSS variables for colors,
// inline styles for system colors.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Check, Sparkles } from "lucide-react";
import { Glass } from "@/components/ui/glass";
import {
  updateTenantSettings,
  extractBriefFromWebsiteAction,
} from "@/app/dashboard/settings/actions";
import type {
  Vertical,
  BusinessOwnerGender,
} from "@/app/dashboard/settings/types";
import { BUSINESS_BRIEF_MAX_LENGTH } from "@/app/dashboard/settings/types";

interface SettingsFormProps {
  initialOwnerName: string;
  initialBusinessName: string;
  initialGender: BusinessOwnerGender;
  initialVertical: Vertical;
  initialBusinessBrief: string | null;
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
  Record<
    | "ownerName"
    | "businessName"
    | "businessOwnerGender"
    | "vertical"
    | "businessBrief",
    string
  >
>;

// Char-count color thresholds — amber once 90% used, pink at the cap.
const BRIEF_AMBER_THRESHOLD = Math.floor(BUSINESS_BRIEF_MAX_LENGTH * 0.9);

export function SettingsForm({
  initialOwnerName,
  initialBusinessName,
  initialGender,
  initialVertical,
  initialBusinessBrief,
}: SettingsFormProps) {
  const [ownerName, setOwnerName] = useState(initialOwnerName);
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [gender, setGender] = useState<BusinessOwnerGender>(initialGender);
  const [vertical, setVertical] = useState<Vertical>(initialVertical);
  const [businessBrief, setBusinessBrief] = useState(
    initialBusinessBrief ?? "",
  );

  // Sprint 3G Phase 1b — auto-extract brief from website URL.
  // websiteUrl is form-local state only — NOT persisted to tenants.config.
  // Once the user clicks the magic-wand button, the extracted brief flows
  // into the existing businessBrief textarea where the user reviews/edits
  // and then saves via the existing "שמור הגדרות" button.
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Track if the form has changed from initial — used to disable button
  // when nothing to save. For brief, null and "" are equivalent for change
  // detection (both mean "no brief set").
  const initialBriefNormalized = initialBusinessBrief ?? "";
  const hasChanges =
    ownerName !== initialOwnerName ||
    businessName !== initialBusinessName ||
    gender !== initialGender ||
    vertical !== initialVertical ||
    businessBrief !== initialBriefNormalized;

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
        // Trimmed empty → null. Server will also normalize, but this keeps
        // the wire payload honest and the form state predictable.
        businessBrief: businessBrief.trim().length > 0 ? businessBrief : null,
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

  // Sprint 3G Phase 1b — extract handler.
  // Two-step UX (per Iron Rule §15.25 — user always confirms):
  //   1. Click button → fetch + Haiku call → returns brief (NOT persisted)
  //   2. Brief lands in the existing textarea; user reviews / edits
  //   3. User clicks "שמור הגדרות" to actually commit to tenants.config
  // If a brief already exists in the textarea, prompt before overwriting.
  const handleExtract = async () => {
    const url = websiteUrl.trim();
    if (url.length === 0 || isExtracting || isPending) return;

    if (businessBrief.trim().length > 0) {
      const overwrite = window.confirm(
        "יש כבר תיאור קיים. להחליף אותו ב-brief חדש מהאתר?",
      );
      if (!overwrite) return;
    }

    setIsExtracting(true);
    try {
      const result = await extractBriefFromWebsiteAction(url);
      if (result.ok && result.brief) {
        setBusinessBrief(result.brief);
        // Clear any prior field-error on businessBrief so the new content
        // doesn't render with a stale error border.
        setFieldErrors((prev) => {
          const next = { ...prev };
          delete next.businessBrief;
          return next;
        });
        const durationLabel = result.durationMs
          ? ` (${Math.round(result.durationMs / 100) / 10} שניות)`
          : "";
        toast.success(
          `brief נוצר${durationLabel}. עיין, ערוך לפי הצורך, ולחץ "שמור הגדרות".`,
        );
      } else {
        toast.error(result.error ?? "החילוץ נכשל");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "שגיאה לא ידועה בחילוץ";
      toast.error(message);
    } finally {
      setIsExtracting(false);
    }
  };

  // Brief counter color — green by default, amber over threshold, pink at cap.
  const briefLen = businessBrief.length;
  const briefCounterColor =
    briefLen >= BUSINESS_BRIEF_MAX_LENGTH
      ? "var(--color-sys-pink)"
      : briefLen >= BRIEF_AMBER_THRESHOLD
        ? "var(--color-sys-amber)"
        : "var(--color-ink-3)";

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

        {/* Gender — button toggle */}
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
            הסוכנים ינסחו בעברית מותאמת לזכר, נקבה או רבים ("שלך"/"שלך"/"שלכם", "תוכל"/"תוכלי"/"תוכלו")
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
            <button
              type="button"
              onClick={() => setGender("plural")}
              disabled={isPending}
              className="flex-1 rounded-[10px] px-4 py-2.5 text-[13.5px] font-medium transition-all disabled:opacity-60"
              style={{
                background:
                  gender === "plural"
                    ? "rgba(10, 132, 255, 0.1)"
                    : "rgba(255,255,255,0.5)",
                border:
                  gender === "plural"
                    ? "1.5px solid var(--color-sys-blue)"
                    : "1px solid var(--color-hairline)",
                color:
                  gender === "plural"
                    ? "var(--color-sys-blue)"
                    : "var(--color-ink-2)",
              }}
            >
              {gender === "plural" && (
                <Check
                  size={14}
                  strokeWidth={2.5}
                  className="ml-1 inline-block"
                  aria-hidden
                />
              )}
              כללי
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

      {/* ─── Card 3: Business voice brief (Sprint 3I) ─────── */}
      <Glass className="space-y-4 p-5 sm:p-6">
        <div>
          <h2
            className="text-[15.5px] font-semibold tracking-tight"
            style={{ color: "var(--color-ink)" }}
          >
            סגנון העסק שלך
          </h2>
          <p
            className="mt-1 text-[12px] leading-[1.5]"
            style={{ color: "var(--color-ink-3)" }}
          >
            כתוב כאן בחופשיות על העסק והסגנון שלך. הסוכנים יקראו את זה לפני
            שהם מנסחים טיוטות בשמך, כדי שהטון, הביטויים והערכים שלך יופיעו
            בכל הודעה.
          </p>
        </div>

        {/* ─── Sprint 3G Phase 1b: auto-extract from website URL ─── */}
        <div className="space-y-1.5">
          <label
            htmlFor="website_url"
            className="block text-[12.5px] font-medium"
            style={{ color: "var(--color-ink-2)" }}
          >
            🪄 צור brief מהאתר שלך (אופציונלי)
          </label>
          <p
            className="text-[11.5px] leading-[1.5]"
            style={{ color: "var(--color-ink-3)" }}
          >
            הכנס כתובת URL של האתר שלך — נקרא את התוכן ונכתוב טיוטה ראשונית בעברית. תוכל לערוך אותה לפני שמירה.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="website_url"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              disabled={isExtracting || isPending}
              placeholder="https://your-website.co.il"
              dir="ltr"
              className="flex-1 rounded-[10px] px-3 py-2 text-[14px] outline-none transition-colors disabled:opacity-60"
              style={{
                background: "rgba(255,255,255,0.7)",
                border: "1px solid var(--color-hairline)",
                color: "var(--color-ink)",
              }}
            />
            <button
              type="button"
              onClick={handleExtract}
              disabled={
                isExtracting || isPending || websiteUrl.trim().length === 0
              }
              className="flex items-center justify-center gap-1.5 rounded-[10px] px-4 py-2 text-[13.5px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: "rgba(10, 132, 255, 0.1)",
                border: "1px solid var(--color-sys-blue)",
                color: "var(--color-sys-blue)",
              }}
            >
              {isExtracting ? (
                <>
                  <Loader2
                    size={14}
                    strokeWidth={2.5}
                    className="animate-spin"
                  />
                  מחפש...
                </>
              ) : (
                <>
                  <Sparkles size={14} strokeWidth={2.5} />
                  צור brief
                </>
              )}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="business_brief"
            className="block text-[12.5px] font-medium"
            style={{ color: "var(--color-ink-2)" }}
          >
            תיאור
          </label>
          <textarea
            id="business_brief"
            value={businessBrief}
            onChange={(e) => setBusinessBrief(e.target.value)}
            disabled={isPending}
            maxLength={BUSINESS_BRIEF_MAX_LENGTH}
            rows={7}
            placeholder="לדוגמה: סלון יופי לנשים בעין השופט. אני מתמחה בקרטין וצביעות. אני אוהבת לקרוא ללקוחות שלי 'יקירה' ולסיים שיחה בברכת שבת שלום ביום שישי. אני לא אוהבת טון פורמלי או מילים נמלצות. הכי חשוב לי שהלקוחה תרגיש שמדברים איתה כמו חברה."
            className="w-full resize-y rounded-[10px] px-3 py-2 text-[13.5px] leading-[1.6] outline-none transition-colors disabled:opacity-60"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: fieldErrors.businessBrief
                ? "1px solid var(--color-sys-pink)"
                : "1px solid var(--color-hairline)",
              color: "var(--color-ink)",
              minHeight: "160px",
            }}
            dir="rtl"
          />
          <div className="flex items-center justify-between">
            {fieldErrors.businessBrief ? (
              <p
                className="text-[11.5px]"
                style={{ color: "var(--color-sys-pink)" }}
              >
                {fieldErrors.businessBrief}
              </p>
            ) : (
              <span />
            )}
            <p
              className="text-[11.5px] tabular-nums"
              style={{ color: briefCounterColor }}
            >
              {briefLen} / {BUSINESS_BRIEF_MAX_LENGTH}
            </p>
          </div>
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
