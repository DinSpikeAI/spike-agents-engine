import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  // ── Security: verify this came from Vercel Cron ──────────
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[reset-monthly-spend] Unauthorized call — bad or missing CRON_SECRET");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createAdminClient();

    const { data, error } = await db.rpc("reset_monthly_spend");

    if (error) {
      console.error("[reset-monthly-spend] RPC failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const tenantsReset = data as number;
    console.log(`[reset-monthly-spend] Done. Tenants reset: ${tenantsReset}`);

    return NextResponse.json({
      ok: true,
      tenantsReset,
      resetAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[reset-monthly-spend] Exception:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
