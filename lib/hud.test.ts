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

import { skillLevels } from "./hud";
describe("skills", () => {
  it("levels every skill from real counts", () => {
    const zero = Object.fromEntries(["tasksDone","checkinDays","streak","focusMinutes","outreachSent","outreachReplies","clients","gigsApplied","earnedKm","gameCommits","webClients","videos","shorts","views","youtubeDays","beatsFinished","beatsSold","musicMinutes","trainingDays","trainingMinutes","records","prayers","quranPages","pagesRead","booksDone","studyHours","coursesDone","meditationMinutes","journalEntries"].map((k) => [k, 0])) as never;
    const r = skillLevels({ ...(zero as object), tasksDone: 20, prayers: 150, beatsFinished: 4 } as never);
    expect(r.skills.find((s) => s.key === "discipline")!.xp).toBe(120);
    expect(r.skills.find((s) => s.key === "faith")!.xp).toBe(300);
    expect(r.skills.find((s) => s.key === "music")!.level).toBe(2); // exactly 120 XP = level 2
    expect(r.totalXp).toBe(540);
    expect(r.level).toBe(2); // 400 for level 2, 1100 for level 3
  });
});
