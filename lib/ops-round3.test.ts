// Round 3 rules: who runs a cloud mission (Claude or free models), free-model
// quota maths, the Reach parsers, and how deliverables are squeezed into memory.

import { describe, expect, it } from "vitest";
import { MAX_REVIEW_ROUNDS, cloudRoute, mdInline, mdToBlocks, parseCloudReply, parseReview } from "@/lib/ops";
import { cooldownMs, modelTrouble, modelsToTry, pickOrder, readRateHeaders, remainingToday, usable, type FreeKeyState } from "@/lib/free-llm";
import { htmlToText, parseExa } from "@/lib/services/reach";
import { compress } from "@/lib/services/ops-memory";

const T = "2026-10-14";
const key = (o: Partial<FreeKeyState> = {}): FreeKeyState => ({
  provider: "groq", enabled: true, priority: 0, day: T, requests: 0, tokens: 0,
  remainingRequests: null, limitRequests: null, remainingTokens: null, headersAt: null, cooldownUntil: null, ...o,
});

describe("cloudRoute: Claude or free models", () => {
  const base = { engine: "auto", effort: "normal", claudeBlocked: false, freeReady: true, freeFirst: false, freeFallback: true };
  it("auto uses Claude while it can", () => expect(cloudRoute(base)).toBe("claude"));
  it("auto switches to free models when Claude runs out (fallback on)", () => expect(cloudRoute({ ...base, claudeBlocked: true })).toBe("free"));
  it("…and waits when fallback is off or nothing free is left", () => {
    expect(cloudRoute({ ...base, claudeBlocked: true, freeFallback: false })).toBe("none");
    expect(cloudRoute({ ...base, claudeBlocked: true, freeReady: false })).toBe("none");
  });
  it("free-first sends only quick missions to free models", () => {
    expect(cloudRoute({ ...base, freeFirst: true, effort: "quick" })).toBe("free");
    expect(cloudRoute({ ...base, freeFirst: true, effort: "deep" })).toBe("claude");
  });
  it("claude-only and free-only agents stick to their engine", () => {
    expect(cloudRoute({ ...base, engine: "claude", claudeBlocked: true })).toBe("none");
    expect(cloudRoute({ ...base, engine: "free" })).toBe("free");
    expect(cloudRoute({ ...base, engine: "free", freeReady: false })).toBe("none");
  });
});

describe("free model quotas", () => {
  it("estimates what's left from the published daily limit", () => {
    expect(remainingToday(key({ requests: 40 }), T)).toMatchObject({ requests: 960, limit: 1000, exact: false });
    // A new day starts from zero.
    expect(remainingToday(key({ requests: 40, day: "2026-10-13" }), T).requests).toBe(1000);
  });
  it("prefers the provider's own fresh numbers", () => {
    const now = Date.parse(`${T}T12:00:00Z`);
    expect(remainingToday(key({ requests: 1, remainingRequests: 12, limitRequests: 1000, headersAt: new Date(now - 60_000) }), T, now))
      .toMatchObject({ requests: 12, exact: true });
    // Stale (over an hour): back to the estimate.
    expect(remainingToday(key({ requests: 1, remainingRequests: 12, headersAt: new Date(now - 2 * 3_600_000) }), T, now).exact).toBe(false);
  });
  it("skips keys that are off, cooling down, or used up — then orders by your priority", () => {
    const now = Date.parse(`${T}T12:00:00Z`);
    expect(usable(key({ enabled: false }), T, now)).toBe(false);
    expect(usable(key({ cooldownUntil: new Date(now + 60_000) }), T, now)).toBe(false);
    expect(usable(key({ requests: 1000 }), T, now)).toBe(false);
    expect(usable(key({ tokens: 100_000 }), T, now)).toBe(false); // Groq's daily token cap
    const order = pickOrder([key({ provider: "gemini", priority: 1 }), key({ provider: "groq", priority: 0 }), key({ provider: "mistral", priority: 2, enabled: false })], T, now);
    expect(order.map((k) => k.provider)).toEqual(["groq", "gemini"]);
  });
  it("reads rate-limit headers and rests providers sensibly", () => {
    const h = new Headers({ "x-ratelimit-remaining-requests": "998", "x-ratelimit-limit-requests": "1000" });
    expect(readRateHeaders(h)).toEqual({ remainingRequests: 998, limitRequests: 1000, remainingTokens: null });
    expect(cooldownMs(429, "", "20")).toBe(20_000);
    expect(cooldownMs(429, "slow down", null)).toBe(60_000);
    expect(cooldownMs(429, "daily quota exceeded", null)).toBe(6 * 3_600_000);
    expect(cooldownMs(401, "bad key", null)).toBe(6 * 3_600_000);
  });
});

