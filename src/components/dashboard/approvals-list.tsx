"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveDraft, rejectDraft, type PendingDraft } from "@/app/dashboard/actions";

const RISK_STYLES: Record<
  "low" | "medium" | "high",
  { bg: string; border: string; text: string; label: string }
> = {
  low:    { bg: "rgba(34, 197, 94, 0.08)",  border: "rgba(34, 197, 94, 0.30)",  text: "#86EFAC", label: "סיכון נמוך" },
  medium: { bg: "rgba(252, 211, 77, 0.10)", border: "rgba(252, 211, 77, 0.40)", text: "#FDE68A", label: "סיכון בינוני" },
  high:   { bg: "rgba(255, 164, 181, 0.10)", border: "rgba(255, 164, 181, 0.40)", text: "#FFA4B5", label: "נחסם — סיכון גבוה" },
};

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
  const empty = 5 - filled;
  return (
    <span
      style={{
        display: "inline-flex",
        gap: "2px",
        verticalAlign: "middle",
        marginInlineEnd: "6px",
      }}
      aria-label={`${filled} מתוך 5 כוכבים`}
    >
      {Array.from({ length: filled }).map((_, i) => (
        <span key={`f${i}`} style={{ color: "#FCD34D", fontSize: "1.1em", lineHeight: 1 }}>★</span>
      ))}
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e${i}`} style={{ color: "#475569", fontSize: "1.1em", lineHeight: 1 }}>☆</span>
      ))}
    </span>
  );
}

function CopyButton({ text, label = "העתק" }: { text: string; label?: string }) {
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
      className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300 transition-all hover:bg-slate-700"
    >
      {copied ? "✓ הועתק" : `📋 ${label}`}
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
      if (res.success) {
        router.refresh();
      } else {
        alert(`שגיאה: ${res.error ?? "לא ידוע"}`);
      }
      setActioningId(null);
    });
  };

  const handleReject = (id: string) => {
    if (!confirm("לדחות את הטיוטה הזו?")) return;
    setActioningId(id);
    startTransition(async () => {
      const res = await rejectDraft(id);
      if (res.success) {
        router.refresh();
      } else {
        alert(`שגיאה: ${res.error ?? "לא ידוע"}`);
      }
      setActioningId(null);
    });
  };

  return (
    <div className="space-y-4">
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

        const risk = (d.defamation_risk ?? "low") as "low" | "medium" | "high";
        const riskStyle = RISK_STYLES[risk];
        const isBlocked = d.status === "rejected" && d.rejection_reason?.includes("Defamation");

        const typeLabel = isReview
          ? "תגובה לביקורת"
          : isSocial
          ? "פוסט לרשתות"
          : isSales
          ? "פולואו-אפ ללקוח"
          : d.type;

        const headerTitle = isReview
          ? null
          : isSocial
          ? `${SOCIAL_SLOT_LABELS[slot] ?? slot} · ${SOCIAL_TYPE_LABELS[postType] ?? postType}`
          : isSales
          ? `${leadDisplayName} · ${SALES_CHANNEL_LABELS[channel] ?? channel}`
          : d.recipient_label ?? "טיוטה";

        return (
          <div
            key={d.id}
            className="rounded-xl border border-slate-700 bg-slate-900/60 p-5"
            style={{
              borderColor: risk === "high" ? riskStyle.border : undefined,
            }}
          >
            {/* Header row */}
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-teal-300">
                    {typeLabel}
                  </span>
                  <span
                    className="rounded-md px-2 py-0.5 text-xs font-semibold"
                    style={{
                      color: riskStyle.text,
                      background: riskStyle.bg,
                      border: `1px solid ${riskStyle.border}`,
                    }}
                  >
                    {riskStyle.label}
                  </span>
                  {d.contains_pii && (
                    <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
                      🔒 PII הוסתר
                    </span>
                  )}
                  {isSocial && confidence && (
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-medium"
                      style={{
                        color:
                          confidence === "high"
                            ? "#86EFAC"
                            : confidence === "medium"
                            ? "#FDE68A"
                            : "#94A3B8",
                        background: "rgba(148, 163, 184, 0.1)",
                      }}
                    >
                      ביטחון: {confidence === "high" ? "גבוה" : confidence === "medium" ? "בינוני" : "נמוך"}
                    </span>
                  )}
                  {isSales && responseProb && (
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-medium"
                      style={{
                        color:
                          responseProb === "high"
                            ? "#86EFAC"
                            : responseProb === "med"
                            ? "#FDE68A"
                            : "#94A3B8",
                        background: "rgba(148, 163, 184, 0.1)",
                      }}
                    >
                      סיכוי תגובה: {responseProb === "high" ? "גבוה" : responseProb === "med" ? "בינוני" : "נמוך"}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center">
                  {isReview && (
                    <>
                      <StarRow rating={rating} />
                      <span>· {reviewerName}</span>
                    </>
                  )}
                  {!isReview && headerTitle}
                </h3>
                {isReview && (
                  <div className="mt-1 flex gap-3 text-xs text-slate-500">
                    <span>טון: {SENTIMENT_LABELS[sentiment] ?? sentiment}</span>
                    <span>·</span>
                    <span>כוונה: {INTENT_LABELS[intent] ?? intent}</span>
                  </div>
                )}
                {isSocial && (
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{SOCIAL_PLATFORM_LABELS[platformRec] ?? platformRec}</span>
                    {bestTimeToPost && (
                      <>
                        <span>·</span>
                        <span>זמן מומלץ: {bestTimeToPost}</span>
                      </>
                    )}
                  </div>
                )}
                {isSales && (
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>סיבת קיפאון: {SALES_STUCK_REASON_LABELS[stuckReason] ?? stuckReason}</span>
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

            {/* Original review */}
            {isReview && reviewText && (
              <div className="mb-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                <div className="mb-1 text-xs font-medium text-slate-500">
                  הביקורת המקורית:
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {reviewText}
                </p>
              </div>
            )}

            {/* Content area */}
            {isBlocked ? (
              <div
                className="mb-3 rounded-lg p-4"
                style={{
                  background: riskStyle.bg,
                  border: `1px solid ${riskStyle.border}`,
                }}
              >
                <div className="mb-2 text-sm font-semibold" style={{ color: riskStyle.text }}>
                  ⚠️ הטיוטה הזו נחסמה
                </div>
                <p className="text-sm text-slate-300">
                  {d.rejection_reason ?? "סיכון של לשון הרע."}
                </p>
                {d.defamation_flagged_phrases && d.defamation_flagged_phrases.length > 0 && (
                  <div className="mt-2 text-xs text-slate-400">
                    ביטויים שסומנו:{" "}
                    {d.defamation_flagged_phrases.map((p) => `"${p}"`).join(", ")}
                  </div>
                )}
                <details className="mt-3 text-sm text-slate-400">
                  <summary className="cursor-pointer hover:text-slate-200">
                    הצג את הטיוטה החסומה
                  </summary>
                  <div className="mt-2 whitespace-pre-wrap rounded border border-slate-700 bg-slate-950 p-3 text-slate-300">
                    {draftText}
                  </div>
                </details>
              </div>
            ) : isSocial ? (
              <div
                className="mb-3 rounded-lg p-4"
                style={{
                  background: riskStyle.bg,
                  border: `1px solid ${riskStyle.border}`,
                }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-medium text-slate-500">
                    הפוסט המוצע:
                  </div>
                  <CopyButton text={fullSocialText} label="העתק את הפוסט" />
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                  {captionHebrew}
                </p>

                {hashtags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {hashtags.map((h, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-slate-800/60 px-2 py-0.5 text-xs text-teal-300"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                )}

                {cta && (
                  <div className="mt-3 text-sm font-semibold text-teal-300">
                    👉 {cta}
                  </div>
                )}

                {suggestedImagePrompt && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-200">
                      💡 הצעת תמונה לפוסט
                    </summary>
                    <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                      {suggestedImagePrompt}
                    </p>
                  </details>
                )}

                {rationaleShort && (
                  <div className="mt-3 border-t border-slate-700/50 pt-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-400">למה זה? </span>
                    {rationaleShort}
                  </div>
                )}
              </div>
            ) : isSales ? (
              <div
                className="mb-3 rounded-lg p-4"
                style={{
                  background: riskStyle.bg,
                  border: `1px solid ${riskStyle.border}`,
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-slate-500">
                    ההודעה המוצעת:
                  </div>
                  <div className="flex gap-2">
                    {whatsappUrl && (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-emerald-500 px-2 py-1 text-xs font-semibold text-slate-900 transition-all hover:bg-emerald-400"
                      >
                        💬 פתח בוואטסאפ
                      </a>
                    )}
                    <CopyButton text={fullSalesText} label="העתק" />
                  </div>
                </div>

                {subjectLine && (
                  <div className="mb-2 rounded border border-slate-700 bg-slate-950/50 p-2">
                    <div className="text-xs text-slate-500">נושא המייל:</div>
                    <div className="text-sm font-semibold text-slate-200">
                      {subjectLine}
                    </div>
                  </div>
                )}

                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                  {messageHebrew}
                </p>

                {sendWindow && (
                  <div className="mt-3 text-xs text-slate-400">
                    ⏰ {sendWindow}
                  </div>
                )}

                {rationaleShort && (
                  <div className="mt-3 border-t border-slate-700/50 pt-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-400">למה זה? </span>
                    {rationaleShort}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="mb-3 rounded-lg p-4"
                style={{
                  background: riskStyle.bg,
                  border: `1px solid ${riskStyle.border}`,
                }}
              >
                <div className="mb-1 text-xs font-medium text-slate-500">
                  הטיוטה המוצעת:
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                  {draftText}
                </p>
                {rationale && (
                  <div className="mt-3 border-t border-slate-700/50 pt-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-400">למה זה? </span>
                    {rationale}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-slate-700 pt-3">
              <div className="text-xs text-slate-500">
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
                    className="rounded-lg bg-teal-500 px-4 py-1.5 text-sm font-semibold text-slate-900 transition-all hover:bg-teal-400 disabled:opacity-50"
                  >
                    {isPending && actioningId === d.id
                      ? "..."
                      : isSales
                      ? "✓ שלחתי"
                      : isSocial
                      ? "✓ אושר"
                      : "✓ אשר ושלח"}
                  </button>
                )}
                <button
                  onClick={() => handleReject(d.id)}
                  disabled={isPending && actioningId === d.id}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-1.5 text-sm font-medium text-slate-300 transition-all hover:bg-slate-700 disabled:opacity-50"
                >
                  {isPending && actioningId === d.id ? "..." : "✕ דחה"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
