// Free-model health checks: when a provider is checked (and when that would
// waste quota), how failures add up to "unhealthy", and that unhealthy
// providers are tried last until they pass again.

import { describe, expect, it } from "vitest";
import { HEALTH_MAX_TOKENS, healthIntervalMs, healthLabel, healthSkip, nextHealthFails, type HealthKey } from "@/lib/free-health";
import { UNHEALTHY_AFTER, isUnhealthy, pickOrder } from "@/lib/free-llm";

const T = "2026-10-15";
const NOW = Date.parse("2026-10-15T12:00:00Z");
const H = 3_600_000;
const key = (o: Partial<HealthKey> = {}): HealthKey => ({
  provider: "groq", enabled: true, priority: 0, day: T, requests: 10, tokens: 0, remainingRequests: null, limitRequests: null, remainingTokens: null,
  headersAt: null, cooldownUntil: null, healthFails: 0, healthAt: null, lastOkAt: null, ...o,
});

describe("healthIntervalMs: checks never eat more than ~5% of a daily cap", () => {
  it("hourly for big caps, rarer for small ones", () => {
    expect(healthIntervalMs("groq")).toBe(H); // 1,000/day
    expect(healthIntervalMs("gemini")).toBe(H);
    expect(healthIntervalMs("mistral")).toBe(H); // no daily request cap
    expect(healthIntervalMs("cerebras")).toBe(5 * H); // 100/day → 5 checks a day
    expect(healthIntervalMs("openrouter")).toBe(10 * H); // 50/day → 2.5 checks a day
    expect(healthIntervalMs("unknown")).toBe(H);
  });
});

describe("healthSkip", () => {
  it("checks an enabled, idle provider", () => {
    expect(healthSkip(key(), T, NOW)).toBeNull();
    expect(healthSkip(key({ healthAt: new Date(NOW - H - 1) }), T, NOW)).toBeNull();
  });

  it("skips one that's off or resting", () => {
    expect(healthSkip(key({ enabled: false }), T, NOW)).toBe("off");
    expect(healthSkip(key({ cooldownUntil: new Date(NOW + 60_000) }), T, NOW)).toBe("resting");
    expect(healthSkip(key({ cooldownUntil: new Date(NOW - 1) }), T, NOW)).toBeNull(); // rest is over
  });

  it("doesn't spend the last 5% of today's quota on checks", () => {
    // Exact numbers from the provider's headers.
    const exact = (left: number) => key({ remainingRequests: left, limitRequests: 1000, headersAt: new Date(NOW - 60_000) });
    expect(healthSkip(exact(49), T, NOW)).toBe("low quota");
    expect(healthSkip(exact(50), T, NOW)).toBeNull();
    expect(healthSkip(exact(0), T, NOW)).toBe("used up");
    // Estimated: OpenRouter's 50/day, 48 used → 2 left (4%).
    expect(healthSkip(key({ provider: "openrouter", requests: 48 }), T, NOW)).toBe("low quota");
    expect(healthSkip(key({ provider: "openrouter", requests: 40 }), T, NOW)).toBeNull();
    // Yesterday's usage doesn't count today.
    expect(healthSkip(key({ provider: "openrouter", requests: 50, day: "2026-10-14" }), T, NOW)).toBeNull();
    // Token caps too: Groq's 100k tokens/day.
    expect(healthSkip(key({ tokens: 96_000 }), T, NOW)).toBe("low quota");
  });

  it("not again within the interval, nor when real work just proved it works", () => {
    expect(healthSkip(key({ healthAt: new Date(NOW - 30 * 60_000) }), T, NOW)).toBe("checked recently");
    expect(healthSkip(key({ lastOkAt: new Date(NOW - 20 * 60_000) }), T, NOW)).toBe("used recently");
    expect(healthSkip(key({ provider: "openrouter", healthAt: new Date(NOW - 5 * H) }), T, NOW)).toBe("checked recently"); // every 10 h there
  });
});

describe("failures in a row → unhealthy → tried last", () => {
  it("counts consecutive failures; a pass resets", () => {
    let n: number | undefined = undefined;
    for (let i = 0; i < UNHEALTHY_AFTER; i++) n = nextHealthFails(n, false);
    expect(n).toBe(3);
    expect(isUnhealthy({ healthFails: n })).toBe(true);
    expect(isUnhealthy({ healthFails: 2 })).toBe(false);
    expect(nextHealthFails(n, true)).toBe(0);
    expect(isUnhealthy({})).toBe(false);
  });

  it("pickOrder puts an unhealthy provider last, whatever its priority, until it passes", () => {
    const groq = key({ provider: "groq", priority: 0, healthFails: 3 });
    const gemini = key({ provider: "gemini", priority: 1 });
    const cerebras = key({ provider: "cerebras", priority: 2 });
    expect(pickOrder([groq, gemini, cerebras], T, NOW).map((k) => k.provider)).toEqual(["gemini", "cerebras", "groq"]);
    expect(pickOrder([{ ...groq, healthFails: 0 }, gemini, cerebras], T, NOW).map((k) => k.provider)).toEqual(["groq", "gemini", "cerebras"]);
    // Still usable (it's a last resort, not removed).
    expect(pickOrder([groq], T, NOW)).toHaveLength(1);
  });
});

describe("the probe and its label", () => {
  it("leaves reasoning models room to answer", () => {
    expect(HEALTH_MAX_TOKENS).toBeGreaterThanOrEqual(300);
  });
  it("labels health checks in the usage line", () => {
    expect(healthLabel(0)).toBe("");
    expect(healthLabel(1)).toBe("incl. 1 health check");
    expect(healthLabel(4)).toBe("incl. 4 health checks");
  });
});
