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

// Must match scripts/generate-icons.mjs (which writes the PNGs).
const SPLASHES = [
  { w: 1320, h: 2868, dw: 440, dh: 956, dpr: 3 },
  { w: 1206, h: 2622, dw: 402, dh: 874, dpr: 3 },
  { w: 1290, h: 2796, dw: 430, dh: 932, dpr: 3 },
  { w: 1179, h: 2556, dw: 393, dh: 852, dpr: 3 },
  { w: 1284, h: 2778, dw: 428, dh: 926, dpr: 3 },
  { w: 1170, h: 2532, dw: 390, dh: 844, dpr: 3 },
  { w: 1125, h: 2436, dw: 375, dh: 812, dpr: 3 },
  { w: 1242, h: 2688, dw: 414, dh: 896, dpr: 3 },
  { w: 828, h: 1792, dw: 414, dh: 896, dpr: 2 },
  { w: 750, h: 1334, dw: 375, dh: 667, dpr: 2 },
];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — Your Personal Growth Universe`, template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    // "default" (not black-translucent): translucent forces white status-bar
    // text, which disappears on the light theme's off-white background.
    statusBarStyle: "default",
    title: "Galaxus",
    // Size-exact launch screens — without them iOS flashes white on open.
    startupImage: SPLASHES.map((s) => ({
      url: `/splash/splash-${s.w}x${s.h}.png`,
      media: `(device-width: ${s.dw}px) and (device-height: ${s.dh}px) and (-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait)`,
    })),
  },
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#1e1f22" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${geistMono.variable} ${plusJakarta.variable} h-full`} suppressHydrationWarning>
      <head>
        {/* Next 16 emits only the standard "mobile-web-app-capable"; older iOS
            versions still need Apple's prefixed tag to open full-screen. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
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
              navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
            });
          }
        `}</Script>
      </body>
    </html>
  );
}
