import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOnboarded } from "@/lib/auth/require-onboarded";
import { isAdminEmail } from "@/lib/admin/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileHeader } from "@/components/dashboard/mobile-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { AppleBg } from "@/components/ui/apple-bg";
import { Glass } from "@/components/ui/glass";
import { ApprovalsList } from "@/components/dashboard/approvals-list";
import { Mascot } from "@/components/ui/mascot";
import { listPendingDrafts } from "@/app/dashboard/actions";
import { Inbox, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  // Block access if user hasn't completed onboarding yet.
  const { tenantId } = await requireOnboarded();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userEmail = user.email ?? "";

  // Load tenant identity for sidebar profile section.
  const adminDb = createAdminClient();
  const { data: tenantRow } = await adminDb
    .from("tenants")
    .select("name, config")
    .eq("id", tenantId)
    .maybeSingle();

  const tenantConfig =
    (tenantRow?.config as Record<string, unknown> | null) ?? {};
  const ownerName =
    typeof tenantConfig.owner_name === "string"
      ? tenantConfig.owner_name
      : null;
  const businessName =
    typeof tenantConfig.business_name === "string"
      ? tenantConfig.business_name
      : (tenantRow?.name as string | undefined) ?? null;

  // Load pending drafts.
  const draftsResult = await listPendingDrafts();

  const allDrafts = draftsResult.success ? draftsResult.drafts ?? [] : [];
  const pendingDrafts = allDrafts.filter((d) => d.status === "pending");
  const pendingCount = pendingDrafts.length;

  // Counts by type — for the header summary
  const counts = {
    review: pendingDrafts.filter((d) => d.type === "review_reply").length,
    sales: pendingDrafts.filter((d) => d.type === "sales_followup").length,
    social: pendingDrafts.filter((d) => d.type === "social_post").length,
  };

  const summaryParts: string[] = [];
  if (counts.sales > 0) summaryParts.push(`${counts.sales} מכירה`);
  if (counts.social > 0) summaryParts.push(`${counts.social} פוסטים`);
  if (counts.review > 0) summaryParts.push(`${counts.review} ביקורות`);
  const summary =
    summaryParts.length > 0 ? summaryParts.join(" · ") : "אין טיוטות ממתינות";

  return (
    <div
      className="relative min-h-screen"
      dir="rtl"
      style={{ color: "var(--color-ink)" }}
    >
      <AppleBg />

      <Sidebar
        userEmail={userEmail}
        ownerName={ownerName}
        businessName={businessName}
        isAdmin={isAdminEmail(userEmail)}
        pendingCount={pendingCount}
      />

      {/* Mobile-only sticky header with hamburger menu */}
      <MobileHeader
        userEmail={userEmail}
        ownerName={ownerName}
        businessName={businessName}
        isAdmin={isAdminEmail(userEmail)}
        pendingCount={pendingCount}
      />

      <div className="md:mr-[232px]">
        <main className="spike-scroll mx-auto max-w-[1280px] px-4 pb-[96px] pt-5 sm:px-6 md:px-10 md:pb-20 md:pt-8">
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
                <Inbox
                  size={22}
                  strokeWidth={1.75}
                  style={{ color: "var(--color-sys-blue)" }}
                />
              </div>
              <div className="flex-1">
                <h1
                  className="text-[24px] font-semibold tracking-[-0.02em]"
                  style={{ color: "var(--color-ink)" }}
                >
                  תיבת אישורים
                </h1>
                <p
                  className="mt-0.5 text-[13px]"
                  style={{ color: "var(--color-ink-3)" }}
                >
                  {pendingCount > 0
                    ? `${pendingCount} ${pendingCount === 1 ? "טיוטה ממתינה" : "טיוטות ממתינות"} · ${summary}`
                    : "אין טיוטות ממתינות לאישור"}
                </p>
              </div>
            </div>
          </div>

          {/* Body — empty state OR the list */}
          {pendingCount === 0 ? (
            <Glass className="p-10 text-center">
              <div className="flex justify-center">
                <Mascot pose="phone-right" size={140} />
              </div>
              <h2
                className="mb-1 mt-3 text-[18px] font-semibold tracking-[-0.01em]"
                style={{ color: "var(--color-ink)" }}
              >
                הכל מאושר ✨
              </h2>
              <p
                className="mx-auto max-w-[400px] text-[13px] leading-relaxed"
                style={{ color: "var(--color-ink-2)" }}
              >
                אין טיוטות שממתינות לאישור כרגע. הסוכנים יוסיפו טיוטות חדשות
                לכאן בריצה הבאה שלהם.
              </p>
            </Glass>
          ) : (
            <ApprovalsList drafts={pendingDrafts} />
          )}
        </main>
      </div>

      {/* Mobile-only bottom navigation tabs */}
      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}
