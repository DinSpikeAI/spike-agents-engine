// src/app/(auth)/login/login-form.tsx
//
// Client Component. Handles the form state + invokes the Server Action.
// dir="ltr" on email input is critical — otherwise Hebrew RTL flips it.

"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { sendMagicLink } from "./actions";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email || !email.includes("@")) {
      toast.error("אנא הזן כתובת מייל תקינה");
      return;
    }

    startTransition(async () => {
      const result = await sendMagicLink(email);

      if (result.error) {
        toast.error(result.error);
      } else {
        setSent(true);
        toast.success("שלחנו לך מייל! בדוק את התיבה שלך.");
      }
    });
  }

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>📬 בדוק את המייל שלך</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            שלחנו קישור התחברות ל-<strong dir="ltr">{email}</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            אם לא רואה תוך כמה דקות, בדוק בתיקיית ה-Spam או{" "}
            <button
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
              className="text-primary hover:underline"
            >
              נסה שוב
            </button>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>התחבר</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">כתובת מייל</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              required
              className="text-left"
              autoComplete="email"
              autoFocus
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isPending || !email}
          >
            {isPending ? "שולח..." : "שלח לי קישור"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}