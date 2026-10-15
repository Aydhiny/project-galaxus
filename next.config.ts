import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { ENFORCED_CSP } from "./lib/csp";

// A real product needs a CSP. The previous "no CSP" approach broke because
// img-src wasn't scoped to the YouTube/GitHub-chart hosts already allow-listed
// below for next/image — this version allow-lists them explicitly instead of
// dropping CSP entirely. 'unsafe-inline' is used for script/style-src because
// this app relies heavily on inline style={{}} (mouse-tracking glow effects)
// and Next's inline hydration data/service-worker-register script — a
// nonce-based strict CSP would need per-request nonce plumbing that isn't
// worth the complexity here. 'unsafe-eval' is dev-only, for Turbopack HMR.
//
// The policy itself lives in lib/csp.ts. The proxy additionally sends a
// nonce-based Content-Security-Policy-Report-Only on page responses — a
// dry run of a strict policy (see lib/csp.ts and SECURITY_REVIEW.md).
const csp = ENFORCED_CSP;

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // microphone=(self): the voice panel records/transcribes in the browser (microphone=() blocked it).
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
    {
      // The service worker must never be HTTP-cached, or phones keep running
      // an old worker for up to a day after a deploy.
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
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

export default withSentryConfig(nextConfig, {
  silent: true,
  // No org/project/authToken set — source-map upload to Sentry is skipped
  // until SENTRY_AUTH_TOKEN is provided. Error reporting itself only needs
  // NEXT_PUBLIC_SENTRY_DSN (see instrumentation.ts / instrumentation-client.ts).
  widenClientFileUpload: false,
});
