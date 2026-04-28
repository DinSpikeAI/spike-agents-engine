// src/app/auth/error/page.tsx
//
// Friendly Hebrew error page if auth callback fails.

import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "שגיאת התחברות — Spike",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  const reason = params.reason || "unknown";

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4">משהו השתבש</h1>
        <p className="text-muted-foreground mb-2">
          לא הצלחנו לחבר אותך. ייתכן שהקישור פג תוקף או נלחץ כבר פעם.
        </p>
        <p className="text-xs text-muted-foreground mb-6">
          קוד שגיאה: <code className="text-foreground">{reason}</code>
        </p>
        <Link href="/login">
          <Button>נסה להתחבר שוב</Button>
        </Link>
      </div>
    </main>
  );
}