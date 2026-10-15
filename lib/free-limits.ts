// Free-model failures, read honestly. A 429 means "slow down", not "broken";
// a missing model means "try another model", not "broken". Only a bad key, or a
// provider where no model works, is broken. These pure rules feed the health
// checks (lib/services/free-health.ts), the router's spacing between calls
// (lib/services/free-spacing.ts) and what the Free models dialog says per
// provider. Tested in free-limits.test.ts.

import { freeProvider, modelTrouble } from "@/lib/free-llm";

export type FailureKind = "rate" | "missing" | "busy" | "broken";

/** Why a call failed: rate limit / quota, a missing model, a busy model, or a real problem (key, server). */
export function classifyFailure(status: number, body: string): FailureKind {
  if (status === 429 || status === 402) return "rate"; // whatever the body says, the provider asked us to slow down
  const trouble = modelTrouble(status, body);
  if (trouble) return trouble;
  if (/rate.?limit|too many requests|quota|per day|daily limit|credits/i.test(body)) return "rate";
  return "broken";
}

/** Our saved lastError looks like "HTTP 429 (model): body" — classify it the same way (null = no error). */
export function classifyError(lastError: string | null | undefined): FailureKind | null {
  if (!lastError) return null;
  const status = Number(lastError.match(/HTTP (\d{3})/)?.[1] ?? 0);
  return classifyFailure(status, lastError);
}

/** A failure we write when NO model on a provider works: a real fail, never healed away. */
export const NO_MODEL_WORKS = "No model works";

/**
 * Old rows marked unhealthy because of a rate limit or a missing model (before
 * the health checks knew better): their failure count should be wiped.
 */
export function healable(lastError: string | null | undefined) {
  if (!lastError || lastError.startsWith(NO_MODEL_WORKS)) return false;
  const kind = classifyError(lastError);
  return kind === "rate" || kind === "missing" || kind === "busy";
}

export type HealthOutcome = "pass" | "rate" | "busy" | "fail";

/**
 * One health check, from the attempts it made (one per model tried, in order):
 * any success passes; a rate limit just rests (it says nothing about health);
 * busy models rest too; only a bad key, a server error, or every model missing fails.
 */
export function healthOutcome(attempts: { ok: boolean; status: number; body: string }[]): HealthOutcome {
  if (!attempts.length) return "rate"; // never got to ask (spacing): not a verdict
  if (attempts.some((a) => a.ok)) return "pass";
  const kinds = attempts.map((a) => classifyFailure(a.status, a.body));
  if (kinds.includes("broken")) return "fail";
  if (kinds.includes("rate")) return "rate";
  if (kinds.includes("busy")) return "busy";
  return "fail"; // every model missing
}

/** Failures in a row after a check: a pass resets, a fail adds one, a rest (rate/busy) changes nothing. */
export const healthFailsAfter = (prev: number | null | undefined, o: HealthOutcome) => (o === "pass" ? 0 : o === "fail" ? (prev ?? 0) + 1 : prev ?? 0);

// ─── Spacing: providers with tight per-second limits ──────────────────────────

/** The minimum gap between two calls to one provider (Mistral's free tier is ~1 request/second). */
export function minGapMs(provider: string) {
  return freeProvider(provider)?.gapMs ?? 0;
}

/** The earliest time the next call may go out: right now, or one gap after the last call. */
export function nextSlot(lastCallAt: Date | string | null | undefined, gapMs: number, now: number) {
  if (!gapMs || !lastCallAt) return now;
  return Math.max(now, new Date(lastCallAt).getTime() + gapMs);
}

/** Spacing is worth waiting for only briefly: past this, move on to another provider. */
export const MAX_SPACING_WAIT_MS = 8_000;

// ─── What the Free models dialog says per provider ───────────────────────────

export type FreeVerdict =
  | { kind: "off" }
  | { kind: "untested" }
  | { kind: "working" }
  | { kind: "switched"; model: string; from: string }
  | { kind: "resting"; until: Date; why: "rate limit" | "model busy" | "error" }
  | { kind: "broken"; fix: "key" | "model" | "provider" };

export function freeVerdict(p: {
  enabled: boolean; cooldownUntil: Date | string | null; lastError: string | null; unhealthy: boolean;
  lastOkAt: Date | string | null; model: string; switchedFrom?: string | null;
}, now: number): FreeVerdict {
  if (!p.enabled) return { kind: "off" };
  const kind = classifyError(p.lastError);
  const status = Number(p.lastError?.match(/HTTP (\d{3})/)?.[1] ?? 0);
  const brokenKey = kind === "broken" && (status === 401 || status === 403);
  if (brokenKey || (p.unhealthy && kind === "broken")) return { kind: "broken", fix: brokenKey ? "key" : "provider" };
  if (p.unhealthy && p.lastError?.startsWith(NO_MODEL_WORKS)) return { kind: "broken", fix: "model" };
  const until = p.cooldownUntil ? new Date(p.cooldownUntil) : null;
  if (until && until.getTime() > now) return { kind: "resting", until, why: kind === "rate" ? "rate limit" : kind === "busy" ? "model busy" : "error" };
  if (p.switchedFrom && p.switchedFrom !== p.model) return { kind: "switched", model: p.model, from: p.switchedFrom };
  if (p.lastOkAt) return { kind: "working" };
  return { kind: "untested" };
}
