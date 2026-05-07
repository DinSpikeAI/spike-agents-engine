// src/app/layout.tsx
//
// Root layout for Spike Engine. Server Component (loads fonts, sets metadata).
//
// RTL strategy:
//   1. <html lang="he" dir="rtl"> — base RTL for the document tree
//   2. <DirectionProvider> (client wrapper) — Radix portal components
//      (Dialog, Popover, DropdownMenu, Select, Tooltip) inherit RTL.
//   3. <LegalFooter /> + <CookieBanner /> at the end of <body>.

import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { DirectionProvider } from "@/components/providers/direction-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import CookieBanner from "@/components/legal/CookieBanner";
import LegalFooter from "@/components/legal/LegalFooter";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spike Engine",
  description: "9 סוכני AI שעובדים בשבילך מאחורי הקלעים",
  openGraph: {
    title: "Spike — סוכני AI לעסק שלך",
    description: "הצוות שלך של 9 סוכני AI עובד 24/7. אתה רק מאשר.",
    locale: "he_IL",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} dark`}>
      <body className="antialiased">
        <DirectionProvider>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </DirectionProvider>
        <Toaster richColors position="top-center" dir="rtl" />
        <LegalFooter />
        <CookieBanner />
      </body>
    </html>
  );
}