/**
 * Only same-origin relative paths are allowed as post-login destinations.
 * Anything else ("https://evil.com", "//evil.com", "/\evil.com") would turn
 * the login page into an open redirect usable in phishing links.
 */
export function safeCallbackUrl(raw: string | null | undefined, origin: string, fallback = "/overview"): string {
  if (!raw) return fallback;
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return fallback;
    if (url.pathname === "/login" || url.pathname === "/register") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
