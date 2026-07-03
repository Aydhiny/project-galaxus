import type { NextConfig } from "next";

// A real product needs a CSP. The previous "no CSP" approach broke because
// img-src wasn't scoped to the YouTube/GitHub-chart hosts already allow-listed
// below for next/image — this version allow-lists them explicitly instead of
// dropping CSP entirely. 'unsafe-inline' is used for script/style-src because
// this app relies heavily on inline style={{}} (mouse-tracking glow effects)
// and Next's inline hydration data/service-worker-register script — a
// nonce-based strict CSP would need per-request nonce plumbing that isn't
// worth the complexity here. 'unsafe-eval' is dev-only, for Turbopack HMR.
const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img.youtube.com https://i.ytimg.com https://ghchart.rshah.org https://*.public.blob.vercel-storage.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.public.blob.vercel-storage.com https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
  "frame-src 'self' https://www.youtube-nocookie.com https://*.public.blob.vercel-storage.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "ghchart.rshah.org" },
    ],
  },
};

export default nextConfig;
