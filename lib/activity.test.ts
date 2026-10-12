import { describe, expect, it } from "vitest";
import { classify, detectNight, hhmm, isDoomscrolling } from "./activity";

describe("classify", () => {
  it("maps creative apps to deep-work categories", () => {
    expect(classify("Code", null)).toBe("code");
    expect(classify("Unity", null)).toBe("gamedev");
    expect(classify("FL Studio 21", null)).toBe("music");
    expect(classify("Adobe Premiere Pro 2025", null)).toBe("editing");
    expect(classify("Figma", null)).toBe("design");
  });
  it("counts social sites in a browser as scrolling, ignores the rest", () => {
    expect(classify("Google Chrome", "youtube")).toBe("scroll");
    expect(classify("Google Chrome", null)).toBeNull();
    expect(classify("Discord", null)).toBeNull();
  });
});

describe("detectNight", () => {
  it("finds the longest quiet gap starting in the evening", () => {
    // active until 23:40 (−20), quiet, back at 07:10 (430)
    expect(detectNight([-300, -120, -20, 430, 440, 600])).toEqual({ bed: -20, wake: 430 });
  });
  it("ignores an afternoon nap", () => {
    expect(detectNight([780, 1000])).toBeNull();
  });
  it("formats times across midnight", () => {
    expect(hhmm(-20)).toBe("23:40");
    expect(hhmm(430)).toBe("07:10");
  });
  it("trips the doomscroll guard at 20 minutes", () => {
    expect(isDoomscrolling(19)).toBe(false);
    expect(isDoomscrolling(20)).toBe(true);
  });
});
