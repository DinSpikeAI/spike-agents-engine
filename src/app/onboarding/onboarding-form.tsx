"use client";

import { useState, useTransition } from "react";
import { saveOnboardingAction } from "./actions";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Scissors,
  UtensilsCrossed,
  ShoppingBag,
  Briefcase,
  MoreHorizontal,
  Stethoscope,
  Landmark,
  GraduationCap,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";

type Vertical =
  | "beauty"
  | "restaurant"
  | "retail"
  | "services"
  | "general"
  | "clinic"
  | "financial"
  | "education";
type Gender = "male" | "female" | "plural";

const VERTICALS: Array<{ id: Vertical; label: string; Icon: typeof Sparkles }> = [
  { id: "beauty", label: "מספרה / יופי", Icon: Scissors },
  { id: "restaurant", label: "מסעדה / בית קפה", Icon: UtensilsCrossed },
  { id: "retail", label: "חנות / מסחר", Icon: ShoppingBag },
  { id: "services", label: "שירותים מקצועיים", Icon: Briefcase },
  { id: "clinic", label: "מרפאה / קליניקה", Icon: Stethoscope },
  { id: "financial", label: "פיננסי / חשבונאות", Icon: Landmark },
  { id: "education", label: "חינוך / הוראה", Icon: GraduationCap },
  { id: "general", label: "אחר", Icon: MoreHorizontal },
];

const GENDERS: Array<{ id: Gender; label: string; sub: string }> = [
  { id: "male", label: "זכר", sub: "ברוך הבא, יוסי" },
  { id: "female", label: "נקבה", sub: "ברוכה הבאה, שרה" },
  { id: "plural", label: "כללי", sub: "ברוכים הבאים" },
];

// Sprint 3I onboarding integration: same limit as the /dashboard/settings
// textarea — keeps the two surfaces in lockstep. Mirrors MAX_BUSINESS_BRIEF_LENGTH
// in ./actions.ts; if you change one, change both.
const BUSINESS_BRIEF_MAX_LENGTH = 2000;

