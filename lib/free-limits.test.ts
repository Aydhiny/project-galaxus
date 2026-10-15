// Free-model failures read honestly: a rate limit rests, a missing model tries
// another one, and only a broken key or a provider with no working model fails.
// Plus the spacing rule for providers with per-second limits.

import { describe, expect, it } from "vitest";
import {
  NO_MODEL_WORKS, classifyError, classifyFailure, freeVerdict, healable, healthFailsAfter, healthOutcome, minGapMs, nextSlot,
} from "@/lib/free-limits";
import { FREE_PROVIDERS, modelTrouble } from "@/lib/free-llm";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const fail = (status: number, body: string) => ({ ok: false, status, body });
const ok = { ok: true, status: 200, body: "" };

describe("classifyFailure", () => {
  it("a 429 or a quota is a rate limit, whatever the body says", () => {
    expect(classifyFailure(429, '{"message":"Rate limit exceeded"}')).toBe("rate");
    expect(classifyFailure(429, "This model is currently unavailable")).toBe("rate");
    expect(classifyFailure(402, "insufficient credits")).toBe("rate");
    expect(classifyFailure(400, "You exceeded your current quota")).toBe("rate");
  });
  it("a missing or unavailable model (LLM7's 400 model_unavailable too) is the model's problem", () => {
    expect(classifyFailure(400, "{\"error\":{\"message\":\"Model 'gpt-oss-20b' is currently unavailable\",\"code\":\"model_unavailable\"}}")).toBe("missing");
    expect(classifyFailure(404, '{"error":{"code":"model_not_found"}}')).toBe("missing");
    expect(modelTrouble(400, "Model 'x' is currently unavailable")).toBe("missing");
    // A 503 "UNAVAILABLE" is still a busy model, not a missing one.
    expect(classifyFailure(503, '{"error":{"status":"UNAVAILABLE"}}')).toBe("busy");
  });
  it("a bad key or a server error is broken", () => {
    expect(classifyFailure(401, "invalid api key")).toBe("broken");
    expect(classifyFailure(500, '{"error":"internal"}')).toBe("broken");
    expect(classifyFailure(0, "Health check failed: timeout")).toBe("broken");
  });
  it("reads our saved lastError the same way", () => {
    expect(classifyError("HTTP 429 (mistral-small-latest): {\"message\":\"Rate limit exceeded\"}")).toBe("rate");
    expect(classifyError("HTTP 400 (gpt-oss-20b): Model 'gpt-oss-20b' is currently unavailable, code model_unavailable")).toBe("missing");
    expect(classifyError(null)).toBeNull();
  });
});

describe("healthOutcome: only a real problem is a fail", () => {
  it("any model working passes", () => {
    expect(healthOutcome([fail(400, "model_unavailable"), ok])).toBe("pass");
  });
  it("a rate limit rests, never fails", () => {
    expect(healthOutcome([fail(429, "Rate limit exceeded")])).toBe("rate");
    expect(healthFailsAfter(2, "rate")).toBe(2); // says nothing about health: unchanged
  });
  it("every model missing is a fail; a busy one only rests", () => {
    expect(healthOutcome([fail(404, "model_not_found"), fail(400, "model_unavailable")])).toBe("fail");
    expect(healthOutcome([fail(404, "model_not_found"), fail(503, "overloaded")])).toBe("busy");
    expect(healthOutcome([fail(401, "bad key")])).toBe("fail");
  });
  it("counts: pass resets, fail adds", () => {
    expect(healthFailsAfter(3, "pass")).toBe(0);
    expect(healthFailsAfter(undefined, "fail")).toBe(1);
    expect(healthFailsAfter(1, "busy")).toBe(1);
  });
  it("heals old rows marked unhealthy by rate limits or missing models, never a real failure", () => {
    expect(healable("HTTP 429 (mistral-small-latest): Rate limit exceeded")).toBe(true);
    expect(healable("HTTP 400 (gpt-oss-20b): Model 'gpt-oss-20b' is currently unavailable, code model_unavailable")).toBe(true);
    expect(healable("HTTP 401 (x): invalid key")).toBe(false);
    expect(healable(`${NO_MODEL_WORKS} for this key (tried a, b): HTTP 404 model_not_found`)).toBe(false);
    expect(healable(null)).toBe(false);
  });
});

