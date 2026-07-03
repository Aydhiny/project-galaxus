import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

const dmSans = DM_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["300","400","500","600"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-heading", subsets: ["latin"],
  weight: ["500","600","700","800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — Your Personal Growth Universe`, template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Galaxus" },
  icons: { apple: "/icons/icon-192.png" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Your Personal Growth Universe`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Your Personal Growth Universe`,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#1a0e06",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${geistMono.variable} ${plusJakarta.variable} h-full`} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      {/* suppressHydrationWarning: next-themes injects a script that changes className before hydration */}
      <body suppressHydrationWarning className="min-h-full flex flex-col antialiased bg-background text-foreground">
        <Providers>
          {children}
          <Toaster richColors theme="system" />
        </Providers>
        <Analytics />
        <SpeedInsights />
        {/* Register service worker */}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
          }
        `}</Script>
      </body>
    </html>
  );
}
