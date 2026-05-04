// src/components/dashboard/inventory-upload-zone.tsx
//
// Sub-stage 1.12 fixes (was 1.11+):
//   1. Race guards on onDrop and onChange — was an in-file race where dropping
//      a second file during in-progress upload fired a parallel startTransition
//      with stale isPending=false, leaving two snapshots in the DB and the UI
//      writing whichever returned last.
//   2. Sync local isPending up to the page-level context so RunInventoryButton
//      can disable itself during upload (cross-component race fix).

"use client";

import { useRef, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { uploadInventoryCsv } from "@/app/dashboard/actions";
import { useInventoryAction } from "@/components/dashboard/inventory-action-context";
import {
  Upload,
  Check,
  AlertTriangle,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

interface UploadSuccess {
  filename: string;
  count: number;
  warnings: string[];
}

export function InventoryUploadZone({
  hasSnapshot = false,
}: {
  hasSnapshot?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<UploadSuccess | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { setUploadInProgress } = useInventoryAction();

  // Sub-stage 1.12: sync our local pending state up to the page context so
  // RunInventoryButton can disable itself while we're uploading. Cleanup on
  // unmount sets it back to false so a stale "true" doesn't outlive this
  // component if the user navigates away mid-upload.
  useEffect(() => {
    setUploadInProgress(isPending);
    return () => setUploadInProgress(false);
  }, [isPending, setUploadInProgress]);

  const reset = () => {
    setError(null);
    setSuccess(null);
    setShowWarnings(false);
  };

  const handleFile = (file: File) => {
    reset();

    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv")) {
      setError("יש להעלות קובץ CSV. ייצוא מאקסל: 'שמור בשם → CSV (UTF-8)'.");
      return;
    }
    if (file.size === 0) {
      setError("הקובץ ריק.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("הקובץ גדול מ-5MB. נסה לחלק לקבצים קטנים יותר.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      if (!text.trim()) {
        setError("לא ניתן לקרוא את תוכן הקובץ.");
        return;
      }
      startTransition(async () => {
        const res = await uploadInventoryCsv(text, file.name);
        if (res.success) {
          setSuccess({
            filename: file.name,
            count: res.productCount ?? 0,
            warnings: res.warnings ?? [],
          });
          // Refresh server data so the snapshot panel + run button render
          router.refresh();
        } else {
          setError(res.error ?? "שגיאה בהעלאת הקובץ");
        }
      });
    };
    reader.onerror = () => {
      setError("לא ניתן לקרוא את הקובץ. ודא שהוא לא פתוח בתוכנה אחרת.");
    };
    // UTF-8 covers Hebrew. Backend strips BOM if present.
    reader.readAsText(file, "utf-8");
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Sub-stage 1.12 race guard — defensive. The onClick handler already
    // gates fileInputRef.current?.click() on !isPending so the picker
    // shouldn't open during upload, but if a previous picker session was
    // already open when isPending became true the user could still pick
    // a file and trigger onChange. Belt and suspenders.
    if (isPending) {
      e.target.value = "";
      return;
    }
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Allow re-uploading the same filename
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    // Sub-stage 1.12 race guard — primary fix. Without this, a drop during
    // in-progress upload fired a parallel startTransition with the OLD
    // closure's stale isPending=false, leaving two snapshots in the DB.
    if (isPending) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onClick = () => {
    if (!isPending) fileInputRef.current?.click();
  };

  const dropZoneStyle: React.CSSProperties = {
    background: isDragging
      ? "rgba(10, 132, 255, 0.06)"
      : "rgba(255,255,255,0.4)",
    border: isDragging
      ? "2px dashed var(--color-sys-blue)"
      : "2px dashed var(--color-hairline)",
    transition: "background 150ms ease, border-color 150ms ease",
  };

  return (
    <div>
      <h2
        className="mb-1 text-[15.5px] font-semibold tracking-tight"
        style={{ color: "var(--color-ink)" }}
      >
        {hasSnapshot ? "החלף קובץ מלאי" : "העלה קובץ מלאי"}
      </h2>
      <p
        className="mb-3 text-[12.5px] leading-[1.55]"
        style={{ color: "var(--color-ink-2)" }}
      >
        ייצוא CSV מהקופה / מערכת המלאי. הקובץ צריך לכלול לפחות שם מוצר, כמות
        במלאי ונמכר ב-30 יום. עברית או אנגלית.
      </p>

      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className="flex cursor-pointer flex-col items-center justify-center rounded-[14px] px-6 py-10 text-center"
        style={dropZoneStyle}
        aria-label="אזור העלאה — לחץ או גרור קובץ"
        aria-disabled={isPending}
      >
        {isPending ? (
          <>
            <span
              className="mb-2 inline-block h-5 w-5 rounded-full border-2 border-t-transparent"
              style={{
                borderColor: "var(--color-sys-blue)",
                borderTopColor: "transparent",
                animation: "spin 0.8s linear infinite",
              }}
              aria-hidden="true"
            />
            <div
              className="text-[13px] font-medium"
              style={{ color: "var(--color-sys-blue)" }}
            >
              מעלה ומנתח את הקובץ...
            </div>
          </>
        ) : (
          <>
            <Upload
              size={22}
              strokeWidth={1.5}
              style={{
                color: isDragging
                  ? "var(--color-sys-blue)"
                  : "var(--color-ink-3)",
              }}
              className="mb-2"
            />
            <div
              className="text-[13.5px] font-semibold"
              style={{ color: "var(--color-ink)" }}
            >
              גרור קובץ CSV לכאן או לחץ לבחירה
            </div>
            <div
              className="mt-1 text-[11.5px]"
              style={{ color: "var(--color-ink-3)" }}
            >
              עד 5MB · UTF-8
            </div>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onChange}
        className="hidden"
        aria-hidden="true"
      />

      {success && (
        <div
          className="mt-3 rounded-[10px] px-3 py-2.5 text-[12.5px]"
          style={{
            background: "var(--color-sys-green-soft)",
            border: "1px solid rgba(48, 179, 107, 0.25)",
            color: "var(--color-sys-green)",
          }}
        >
          <div className="flex items-start gap-2">
            <Check
              size={14}
              strokeWidth={2}
              className="mt-0.5 flex-shrink-0"
            />
            <div className="flex-1">
              <div>
                <span className="font-semibold">{success.count}</span>{" "}
                {success.count === 1 ? "מוצר נטען" : "מוצרים נטענו"} מ-
                <FileText
                  size={11}
                  strokeWidth={2}
                  className="mx-0.5 inline-block"
                />
                <span className="font-medium">{success.filename}</span>
              </div>
              {success.warnings.length > 0 && (
                <div className="mt-1.5">
                  <button
                    type="button"
                    onClick={() => setShowWarnings((s) => !s)}
                    className="inline-flex items-center gap-1 text-[11.5px] underline-offset-2 hover:underline"
                    style={{ color: "var(--color-sys-amber)" }}
                  >
                    {success.warnings.length}{" "}
                    {success.warnings.length === 1 ? "אזהרה" : "אזהרות"}
                    {showWarnings ? (
                      <ChevronUp size={11} strokeWidth={2} />
                    ) : (
                      <ChevronDown size={11} strokeWidth={2} />
                    )}
                  </button>
                  {showWarnings && (
                    <ul
                      className="mt-2 space-y-1 rounded-md p-2 text-[11.5px]"
                      style={{
                        background: "rgba(255,255,255,0.6)",
                        color: "var(--color-ink-2)",
                      }}
                    >
                      {success.warnings.slice(0, 10).map((w, idx) => (
                        <li key={idx}>· {w}</li>
                      ))}
                      {success.warnings.length > 10 && (
                        <li
                          className="pt-1"
                          style={{ color: "var(--color-ink-3)" }}
                        >
                          ועוד {success.warnings.length - 10}...
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          className="mt-3 flex items-start gap-2 rounded-[10px] px-3 py-2 text-[12.5px]"
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

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
