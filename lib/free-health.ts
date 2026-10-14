// Free-model health checks: once an hour each free provider gets one tiny
// request, so "left today" and "resting" are true BEFORE a mission needs them
// (instead of a mission discovering a dead key). Pure rules, tested in
// free-health.test.ts; lib/services/free-health.ts sends the requests.
//
// Checks spend real quota, so they are rationed: never on a resting provider,
// never when under 5% of today's quota is left, and never more than ~5% of a
// provider's daily cap (OpenRouter's 50/day gets a check every ~10 hours, Groq's
// 1,000/day every hour). A provider that real work used successfully within the
// interval needs no check: it just proved itself.

import { freeProvider, remainingToday, type FreeKeyState } from "@/lib/free-llm";

export const HEALTH_PROMPT = { system: "Reply with exactly: ok", prompt: "Say ok." };
/** Room to answer: reasoning models (gpt-oss, nemotron…) think before they speak, and a tiny cap leaves them with nothing. */
export const HEALTH_MAX_TOKENS = 300;
export const HEALTH_TIMEOUT_MS = 20_000;
const HOUR = 3_600_000;
const LOW_SHARE = 0.05; // under 5% left today: don't spend it on checks
const CHECK_SHARE = 0.05; // checks may use at most ~5% of a provider's daily cap

/** How often this provider may be checked: hourly, or less often if its daily cap is small. */
export function healthIntervalMs(provider: string) {
  const rpd = freeProvider(provider)?.limits.rpd ?? null;
  if (rpd == null) return HOUR;
  const perDay = Math.max(1, rpd * CHECK_SHARE);
  return Math.min(24 * HOUR, Math.max(HOUR, Math.ceil(24 / perDay) * HOUR));
}

export type HealthKey = FreeKeyState & { healthAt?: Date | string | null; lastOkAt?: Date | string | null };
export type HealthSkip = "off" | "resting" | "used up" | "low quota" | "checked recently" | "used recently";

/** Should this provider be checked now? `null` = yes; otherwise why not. */
export function healthSkip(k: HealthKey, today: string, now = Date.now()): HealthSkip | null {
  if (!k.enabled) return "off";
  if (k.cooldownUntil && new Date(k.cooldownUntil).getTime() > now) return "resting";
  const r = remainingToday(k, today, now);
  if (r.requests != null && r.requests <= 0) return "used up";
  if (r.requests != null && r.limit && r.requests < r.limit * LOW_SHARE) return "low quota";
  const tpd = freeProvider(k.provider)?.limits.tpd;
  if (tpd != null && r.usedTokens >= tpd * (1 - LOW_SHARE)) return "low quota";
  const every = healthIntervalMs(k.provider);
  if (k.healthAt && now - new Date(k.healthAt).getTime() < every) return "checked recently";
  if (k.lastOkAt && now - new Date(k.lastOkAt).getTime() < every) return "used recently";
  return null;
}

/** Failures in a row after a check: a pass resets it, a fail adds one. */
export const nextHealthFails = (prev: number | null | undefined, ok: boolean) => (ok ? 0 : (prev ?? 0) + 1);

/** "1 health check" / "3 health checks", for the "used today" line. */
export const healthLabel = (n: number) => (n > 0 ? `incl. ${n} health check${n === 1 ? "" : "s"}` : "");
