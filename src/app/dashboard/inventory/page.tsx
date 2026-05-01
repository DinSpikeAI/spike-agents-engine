import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireOnboarded } from "@/lib/auth/require-onboarded";
import { isAdminEmail } from "@/lib/admin/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { AppleBg } from "@/components/ui/apple-bg";
import { Glass } from "@/components/ui/glass";
import { InventoryResultsCard } from "@/components/dashboard/inventory-results-card";
import { RunInventoryButton } from "@/components/dashboard/run-inventory-button";
import { InventoryUploadZone } from "@/components/dashboard/inventory-upload-zone";
import {
  listPendingDrafts,
  getLatestInventorySnapshot,
  getLatestInventoryAnalysis,
} from "@/app/dashboard/actions";
import type { InventoryAgentOutput } from "@/lib/agents/types";
import { FileText, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function InventoryPage() {
  // Block access if user hasn't completed onboarding yet.
  await requireOnboarded();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userEmail = user.email ?? "";

  const [draftsResult, snapshotResult, analysisResult] = await Promise.all([
    listPendingDrafts(),
    getLatestInventorySnapshot(),
    getLatestInventoryAnalysis(),
  ]);

  const pendingCount = draftsResult.success
    ? draftsResult.drafts?.filter((d) => d.status === "pending").length ?? 0
    : 0;

  const snapshot =
    snapshotResult.success && snapshotResult.snapshot
      ? snapshotResult.snapshot
      : null;

  const analysis =
    analysisResult.success && analysisResult.analysis
      ? (analysisResult.analysis as unknown as InventoryAgentOutput)
      : null;
  const analyzedAt = analysisResult.success
    ? analysisResult.analyzedAt ?? null
    : null;
  const isMocked = analysisResult.success
    ? analysisResult.isMocked ?? false
    : false;

  return (
    <div
      className="relative min-h-screen"
      dir="rtl"
      style={{ color: "var(--color-ink)" }}
    >
      <AppleBg />

      <Sidebar
        userEmail={userEmail}
        isAdmin={isAdminEmail(userEmail)}
        pendingCount={pendingCount}
      />

      <div className="md:mr-[232px]">
        <main className="spike-scroll mx-auto max-w-[1280px] px-6 pb-20 pt-8 md:px-10">
          {/* Page header */}
          <div className="mb-7">
            <div className="mb-2 flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-[12px] text-[22px]"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(245,247,252,0.7))",
                  border: "1px solid rgba(255,255,255,0.9)",
                  boxShadow:
                    "0 4px 12px rgba(15,20,30,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
                }}
              >
                📦
              </div>
              <div className="flex flex-1 items-center gap-2">
                <h1
                  className="text-[24px] font-semibold tracking-[-0.02em]"
                  style={{ color: "var(--color-ink)" }}
                >
                  סוכן מלאי
                </h1>
                {isMocked && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                    style={{
                      background: "rgba(224, 169, 61, 0.12)",
                      color: "var(--color-sys-amber)",
                    }}
                    title="הסוכן רץ עם נתוני הדגמה. אינטגרציות אמיתיות יחוברו בהמשך."
                  >
                    הדגמה
                  </span>
                )}
              </div>
            </div>
            <p
              className="text-[13.5px] leading-[1.55]"
              style={{ color: "var(--color-ink-2)" }}
            >
              העלה קובץ CSV מהקופה או ממערכת המלאי. הסוכן יחשב ימי כיסוי לכל
              מוצר, יסמן את מה שדורש תשומת לב, ויכין תובנה קצרה לכל פריט.
            </p>
          </div>

          {/* Snapshot status panel — only when a CSV is loaded */}
          {snapshot && (
            <Glass className="mb-5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div
                    className="flex items-center gap-2 text-[14.5px] font-semibold"
                    style={{ color: "var(--color-ink)" }}
                  >
                    <FileText
                      size={14}
                      strokeWidth={1.75}
                      style={{ color: "var(--color-ink-2)" }}
                    />
                    <span className="truncate">{snapshot.source_filename}</span>
                  </div>
                  <div
                    className="mt-0.5 text-[11.5px]"
                    style={{ color: "var(--color-ink-3)" }}
                  >
                    {snapshot.row_count}{" "}
                    {snapshot.row_count === 1 ? "מוצר" : "מוצרים"} · הועלה{" "}
                    {formatDate(snapshot.uploaded_at)}
                    {snapshot.last_analyzed_at && (
                      <> · נותח לאחרונה {formatDate(snapshot.last_analyzed_at)}</>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <RunInventoryButton />
                </div>
              </div>
            </Glass>
          )}

          {/* Results card — when an analysis exists */}
          {analysis && analyzedAt ? (
            <div className="mb-6">
              <InventoryResultsCard
                analysis={analysis}
                analyzedAt={analyzedAt}
              />
            </div>
          ) : snapshot ? (
            <Glass className="mb-6 p-8 text-center">
              <AlertCircle
                size={20}
                strokeWidth={1.5}
                className="mx-auto mb-2"
                style={{ color: "var(--color-ink-3)" }}
              />
              <div
                className="text-[14px] font-semibold"
                style={{ color: "var(--color-ink)" }}
              >
                הקובץ נטען אבל לא נותח עדיין
              </div>
              <div
                className="mt-1 text-[12.5px]"
                style={{ color: "var(--color-ink-3)" }}
              >
                לחץ "הרץ עכשיו" למעלה כדי שהסוכן ינתח את המלאי.
              </div>
            </Glass>
          ) : null}

          {/* Upload zone — always available; primary CTA when no snapshot */}
          <Glass className="p-5">
            <InventoryUploadZone hasSnapshot={!!snapshot} />
          </Glass>
        </main>
      </div>
    </div>
  );
}
