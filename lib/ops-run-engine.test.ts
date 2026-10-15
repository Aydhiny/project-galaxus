// What a cloud agent really runs on: the badge it shows, the labels, and the
// engine → logo mapping (Claude only when it's actually on Claude).

import { describe, expect, it } from "vitest";
import { RUN_ENGINES, badgeFor, packRanOn, parseRanOn, runEngineOf, runLabel, runShort } from "@/lib/ops-run-engine";
import { ENGINE_LOGO, PROVIDER_LOGO, badgeName, logoFor } from "@/components/ops/provider-logos";

describe("badgeFor", () => {
  it("a cloud agent shows what its last run ran on", () => {
    expect(badgeFor({ cloud: true, provider: "claude", engine: "auto", runEngine: "gemini" })).toBe("gemini");
    expect(badgeFor({ cloud: true, provider: "claude", engine: "free", runEngine: "groq" })).toBe("groq");
    expect(badgeFor({ cloud: true, provider: "claude", engine: "auto", runEngine: "finder" })).toBe("finder");
    expect(badgeFor({ cloud: true, provider: "claude", engine: "auto", runEngine: "claude" })).toBe("claude");
  });
  it("before any run: its engine setting, and auto is a neutral cloud, never Claude", () => {
    expect(badgeFor({ cloud: true, provider: "claude", engine: "auto", runEngine: null })).toBe("auto");
    expect(badgeFor({ cloud: true, provider: "claude", engine: "free" })).toBe("free");
    expect(badgeFor({ cloud: true, provider: "claude", engine: "claude" })).toBe("claude");
    expect(badgeFor({ cloud: true, provider: "claude", engine: "auto", runEngine: "nonsense" })).toBe("auto");
  });
  it("agents on your computer show their client", () => {
    expect(badgeFor({ cloud: false, provider: "cursor", runEngine: "groq" })).toBe("cursor");
  });
});

describe("engine → logo", () => {
  it("every engine has a logo, and none of the free ones is Claude's", () => {
    for (const e of RUN_ENGINES) expect(logoFor(e).path.length).toBeGreaterThan(10);
    for (const e of RUN_ENGINES.filter((x) => x !== "claude")) expect(logoFor(e).path).not.toBe(PROVIDER_LOGO.claude.path);
    expect(logoFor("auto").path).not.toBe(PROVIDER_LOGO.claude.path);
    expect(logoFor("free").path).not.toBe(PROVIDER_LOGO.claude.path);
  });
  it("Gemini is Google Gemini's mark; gateways share a chip; the finder is a compass", () => {
    expect(logoFor("gemini")).toBe(PROVIDER_LOGO.gemini);
    expect(logoFor("claude")).toBe(PROVIDER_LOGO.claude);
    expect(logoFor("llm7").path).toBe(ENGINE_LOGO.omniroute.path);
    expect(logoFor("custom").path).toBe(ENGINE_LOGO.llm7.path);
    expect(logoFor("finder").path).not.toBe(ENGINE_LOGO.llm7.path);
    expect(logoFor("cursor")).toBe(PROVIDER_LOGO.cursor); // clients still resolve
  });
  it("names for tooltips", () => {
    expect(badgeName("groq")).toBe("Groq");
    expect(badgeName("auto")).toMatch(/^Auto/);
    expect(badgeName("cursor")).toBe("Cursor");
  });
});

describe("labels and ran_on", () => {
  it("says what ran", () => {
    expect(runLabel("gemini", "gemini-3.8-flash")).toBe("on Gemini · gemini-3.8-flash");
    expect(runLabel("claude", "sonnet")).toBe("on Claude · sonnet");
    expect(runLabel("finder", null)).toBe("on the map finder");
    expect(runLabel(null)).toBeNull();
    expect(runShort("huggingface")).toBe("Hugging Face");
    expect(runEngineOf("mistral")).toBe("mistral");
    expect(runEngineOf("free")).toBeNull();
  });
  it("packs engine and model, even when the model id has colons", () => {
    expect(parseRanOn(packRanOn("openrouter", "nvidia/nemotron:free"))).toEqual({ engine: "openrouter", model: "nvidia/nemotron:free" });
    expect(parseRanOn(packRanOn("llm7", "gpt-oss:20b"))).toEqual({ engine: "llm7", model: "gpt-oss:20b" });
    expect(parseRanOn(packRanOn("finder", null))).toEqual({ engine: "finder", model: null });
    expect(parseRanOn("bogus:x")).toBeNull();
    expect(parseRanOn(null)).toBeNull();
  });
});
