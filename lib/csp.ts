// Content-Security-Policy, in one place (imported by next.config.ts and the
// auth proxy, so it must stay dependency-free and edge-safe).
//
// Two policies are sent:
//  • ENFORCED_CSP — next.config.ts headers, every response. Scripts are allowed
//    with 'unsafe-inline' (what the app has always run with), so it limits where
//    things load from but does NOT stop an injected inline <script>.
//  • reportOnlyCsp(nonce) — page responses only, set by the proxy (auth.config.ts).
//    The same policy with a per-request nonce + 'strict-dynamic' instead of
//    'unsafe-inline' for scripts. Browsers enforce nothing from it; they only log
//    (DevTools console) what it WOULD block. When the console stays clean on every
//    page, it can replace the enforced one (see SECURITY_REVIEW.md).
//
// style-src keeps 'unsafe-inline' in both: the app uses many style={{}}
// attributes, which nonces can't cover.

const isDev = process.env.NODE_ENV === "development";

const ANALYTICS = "https://va.vercel-scripts.com";

const REST = [
  "style-src 'self' 'unsafe-inline'",
  // News/gig images are hotlinked from many outlets (with no-referrer), so any https image host is allowed.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.aladhan.com https://*.public.blob.vercel-storage.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://*.sentry.io",
  "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
  "frame-src 'self' https://www.youtube-nocookie.com https://*.public.blob.vercel-storage.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  // Never on localhost: dev runs over plain http.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
];

const build = (script: string) => ["default-src 'self'", `script-src ${script}${isDev ? " 'unsafe-eval'" : ""}`, ...REST].join("; ");

export const ENFORCED_CSP = build(`'self' 'unsafe-inline' ${ANALYTICS}`);

export function reportOnlyCsp(nonce: string) {
  return build(`'self' 'nonce-${nonce}' 'strict-dynamic' ${ANALYTICS}`);
}
