import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const SITE_URL = "https://app.spikeai.co.il";
const SITE_NAME = "Spike AI Agents";
const SITE_TITLE = "Spike AI Agents — לוח בקרה";
const SITE_DESCRIPTION =
  "הצוות שלך של סוכני AI עובד 24/7. כאן תקבל דוחות, תאשר טיוטות, ותראה מה הסוכנים עשו עבורך.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  keywords: [
    "Spike AI",
    "סוכני AI",
    "ניהול עסק",
    "אוטומציה",
    "דשבורד",
  ],
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/spike-mascot.png", type: "image/png" },
    ],
    apple: [{ url: "/spike-mascot.png" }],
    shortcut: ["/favicon.ico"],
  },
  alternates: {
    canonical: SITE_URL,
  },
  robots: {
    index: false,
    follow: false,
  },
  category: "technology",
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#07111A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body
        className={`${heebo.variable} antialiased min-h-screen`}
        style={{ fontFamily: "var(--font-heebo)" }}
      >
        {children}
      </body>
    </html>
  );
}
