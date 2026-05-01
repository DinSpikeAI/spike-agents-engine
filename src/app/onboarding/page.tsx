import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppleBg } from "@/components/ui/apple-bg";
import { Glass } from "@/components/ui/glass";
import { Mascot } from "@/components/ui/mascot";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Resolve the user's active tenant (same pattern the dashboard uses).
  const { data: settings } = await supabase
    .from("user_settings")
    .select("active_tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let tenantId: string | null = null;
  if (settings?.active_tenant_id) {
    tenantId = settings.active_tenant_id as string;
  } else {
    const { data: membership } = await supabase
      .from("memberships")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    tenantId = (membership?.tenant_id as string | undefined) ?? null;
  }

  if (!tenantId) {
    // No tenant assigned. Send to error page rather than loop forever.
    redirect("/auth/error?reason=no_tenant");
  }

  // If onboarding already done, skip straight to the dashboard.
  const adminDb = createAdminClient();
  const { data: tenant } = await adminDb
    .from("tenants")
    .select("config")
    .eq("id", tenantId)
    .maybeSingle();

  const config = (tenant?.config ?? {}) as Record<string, unknown>;
  if (typeof config.onboarding_completed_at === "string") {
    redirect("/dashboard");
  }

  return (
    <div
      className="relative min-h-screen"
      dir="rtl"
      style={{ color: "var(--color-ink)" }}
    >
      <AppleBg />

      <main className="mx-auto flex min-h-screen max-w-[560px] items-center justify-center px-6 py-12">
        <div className="relative w-full">
          {/* Spike mascot — peeks above the form */}
          <div
            className="absolute -top-[64px] left-1/2 z-10"
            style={{ transform: "translateX(-50%)" }}
          >
            <div className="relative">
              <Mascot pose="phone-left" size={128} />

              {/* Soft glow halo */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(184,206,255,0.55), rgba(184,206,255,0) 70%)",
                  transform: "scale(1.6)",
                }}
              />
            </div>
          </div>

          <Glass className="w-full p-7 pt-12">
            <div className="mb-6 text-center">
              <h1
                className="text-[22px] font-semibold tracking-[-0.01em]"
                style={{ color: "var(--color-ink)" }}
              >
                ברוך הבא ל-Spike Engine
              </h1>
              <p
                className="mx-auto mt-2 max-w-[420px] text-[13.5px] leading-[1.55]"
                style={{ color: "var(--color-ink-2)" }}
              >
                ארבעה פרטים בלבד לפני שנתחיל. הסוכנים ישתמשו בהם כדי לפנות
                אליך ולעסק שלך באופן מותאם.
              </p>
            </div>

            <OnboardingForm />
          </Glass>
        </div>
      </main>
    </div>
  );
}
