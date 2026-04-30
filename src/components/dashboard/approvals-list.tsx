"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveDraft,
  rejectDraft,
  type PendingDraft,
} from "@/app/dashboard/actions";
import { Glass } from "@/components/ui/glass";
import { Check, X, Copy, MessageCircle, Lock } from "lucide-react";

const SENTIMENT_LABELS: Record<string, string> = {
  positive: "חיובי",
  neutral: "נייטרלי",
  negative: "שלילי",
  very_negative: "שלילי מאוד",
};

const INTENT_LABELS: Record<string, string> = {
  praise: "שבח",
  minor_complaint: "תלונה קלה",
  major_complaint: "תלונה כבדה",
  abusive: "תוקפני",
  spam_or_fake: "ספאם/חשוד",
};

const SOCIAL_SLOT_LABELS: Record<string, string> = {
  morning: "🌅 בוקר",
  noon: "☀️ צהריים",
  evening: "🌙 ערב",
};

const SOCIAL_PLATFORM_LABELS: Record<string, string> = {
  instagram: "📷 אינסטגרם",
  facebook: "👥 פייסבוק",
  both: "📱 שני הפלטפורמות",
};

const SOCIAL_TYPE_LABELS: Record<string, string> = {
  educational: "חינוכי",
  promotional: "קידום",
  testimonial: "המלצה",
  behind_scenes: "מאחורי הקלעים",
  seasonal: "עונתי",
  milestone: "אבן דרך",
  engagement: "מעורבות",
};

const SALES_CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "💬 וואטסאפ",
  email: "✉️ אימייל",
  instagram_dm: "📷 הודעה באינסטגרם",
  manual: "📝 העתקה ידנית",
};

const SALES_TONE_LABELS: Record<string, string> = {
  warm_check_in: "בדיקה חמה",
  value_reminder: "תזכורת ערך",
  gentle_nudge: "תזכורת עדינה",
  direct_close: "סגירה ישירה",
  break_up: "שחרור",
};

const SALES_STUCK_REASON_LABELS: Record<string, string> = {
  no_response_after_quote: "אין תגובה אחרי הצעת מחיר",
  ghosted_after_meeting: "נעלם אחרי פגישה",
  price_objection_unresolved: "התנגדות מחיר",
  timing_uncertain: "תזמון לא ברור",
  decision_maker_unclear: "מקבל ההחלטות לא ברור",
  no_response_after_initial: "אין תגובה אחרי פנייה ראשונה",
  other: "אחר",
};

