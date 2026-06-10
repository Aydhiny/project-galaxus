/**
 * Simple in-memory rate limiter for the login endpoint.
 * Limits to `maxAttempts` per IP per `windowMs`.
 *
 * Caveat: state is per-Lambda cold start on Vercel (serverless).
 * For a single-user personal app this is enough to block automated scripts
 * within a given function instance. If you need cross-instance limiting,
 * wire up @upstash/ratelimit with an Upstash Redis URL.
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000; // 1 minute

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
