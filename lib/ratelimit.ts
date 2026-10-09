/**
 * Simple in-memory fixed-window rate limiter.
 *
 * Callers pass a namespaced key ("login:<ip>:<email>", "register:<ip>", …).
 * Before, every endpoint shared one bucket per IP — registering and then
 * logging in counted against the same 5 attempts.
 *
 * Caveat: state is per serverless instance on Vercel, so this slows down
 * scripted attacks within an instance rather than guaranteeing a global
 * limit. For a hard cross-instance limit, back this with Upstash Redis.
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000; // 1 minute
const MAX_KEYS = 10_000;

function prune(now: number) {
  // Expired entries were never removed before, so the map grew for the life
  // of the instance. Sweep only when it gets big, to keep the hot path O(1).
  if (store.size < MAX_KEYS) return;
  for (const [k, e] of store) if (now > e.resetAt) store.delete(k);
}

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  prune(now);
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Clear a key's attempts (e.g. after a successful login). */
export function resetRateLimit(key: string) {
  store.delete(key);
}
