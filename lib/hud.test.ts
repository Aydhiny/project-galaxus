import { describe, expect, it } from "vitest";
import { levelFor, rankTitle, xpFrom } from "./hud";

describe("HUD levels", () => {
  it("levels up on a growing curve", () => {
    expect(levelFor(0)).toMatchObject({ level: 1, into: 0, need: 100 });
    expect(levelFor(100).level).toBe(2);
    expect(levelFor(249).level).toBe(2);
    expect(levelFor(250).level).toBe(3);
    expect(levelFor(175).progress).toBe(50);
  });
  it("earns XP from real work and money", () => {
    expect(xpFrom({ tasksDone: 10, gigsApplied: 2, clients: 1, earnedKm: 1500 })).toBe(100 + 50 + 250 + 750);
    expect(rankTitle(1)).toBe("Rookie");
    expect(rankTitle(30)).toBe("Legend");
  });
});