function StarRow({ rating }: { rating: number }) {
  const filled = Math.max(0, Math.min(5, rating));
  return (
    <span className="inline-flex gap-[2px]" aria-label={`${filled} מתוך 5 כוכבים`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          style={{
            color: i < filled ? "#E0A93D" : "rgba(15,20,30,0.15)",
            fontSize: "14px",
            lineHeight: 1,
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          alert("לא ניתן להעתיק. נסה ידנית.");
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-all hover:bg-white"
      style={{
        background: "rgba(255,255,255,0.7)",
        borderColor: "var(--color-hairline)",
        color: "var(--color-ink-2)",
      }}
    >
      <Copy size={11} strokeWidth={1.75} />
      {copied ? "הועתק" : "העתק"}
    </button>
  );
}

export function ApprovalsList({ drafts }: { drafts: PendingDraft[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actioningId, setActioningId] = useState<string | null>(null);

  const handleApprove = (id: string) => {
    setActioningId(id);
    startTransition(async () => {
      const res = await approveDraft(id);
      if (res.success) router.refresh();
      else alert(`שגיאה: ${res.error ?? "לא ידוע"}`);
      setActioningId(null);
    });
  };

  const handleReject = (id: string) => {
    if (!confirm("לדחות את הטיוטה הזו?")) return;
    setActioningId(id);
    startTransition(async () => {
      const res = await rejectDraft(id);
      if (res.success) router.refresh();
      else alert(`שגיאה: ${res.error ?? "לא ידוע"}`);
      setActioningId(null);
    });
  };

  return (
    <div className="space-y-3">
      {drafts.map((d) => {
        const isReview = d.type === "review_reply";
        const isSocial = d.type === "social_post";
        const isSales = d.type === "sales_followup";
        const c = d.content as Record<string, unknown>;

        // Reviews fields
        const reviewerName = (c.reviewerName as string) ?? d.recipient_label ?? "—";
        const rating = (c.rating as number) ?? 0;
        const reviewText = (c.reviewTextDisplay as string) ?? "";
        const draftText = (c.draftText as string) ?? "";
        const rationale = (c.rationale as string) ?? "";
        const sentiment = (c.sentiment as string) ?? "";
        const intent = (c.intent as string) ?? "";

        // Social fields
        const slot = (c.slot as string) ?? "";
        const platformRec = (c.platformRecommendation as string) ?? "";
        const postType = (c.postType as string) ?? "";
        const captionHebrew = (c.captionHebrew as string) ?? "";
        const hashtags = (c.hashtags as string[]) ?? [];
        const cta = (c.cta as string) ?? "";
        const suggestedImagePrompt = (c.suggestedImagePrompt as string) ?? "";
        const bestTimeToPost = (c.bestTimeToPostLocal as string) ?? "";
        const rationaleShort = (c.rationaleShort as string) ?? "";
        const confidence = (c.confidence as string) ?? "";

        // Sales fields
        const leadDisplayName = (c.leadDisplayName as string) ?? "";
        const stuckReason = (c.stuckReasonInferred as string) ?? "";
        const channel = (c.channel as string) ?? "";
        const subjectLine = (c.subjectLineHebrew as string) ?? null;
        const messageHebrew = (c.messageHebrew as string) ?? "";
        const messageTone = (c.messageTone as string) ?? "";
        const whatsappUrl = (c.whatsappUrl as string) ?? null;
        const sendWindow = (c.recommendedSendWindowLocal as string) ?? "";
        const responseProb = (c.expectedResponseProbability as string) ?? "";

        const fullSocialText = isSocial
          ? `${captionHebrew}\n\n${hashtags.join(" ")}\n\n${cta}`.trim()
          : "";

        const fullSalesText = isSales
          ? subjectLine
            ? `נושא: ${subjectLine}\n\n${messageHebrew}`
            : messageHebrew
          : "";

        const isBlocked =
          d.status === "rejected" && d.rejection_reason?.includes("Defamation");

        const typeLabel = isReview
          ? "תגובה לביקורת"
          : isSocial
          ? "פוסט לרשתות"
          : isSales
          ? "פולואו־אפ ללקוח"
          : d.type;

        const headerTitle = isReview
          ? null
          : isSocial
          ? `${SOCIAL_SLOT_LABELS[slot] ?? slot} · ${SOCIAL_TYPE_LABELS[postType] ?? postType}`
          : isSales
          ? `${leadDisplayName} · ${SALES_CHANNEL_LABELS[channel] ?? channel}`
          : d.recipient_label ?? "טיוטה";

        return (
          <Glass key={d.id} className="overflow-hidden p-5">
            {/* Header */}
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className="text-[10.5px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--color-ink-3)" }}
                  >
                    {typeLabel}
                  </span>
                  {d.contains_pii && (
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-medium"
                      style={{
                        background: "var(--color-sys-amber)",
                        color: "white",
                      }}
                    >
                      <Lock size={9} strokeWidth={2} />
                      PII הוסתר
                    </span>
                  )}
                  {isSocial && confidence && (
                    <span
                      className="rounded-md px-2 py-0.5 text-[10.5px] font-medium"
                      style={{
                        background:
                          confidence === "high"
                            ? "var(--color-sys-green-soft)"
                            : "rgba(15,20,30,0.05)",
                        color:
                          confidence === "high"
                            ? "var(--color-sys-green)"
                            : "var(--color-ink-3)",
                      }}
                    >
                      ביטחון:{" "}
                      {confidence === "high"
                        ? "גבוה"
                        : confidence === "medium"
                        ? "בינוני"
                        : "נמוך"}
                    </span>
                  )}
                  {isSales && responseProb && (
                    <span
                      className="rounded-md px-2 py-0.5 text-[10.5px] font-medium"
                      style={{
                        background:
                          responseProb === "high"
                            ? "var(--color-sys-green-soft)"
                            : "rgba(15,20,30,0.05)",
                        color:
                          responseProb === "high"
                            ? "var(--color-sys-green)"
                            : "var(--color-ink-3)",
                      }}
                    >
                      סיכוי תגובה:{" "}
                      {responseProb === "high"
                        ? "גבוה"
                        : responseProb === "med"
                        ? "בינוני"
                        : "נמוך"}
                    </span>
                  )}
                </div>

                <h3
                  className="text-[16px] font-semibold tracking-tight flex items-center gap-2"
                  style={{ color: "var(--color-ink)" }}
                >
                  {isReview && (
                    <>
                      <StarRow rating={rating} />
                      <span>· {reviewerName}</span>
                    </>
                  )}
                  {!isReview && headerTitle}
                </h3>

                {isReview && (
                  <div
                    className="mt-1 flex gap-3 text-[11.5px]"
                    style={{ color: "var(--color-ink-3)" }}
                  >
                    <span>טון: {SENTIMENT_LABELS[sentiment] ?? sentiment}</span>
                    <span>·</span>
                    <span>כוונה: {INTENT_LABELS[intent] ?? intent}</span>
                  </div>
                )}

                {isSocial && (
                  <div
                    className="mt-1 flex flex-wrap gap-3 text-[11.5px]"
                    style={{ color: "var(--color-ink-3)" }}
                  >
                    <span>
                      {SOCIAL_PLATFORM_LABELS[platformRec] ?? platformRec}
                    </span>
                    {bestTimeToPost && (
                      <>
                        <span>·</span>
                        <span>זמן מומלץ: {bestTimeToPost}</span>
                      </>
                    )}
                  </div>
                )}

                {isSales && (
                  <div
                    className="mt-1 flex flex-wrap gap-3 text-[11.5px]"
                    style={{ color: "var(--color-ink-3)" }}
                  >
                    <span>
                      סיבה:{" "}
                      {SALES_STUCK_REASON_LABELS[stuckReason] ?? stuckReason}
                    </span>
                    {messageTone && (
                      <>
                        <span>·</span>
                        <span>טון: {SALES_TONE_LABELS[messageTone] ?? messageTone}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Original review (if applicable) */}
            {isReview && reviewText && (
              <div
                className="mb-3 rounded-lg p-3"
                style={{
                  background: "rgba(15,20,30,0.04)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                <div
                  className="mb-1 text-[11px] font-medium"
                  style={{ color: "var(--color-ink-3)" }}
                >
                  הביקורת המקורית:
                </div>
                <p
                  className="text-[13px] leading-relaxed"
                  style={{ color: "var(--color-ink-2)" }}
                >
                  {reviewText}
                </p>
              </div>
            )}

            {/* Content */}
            {isBlocked ? (
              <div
                className="mb-3 rounded-lg p-3.5"
                style={{
                  background: "rgba(214, 51, 108, 0.08)",
                  border: "1px solid rgba(214, 51, 108, 0.2)",
                }}
              >
                <div
                  className="mb-1.5 text-[13px] font-semibold"
                  style={{ color: "var(--color-sys-pink)" }}
                >
                  ⚠️ הטיוטה הזו נחסמה
                </div>
                <p
                  className="text-[12.5px]"
                  style={{ color: "var(--color-ink-2)" }}
                >
                  {d.rejection_reason ?? "סיכון של לשון הרע."}
                </p>
                <details
                  className="mt-3 text-[12px]"
                  style={{ color: "var(--color-ink-3)" }}
                >
                  <summary className="cursor-pointer">הצג את הטיוטה החסומה</summary>
                  <div
                    className="mt-2 whitespace-pre-wrap rounded p-3"
                    style={{
                      background: "rgba(15,20,30,0.04)",
                      color: "var(--color-ink-2)",
                    }}
                  >
                    {draftText}
                  </div>
                </details>
              </div>
            ) : isSocial ? (
              <div
                className="mb-3 rounded-lg p-3.5"
                style={{
                  background: "rgba(255,255,255,0.5)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div
                    className="text-[11px] font-medium"
                    style={{ color: "var(--color-ink-3)" }}
                  >
                    הפוסט המוצע:
                  </div>
                  <CopyButton text={fullSocialText} />
                </div>
                <p
                  className="whitespace-pre-wrap text-[13px] leading-relaxed"
                  style={{ color: "var(--color-ink)" }}
                >
                  {captionHebrew}
                </p>

                {hashtags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {hashtags.map((h, i) => (
                      <span
                        key={i}
                        className="rounded-md px-2 py-0.5 text-[11px]"
                        style={{
                          background: "var(--color-sys-blue-soft)",
                          color: "var(--color-sys-blue)",
                        }}
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                )}

                {cta && (
                  <div
                    className="mt-3 text-[13px] font-semibold"
                    style={{ color: "var(--color-sys-blue)" }}
                  >
                    👉 {cta}
                  </div>
                )}

                {suggestedImagePrompt && (
                  <details className="mt-3">
                    <summary
                      className="cursor-pointer text-[11.5px] font-medium"
                      style={{ color: "var(--color-ink-3)" }}
                    >
                      💡 הצעת תמונה לפוסט
                    </summary>
                    <p
                      className="mt-2 text-[11.5px] leading-relaxed"
                      style={{ color: "var(--color-ink-2)" }}
                    >
                      {suggestedImagePrompt}
                    </p>
                  </details>
                )}

                {rationaleShort && (
                  <div
                    className="mt-3 border-t pt-2.5 text-[11px]"
                    style={{
                      borderColor: "var(--color-hairline)",
                      color: "var(--color-ink-3)",
                    }}
                  >
                    <span className="font-medium">למה זה? </span>
                    {rationaleShort}
                  </div>
                )}
              </div>
            ) : isSales ? (
              <div
                className="mb-3 rounded-lg p-3.5"
                style={{
                  background: "rgba(255,255,255,0.5)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div
                    className="text-[11px] font-medium"
                    style={{ color: "var(--color-ink-3)" }}
                  >
                    ההודעה המוצעת:
                  </div>
                  <div className="flex gap-2">
                    {whatsappUrl && (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-white transition-all"
                        style={{
                          background:
                            "linear-gradient(135deg, #25D366, #1A9F4E)",
                          boxShadow: "0 4px 12px rgba(31,185,112,0.32)",
                        }}
                      >
                        <MessageCircle size={11} strokeWidth={2} />
                        פתח בוואטסאפ
                      </a>
                    )}
                    <CopyButton text={fullSalesText} />
                  </div>
                </div>

                {subjectLine && (
                  <div
                    className="mb-2 rounded p-2"
                    style={{
                      background: "rgba(15,20,30,0.04)",
                      border: "1px solid var(--color-hairline)",
                    }}
                  >
                    <div
                      className="text-[10.5px]"
                      style={{ color: "var(--color-ink-3)" }}
                    >
                      נושא:
                    </div>
                    <div
                      className="text-[12.5px] font-semibold"
                      style={{ color: "var(--color-ink)" }}
                    >
                      {subjectLine}
                    </div>
                  </div>
                )}

                <p
                  className="whitespace-pre-wrap text-[13px] leading-relaxed"
                  style={{ color: "var(--color-ink)" }}
                >
                  {messageHebrew}
                </p>

                {sendWindow && (
                  <div
                    className="mt-3 text-[11px]"
                    style={{ color: "var(--color-ink-3)" }}
                  >
                    ⏰ {sendWindow}
                  </div>
                )}

                {rationaleShort && (
                  <div
                    className="mt-3 border-t pt-2.5 text-[11px]"
                    style={{
                      borderColor: "var(--color-hairline)",
                      color: "var(--color-ink-3)",
                    }}
                  >
                    <span className="font-medium">למה זה? </span>
                    {rationaleShort}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="mb-3 rounded-lg p-3.5"
                style={{
                  background: "rgba(255,255,255,0.5)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                <div
                  className="mb-1 text-[11px] font-medium"
                  style={{ color: "var(--color-ink-3)" }}
                >
                  הטיוטה המוצעת:
                </div>
                <p
                  className="whitespace-pre-wrap text-[13px] leading-relaxed"
                  style={{ color: "var(--color-ink)" }}
                >
                  {draftText}
                </p>
                {rationale && (
                  <div
                    className="mt-3 border-t pt-2.5 text-[11px]"
                    style={{
                      borderColor: "var(--color-hairline)",
                      color: "var(--color-ink-3)",
                    }}
                  >
                    <span className="font-medium">למה זה? </span>
                    {rationale}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div
              className="flex items-center justify-between border-t pt-3"
              style={{ borderColor: "var(--color-hairline)" }}
            >
              <div
                className="text-[11px]"
                style={{ color: "var(--color-ink-3)" }}
              >
                נוצר{" "}
                {new Date(d.created_at).toLocaleString("he-IL", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              <div className="flex gap-2">
                {!isBlocked && (
                  <button
                    onClick={() => handleApprove(d.id)}
                    disabled={isPending && actioningId === d.id}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold text-white transition-all disabled:opacity-50"
                    style={{
                      background: "var(--color-sys-green)",
                      boxShadow: "0 4px 12px rgba(48,179,107,0.28)",
                    }}
                  >
                    <Check size={12} strokeWidth={2.5} />
                    {isPending && actioningId === d.id
                      ? "..."
                      : isSales
                      ? "שלחתי"
                      : isSocial
                      ? "אושר"
                      : "אשר ושלח"}
                  </button>
                )}
                <button
                  onClick={() => handleReject(d.id)}
                  disabled={isPending && actioningId === d.id}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-all disabled:opacity-50"
                  style={{
                    background: "rgba(255,255,255,0.7)",
                    borderColor: "var(--color-hairline)",
                    color: "var(--color-ink-2)",
                  }}
                >
                  <X size={12} strokeWidth={2} />
                  {isPending && actioningId === d.id ? "..." : "דחה"}
                </button>
              </div>
            </div>
          </Glass>
        );
      })}
    </div>
  );
}
