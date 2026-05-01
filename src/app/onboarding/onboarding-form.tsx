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
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";

type Vertical = "beauty" | "restaurant" | "retail" | "services" | "general";
type Gender = "male" | "female" | "neutral";

const VERTICALS: Array<{ id: Vertical; label: string; Icon: typeof Sparkles }> = [
  { id: "beauty", label: "מספרה / יופי", Icon: Scissors },
  { id: "restaurant", label: "מסעדה / בית קפה", Icon: UtensilsCrossed },
  { id: "retail", label: "חנות / מסחר", Icon: ShoppingBag },
  { id: "services", label: "שירותים מקצועיים", Icon: Briefcase },
  { id: "general", label: "אחר", Icon: MoreHorizontal },
];

const GENDERS: Array<{ id: Gender; label: string; sub: string }> = [
  { id: "male", label: "זכר", sub: "ברוך הבא, יוסי" },
  { id: "female", label: "נקבה", sub: "ברוכה הבאה, שרה" },
  { id: "neutral", label: "כללי", sub: "ברוכים הבאים" },
];

export function OnboardingForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [ownerName, setOwnerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [vertical, setVertical] = useState<Vertical | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);

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
      const res = await saveOnboardingAction({
        ownerName: ownerName.trim(),
        businessName: businessName.trim(),
        vertical: vertical!,
        gender: gender!,
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
        input::placeholder {
          color: var(--color-ink-3);
        }
        input:focus {
          border-color: var(--color-sys-blue) !important;
          background: rgba(255, 255, 255, 0.95) !important;
        }
      `}</style>
    </div>
  );
}
