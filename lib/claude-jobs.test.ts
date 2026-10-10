import { describe, expect, it } from "vitest";
import { devlogPrompt, parseDevlog, parseHooks, parseJsonReply, parseReplies, parseThemes } from "./claude-jobs";
import { ideaTaskPlan } from "./youtube";

describe("parsing Claude's JSON replies", () => {
  it("finds JSON inside fences or chatter", () => {
    expect(parseJsonReply('Sure!\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJsonReply('Here you go: {"a": 2} hope it helps')).toEqual({ a: 2 });
    expect(parseJsonReply("no json")).toBeNull();
  });
  it("parses each job's result defensively", () => {
    expect(parseDevlog('{"title":"I rebuilt my boss","hook":"This boss broke my game.","script":"…","shots":["boss fight"]}'))
      .toMatchObject({ title: "I rebuilt my boss", shots: ["boss fight"] });
    expect(parseDevlog('{"hook":"no title"}')).toBeNull();
    expect(parseHooks('{"hooks":["One","Two"]}')).toEqual(["One", "Two"]);
    expect(parseReplies('{"replies":[{"id":"c1","reply":"Thanks!"},{"id":"c2"}]}')).toEqual([{ id: "c1", reply: "Thanks!" }]);
    expect(parseThemes('{"themes":[{"theme":"Level 3 too hard","count":6,"severity":"urgent","examples":["died 20 times"],"task":"Tune level 3"}]}'))
      .toEqual([{ theme: "Level 3 too hard", count: 6, severity: "medium", examples: ["died 20 times"], task: "Tune level 3" }]);
  });
  it("puts the commits in the devlog prompt", () => {
    const p = devlogPrompt({ game: "Hunter Mouse 2", commits: [{ sha: "a1", message: "Add lava world\n\nlong body", date: "2026-10-09T10:00:00Z" }], bestVideos: [] });
    expect(p.prompt).toContain("2026-10-09 Add lava world");
    expect(p.prompt).not.toContain("long body");
  });
});

describe("content calendar", () => {
  it("plans Record → Edit → Publish before the publish date", () => {
    expect(ideaTaskPlan("2026-10-20", "2026-10-10")).toEqual([
      { phase: "Record", dueDate: "2026-10-18" },
      { phase: "Edit", dueDate: "2026-10-19" },
      { phase: "Publish", dueDate: "2026-10-20" },
    ]);
  });
  it("never schedules in the past", () => {
    expect(ideaTaskPlan("2026-10-11", "2026-10-10").map((s) => s.dueDate)).toEqual(["2026-10-10", "2026-10-10", "2026-10-11"]);
  });
});