export function OnboardingForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [ownerName, setOwnerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [vertical, setVertical] = useState<Vertical | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);
  // Sprint 3I: optional brief — agents inject it on Day 1 if filled here.
  const [businessBrief, setBusinessBrief] = useState("");

  // businessBrief is NOT in the canSubmit gate — it's optional. The owner
  // can complete onboarding without writing anything, and fill it later
  // via /dashboard/settings if they prefer.
  const canSubmit =
    ownerName.trim().length > 0 &&
    businessName.trim().length > 0 &&
    vertical !== null &&
    gender !== null &&
    !isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setError(null);

    startTransition(async () => {
      const trimmedBrief = businessBrief.trim();
      const res = await saveOnboardingAction({
        ownerName: ownerName.trim(),
        businessName: businessName.trim(),
        vertical: vertical!,
        gender: gender!,
        // Send brief only when the user actually typed something — the
        // server action skips writing config.business_brief on empty input.
        businessBrief: trimmedBrief.length > 0 ? trimmedBrief : undefined,
      });

      if (res.success) {
        // Server-side redirect via router.push — Next handles RSC refresh
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(res.error ?? "משהו השתבש");
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Owner name */}
      <div>
        <label
          htmlFor="ownerName"
          className="mb-1.5 block text-[12.5px] font-medium"
          style={{ color: "var(--color-ink-2)" }}
        >
          איך לקרוא לך?
        </label>
        <input
          id="ownerName"
          type="text"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder="השם הפרטי שלך"
          maxLength={60}
          dir="rtl"
          className="w-full rounded-[10px] px-3 py-2.5 text-[14px] outline-none transition-colors"
          style={{
            background: "rgba(255,255,255,0.7)",
            border: "1px solid var(--color-hairline)",
            color: "var(--color-ink)",
          }}
        />
      </div>

      {/* Business name */}
      <div>
        <label
          htmlFor="businessName"
          className="mb-1.5 block text-[12.5px] font-medium"
          style={{ color: "var(--color-ink-2)" }}
        >
          שם העסק
        </label>
        <input
          id="businessName"
          type="text"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="לדוגמה: מספרת אורי"
          maxLength={120}
          dir="rtl"
          className="w-full rounded-[10px] px-3 py-2.5 text-[14px] outline-none transition-colors"
          style={{
            background: "rgba(255,255,255,0.7)",
            border: "1px solid var(--color-hairline)",
            color: "var(--color-ink)",
          }}
        />
      </div>

      {/* Vertical */}
      <div>
        <label
          className="mb-1.5 block text-[12.5px] font-medium"
          style={{ color: "var(--color-ink-2)" }}
        >
          תחום העסק
        </label>
        <div className="grid grid-cols-2 gap-2">
          {VERTICALS.map((v) => {
            const Icon = v.Icon;
            const active = vertical === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVertical(v.id)}
                className="flex items-center gap-2 rounded-[10px] px-3 py-2.5 text-[13px] font-medium transition-all"
                style={
                  active
                    ? {
                        background: "var(--color-sys-blue-soft)",
                        border: "1px solid var(--color-sys-blue)",
                        color: "var(--color-sys-blue)",
                      }
                    : {
                        background: "rgba(255,255,255,0.7)",
                        border: "1px solid var(--color-hairline)",
                        color: "var(--color-ink-2)",
                      }
                }
              >
                <Icon size={14} strokeWidth={1.75} />
                <span>{v.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Gender — for the agents' Hebrew tone */}
      <div>
        <label
          className="mb-1.5 block text-[12.5px] font-medium"
          style={{ color: "var(--color-ink-2)" }}
        >
          איך לפנות אליך?
        </label>
        <div className="grid grid-cols-3 gap-2">
          {GENDERS.map((g) => {
            const active = gender === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGender(g.id)}
                className="rounded-[10px] px-3 py-2.5 text-center transition-all"
                style={
                  active
                    ? {
                        background: "var(--color-sys-blue-soft)",
                        border: "1px solid var(--color-sys-blue)",
                      }
                    : {
                        background: "rgba(255,255,255,0.7)",
                        border: "1px solid var(--color-hairline)",
                      }
                }
              >
                <div
                  className="text-[13px] font-semibold"
                  style={{
                    color: active
                      ? "var(--color-sys-blue)"
                      : "var(--color-ink)",
                  }}
                >
                  {g.label}
                </div>
                <div
                  className="mt-0.5 text-[10.5px]"
                  style={{ color: "var(--color-ink-3)" }}
                >
                  {g.sub}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Business brief — Sprint 3I (2026-05-15). Optional 5th field. */}
      {/* When filled, the 5 customer-facing agents (Reviews, Sales×2, */}
      {/* Social, Growth) inject it into their system prompts so Day 1 */}
      {/* drafts already match the owner's voice. See actions.ts header. */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label
            htmlFor="businessBrief"
            className="block text-[12.5px] font-medium"
            style={{ color: "var(--color-ink-2)" }}
          >
            מה מאפיין את העסק שלך?{" "}
            <span style={{ color: "var(--color-ink-3)", fontWeight: 400 }}>
              (אופציונלי)
            </span>
          </label>
          <span
            className="text-[10.5px]"
            style={{ color: "var(--color-ink-3)" }}
          >
            {businessBrief.length}/{BUSINESS_BRIEF_MAX_LENGTH}
          </span>
        </div>
        <p
          className="mb-2 text-[11.5px] leading-[1.45]"
          style={{ color: "var(--color-ink-3)" }}
        >
          הסוכנים ינסחו ללקוחות שלך בסגנון שלך — תיאור קצר עוזר להם להישמע כמוך מהיום הראשון.
        </p>
        <textarea
          id="businessBrief"
          value={businessBrief}
          onChange={(e) => setBusinessBrief(e.target.value)}
          placeholder="לדוגמה: מספרה קטנה בעין השופט. אני מתמחה בקרטין. אוהבת לקרוא ללקוחות 'יקירה'. הטיפולים שלי נינוחים — אני שואלת קודם איך הלקוחה מרגישה."
          maxLength={BUSINESS_BRIEF_MAX_LENGTH}
          rows={5}
          dir="rtl"
          className="w-full rounded-[10px] px-3 py-2.5 text-[13.5px] leading-[1.5] outline-none transition-colors"
          style={{
            background: "rgba(255,255,255,0.7)",
            border: "1px solid var(--color-hairline)",
            color: "var(--color-ink)",
            resize: "vertical",
            minHeight: "112px",
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* Error toast */}
      {error && (
        <div
          className="flex items-start gap-2 rounded-[10px] px-3 py-2 text-[12.5px]"
          style={{
            background: "rgba(214, 51, 108, 0.08)",
            border: "1px solid rgba(214, 51, 108, 0.20)",
            color: "var(--color-sys-pink)",
          }}
        >
          <AlertTriangle
            size={14}
            strokeWidth={2}
            className="mt-0.5 flex-shrink-0"
          />
          <span>{error}</span>
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-[14px] font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          background: "var(--color-sys-blue)",
          boxShadow: "var(--shadow-cta)",
        }}
      >
        {isPending ? (
          <>
            <span
              className="inline-block h-3 w-3 rounded-full border-2 border-white border-t-transparent"
              style={{ animation: "spin 0.8s linear infinite" }}
              aria-hidden="true"
            />
            <span>שומר...</span>
          </>
        ) : (
          <>
            <span>בואו נתחיל</span>
            <ArrowLeft size={14} strokeWidth={2} />
          </>
        )}
      </button>

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        input::placeholder,
        textarea::placeholder {
          color: var(--color-ink-3);
        }
        input:focus,
        textarea:focus {
          border-color: var(--color-sys-blue) !important;
          background: rgba(255, 255, 255, 0.95) !important;
        }
      `}</style>
    </div>
  );
}