describe("Reach parsers", () => {
  it("reads Exa's result blocks", () => {
    const text = "Title: Fiverr fees 2026\nURL: https://example.com/fees\nPublished: 2026-09-01T00:00:00Z\nHighlights:\nFiverr keeps 20% of every order.\n\nTitle: No url here\n\nTitle: Second\nURL: https://example.org/b\nText:\nBody text";
    expect(parseExa(text)).toEqual([
      { title: "Fiverr fees 2026", url: "https://example.com/fees", published: "2026-09-01T00:00:00Z", snippet: "Fiverr keeps 20% of every order." },
      { title: "Second", url: "https://example.org/b", published: null, snippet: "Body text" },
    ]);
  });
  it("turns HTML into readable text without scripts", () => {
    expect(htmlToText("<html><script>alert(1)</script><h1>Hi &amp; bye</h1><p>One</p><p>Two</p></html>")).toBe("Hi & bye\n One\n Two");
  });
  it("cloud replies can ask the user a question", () => {
    expect(parseCloudReply("QUESTION: Which city should I focus on?\nOPTIONS: Sarajevo | Mostar")).toEqual({ question: "Which city should I focus on?", options: ["Sarajevo", "Mostar"] });
    expect(parseCloudReply("# Result\nNo question here")).toBeNull();
  });
});

describe("memory compression", () => {
  it("keeps the lead and the first bullets of a deliverable", () => {
    const md = "# Gigs\n\nThree good gigs this week.\n\n- Logo for a café, 50 KM\n- Video edit, 80 KM\n\n## Notes\nLong notes…";
    expect(compress(md)).toBe("Three good gigs this week. Long notes…\n- Logo for a café, 50 KM\n- Video edit, 80 KM");
  });
});

describe("model trouble: try another model before giving up on a provider", () => {
  it("tells a missing or busy model from a key/quota problem", () => {
    expect(modelTrouble(404, '{"error":{"code":"model_not_found"}}')).toBe("missing");
    expect(modelTrouble(503, "This model is currently experiencing high demand")).toBe("busy");
    expect(modelTrouble(429, "rate limit")).toBeNull();
    expect(modelTrouble(401, "invalid api key")).toBeNull();
  });
  it("tries yours first, then the catalog's, then what the key lists", () => {
    expect(modelsToTry("gemini", "gemini-3.6-flash")).toEqual(["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"]);
    expect(modelsToTry("groq", "llama-3.3-70b-versatile", ["openai/gpt-oss-20b", "whisper-large-v3"])).toEqual(["llama-3.3-70b-versatile", "openai/gpt-oss-20b"]);
    // A custom provider has no catalog: use what it lists (never audio/embedding models).
    expect(modelsToTry("custom", "x", ["text-embed-1", "chat-a", "chat-b", "chat-c"])).toEqual(["x", "chat-a", "chat-b"]);
  });
});

describe("rendering results", () => {
  it("keeps inline formatting and parses tables when asked", () => {
    const b = mdToBlocks("## Leads\n| Name | Phone |\n|---|---|\n| **Pekara Ćiro** | 033 123 |\n3. Call them", { inline: true });
    expect(b[0]).toEqual({ type: "h2", text: "Leads" });
    expect(b[1]).toEqual({ type: "table", text: "", rows: [["Name", "Phone"], ["**Pekara Ćiro**", "033 123"]] });
    expect(b[2]).toMatchObject({ type: "numbered", text: "Call them", n: 3 });
    // Without the option (Pages export), inline marks are stripped as before.
    expect(mdToBlocks("**bold** text")[0].text).toBe("bold text");
  });
  it("splits a line into bold, italic, code and safe links only", () => {
    expect(mdInline("Use **Google Maps** and `site:ba`, see [guide](https://example.com/g) or https://x.ba/a. _Free model_")).toEqual([
      { t: "text", v: "Use " }, { t: "b", v: "Google Maps" }, { t: "text", v: " and " }, { t: "code", v: "site:ba" },
      { t: "text", v: ", see " }, { t: "link", v: "guide", href: "https://example.com/g" }, { t: "text", v: " or " },
      { t: "link", v: "https://x.ba/a", href: "https://x.ba/a" }, { t: "text", v: ". " }, { t: "i", v: "Free model" },
    ]);
    // javascript: links are never links.
    expect(mdInline("[click](javascript:alert(1))").every((s) => s.t !== "link")).toBe(true);
  });
});

describe("the Chief's review", () => {
  it("reads a verdict and turns 'continue' without a next step into 'redo'", () => {
    expect(parseReview({ verdict: "continue", progress: 30, note: "Good start.", feedback: "Now do it.", next: { title: "List 20 bakeries without sites", brief: "Name, phone, maps link", effort: "quick" } }))
      .toEqual({ verdict: "continue", progress: 30, note: "Good start.", feedback: "Now do it.", next: { title: "List 20 bakeries without sites", brief: "Name, phone, maps link", effort: "quick" } });
    expect(parseReview({ verdict: "continue", feedback: "It only explains how to do it." })?.verdict).toBe("redo");
    expect(parseReview({ verdict: "ACCEPT", note: "Done." })).toMatchObject({ verdict: "accept", next: null, progress: null });
    expect(parseReview({ verdict: "maybe" })).toBeNull();
    expect(parseReview({ verdict: "redo" })).toBeNull(); // no feedback to act on
    expect(MAX_REVIEW_ROUNDS).toBe(3);
  });
});