describe("spacing: providers with per-second limits", () => {
  it("Mistral gets a gap between calls; Groq and Gemini don't need one", () => {
    expect(minGapMs("mistral")).toBeGreaterThanOrEqual(1_000);
    expect(minGapMs("groq")).toBe(0);
    expect(minGapMs("gemini")).toBe(0);
    expect(minGapMs("unknown")).toBe(0);
  });
  it("the next slot is now, or one gap after the last call", () => {
    expect(nextSlot(null, 1500, NOW)).toBe(NOW);
    expect(nextSlot(new Date(NOW - 5_000), 1500, NOW)).toBe(NOW); // long ago: go now
    expect(nextSlot(new Date(NOW - 500), 1500, NOW)).toBe(NOW + 1000); // 0.5 s ago: wait 1 s
    expect(nextSlot(new Date(NOW + 1500), 1500, NOW)).toBe(NOW + 3000); // a slot already reserved: queue behind it
    expect(nextSlot(new Date(NOW - 100), 0, NOW)).toBe(NOW); // no gap: never wait
  });
});

describe("the catalog", () => {
  it("has current model ids (old LLM7 / Cerebras / NVIDIA ids are gone)", () => {
    const ids = (k: string) => FREE_PROVIDERS.find((p) => p.key === k)!.models.map((m) => m.id);
    expect(ids("llm7")).toContain("gpt-oss:20b");
    expect(ids("llm7")).not.toContain("gpt-oss-20b");
    expect(ids("cerebras")).toEqual(["gpt-oss-120b", "qwen-3.8-27b"]);
    expect(ids("nvidia")).not.toContain("z-ai/glm-5.2");
  });
});

describe("freeVerdict: what the dialog says per provider", () => {
  const base = { enabled: true, cooldownUntil: null, lastError: null, unhealthy: false, lastOkAt: new Date(NOW - 60_000), model: "gpt-oss:20b", switchedFrom: null };
  it("working, or not checked yet", () => {
    expect(freeVerdict(base, NOW)).toEqual({ kind: "working" });
    expect(freeVerdict({ ...base, lastOkAt: null }, NOW)).toEqual({ kind: "untested" });
    expect(freeVerdict({ ...base, enabled: false }, NOW)).toEqual({ kind: "off" });
  });
  it("resting on a rate limit, with the time it's back", () => {
    const until = new Date(NOW + 60_000);
    expect(freeVerdict({ ...base, cooldownUntil: until, lastError: "HTTP 429 (m): Rate limit exceeded" }, NOW)).toEqual({ kind: "resting", until, why: "rate limit" });
    // A rest that's over isn't shown.
    expect(freeVerdict({ ...base, cooldownUntil: new Date(NOW - 1), lastError: "HTTP 429 (m): x" }, NOW).kind).toBe("working");
  });
  it("switched model", () => {
    expect(freeVerdict({ ...base, switchedFrom: "gpt-oss-20b" }, NOW)).toEqual({ kind: "switched", model: "gpt-oss:20b", from: "gpt-oss-20b" });
  });
  it("broken: fix the key, or no model works", () => {
    expect(freeVerdict({ ...base, lastError: "HTTP 401 (m): invalid key", cooldownUntil: new Date(NOW + 60_000) }, NOW)).toEqual({ kind: "broken", fix: "key" });
    expect(freeVerdict({ ...base, unhealthy: true, lastError: `${NO_MODEL_WORKS} for this key: HTTP 404 model_not_found` }, NOW)).toEqual({ kind: "broken", fix: "model" });
    // Unhealthy from old rate limits is NOT broken.
    expect(freeVerdict({ ...base, unhealthy: true, lastError: "HTTP 429 (m): Rate limit exceeded" }, NOW).kind).toBe("working");
  });
});
