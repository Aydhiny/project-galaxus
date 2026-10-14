// Replay of a day: rebuilding the floor at any moment from what was recorded.

import { describe, expect, it } from "vitest";
import { agentsAt, dayKeyIn, dayStartIn, eventStatus, hhmmAt, messagesBetween, missionsAt, replayDays, replayMarks, type ReplayDay, type ReplayEvent, type ReplayMission } from "@/lib/ops-replay";

const D = "2026-10-14";
const at = (hhmm: string) => Date.parse(`${D}T${hhmm}:00Z`);
let nextId = 1;
const ev = (agentId: number, hhmm: string, kind: string, label: string, o: Partial<ReplayEvent> = {}): ReplayEvent =>
  ({ id: nextId++, agentId, missionId: null, kind, label, url: null, at: at(hhmm), ...o });
const mission = (o: Partial<ReplayMission> & { id: number }): ReplayMission =>
  ({ title: `Mission ${o.id}`, day: D, status: "open", agentId: null, budgetCents: null, spentCents: 0, createdAt: at("08:00"), claimedAt: null, submittedAt: null, ...o });

// Nova (cloud researcher) and Max (Claude Code on a laptop).
const NOVA = 1, MAX = 2;
const crew = [{ id: NOVA, cloud: true }, { id: MAX, cloud: false }];
const day: ReplayDay = {
  day: D, from: at("00:00"), to: at("23:59"), capped: false,
  seeds: [ev(MAX, "07:00", "status", "Came online", { at: at("00:00") - 3_600_000, status: "idle" })],
  events: [
    ev(NOVA, "09:00", "status", "Took the mission: Find gigs", { missionId: 10, status: "working" }),
    ev(NOVA, "09:05", "search", "Searching: logo gigs Sarajevo", { status: "working" }),
    ev(NOVA, "09:20", "status", "Submitted: Find gigs", { missionId: 10, status: "idle" }),
    ev(NOVA, "09:30", "status", "Accepted: Find gigs", { missionId: 10, status: "note" }), // your review: presence untouched
    ev(MAX, "10:00", "status", "Took the mission: Fix the login", { missionId: 11, status: "working" }),
    ev(MAX, "10:01", "edit", "Editing auth.ts", { status: "working" }),
    ev(MAX, "10:03", "waiting", "Wants permission to use Bash", { status: "waiting" }),
    ev(NOVA, "11:00", "status", "Couldn't finish: the run failed", { missionId: 12, status: "error" }),
  ],
  missions: [
    mission({ id: 10, title: "Find gigs", status: "done", agentId: NOVA, budgetCents: 200, spentCents: 35, claimedAt: at("09:00"), submittedAt: at("09:20") }),
    mission({ id: 11, title: "Fix the login", status: "claimed", agentId: MAX, createdAt: at("09:45"), claimedAt: at("10:00") }),
    mission({ id: 12, title: "Old, from yesterday", day: "2026-10-13", status: "open", createdAt: at("00:00") - 86_400_000 }),
    mission({ id: 13, title: "Yesterday's finished work", day: "2026-10-13", status: "done", createdAt: at("00:00") - 86_400_000 }),
    mission({ id: 14, title: "Cancelled", status: "cancelled", createdAt: at("08:00") }),
  ],
  messages: [
    { id: 1, from: null, to: NOVA, team: null, external: null, partner: null, at: at("08:59") },
    { id: 2, from: NOVA, to: MAX, team: null, external: null, partner: null, at: at("09:10") },
    { id: 3, from: MAX, to: null, team: "research", external: null, partner: null, at: at("10:02") },
  ],
};

describe("eventStatus", () => {
  it("uses the recorded status, and reads older events from their words", () => {
    expect(eventStatus({ kind: "browse", label: "x", status: "waiting" })).toBe("waiting");
    expect(eventStatus({ kind: "status", label: "Accepted: X", status: "note" })).toBeNull();
    // Recorded before the column existed (null, or not sent):
    expect(eventStatus({ kind: "status", label: "Came online", status: null })).toBe("idle");
    expect(eventStatus({ kind: "status", label: "Accepted: X" })).toBeNull();
    expect(eventStatus({ kind: "status", label: "Sent back: X" })).toBeNull();
    expect(eventStatus({ kind: "waiting", label: "Needs your permission" })).toBe("waiting");
    expect(eventStatus({ kind: "edit", label: "Editing a.ts" })).toBe("working");
    expect(eventStatus({ kind: "status", label: "Took the mission: X" })).toBe("working");
    expect(eventStatus({ kind: "status", label: "Couldn't finish: boom" })).toBe("error");
    expect(eventStatus({ kind: "status", label: "The cloud run failed; back on the board." })).toBe("error");
    expect(eventStatus({ kind: "status", label: "Came online" })).toBe("idle");
    expect(eventStatus({ kind: "status", label: "Submitted: X" })).toBe("idle");
  });
});

describe("missionsAt", () => {
  it("moves missions across the board as they were claimed, delivered and accepted", () => {
    const s = (t: string) => Object.fromEntries(missionsAt(day, at(t)).map((m) => [m.id, m.status]));
    expect(s("08:30")).toEqual({ 10: "open", 12: "open" }); // 11 isn't posted yet; yesterday's done work and cancelled ones never show
    expect(s("09:01")).toEqual({ 10: "claimed", 12: "open" });
    expect(s("09:25")).toMatchObject({ 10: "submitted" });
    expect(s("09:45")).toEqual({ 10: "done", 11: "open", 12: "open" });
    expect(s("10:30")).toMatchObject({ 11: "claimed" });
  });

  it("keeps work finished during the day on the board even when its day key is another date (UTC vs your timezone)", () => {
    const late: ReplayDay = {
      ...day,
      missions: [mission({ id: 20, day: "2026-10-13", status: "done", createdAt: at("00:00") - 3_600_000 })],
      events: [ev(NOVA, "09:40", "status", "Accepted: Late one", { missionId: 20, status: "note" })],
    };
    expect(missionsAt(late, at("09:00"))[0]).toMatchObject({ id: 20, status: "open" });
    expect(missionsAt(late, at("10:00"))[0]).toMatchObject({ id: 20, status: "done" });
  });

  it("shows who held a mission, and spend only once the work was delivered", () => {
    const m = (t: string) => missionsAt(day, at(t)).find((x) => x.id === 10)!;
    expect(m("09:01")).toMatchObject({ agentId: NOVA, spentCents: 0 });
    expect(m("09:25")).toMatchObject({ spentCents: 35 });
  });

  it("falls back on the mission's own timestamps when its events are gone", () => {
    const bare = { ...day, events: [] };
    const s = (t: string) => missionsAt(bare, at(t)).find((x) => x.id === 10)?.status;
    expect(s("08:59")).toBe("open");
    expect(s("09:10")).toBe("claimed");
    expect(s("09:21")).toBe("submitted"); // its acceptance isn't recorded anywhere, so it stays in review
  });
});

describe("agentsAt", () => {
  it("rebuilds each agent's presence and activity at that moment, with the live rules", () => {
    const st = (t: string) => agentsAt(day, crew, at(t));
    // Before anything: Nova (cloud) on standby, Max seen at 23:00 the day before → offline.
    expect(st("08:00").get(NOVA)).toMatchObject({ presence: "idle", activity: null });
    expect(st("08:00").get(MAX)).toMatchObject({ presence: "offline" });
    expect(st("09:06").get(NOVA)).toMatchObject({ presence: "working", activity: "Searching: logo gigs Sarajevo", activityKind: "search" });
    // Delivered, then you accepted it: the review note doesn't change what Nova shows.
    expect(st("09:31").get(NOVA)).toMatchObject({ presence: "idle", activity: "Submitted: Find gigs" });
    expect(st("10:02").get(MAX)).toMatchObject({ presence: "working", activity: "Editing auth.ts" });
    expect(st("10:04").get(MAX)).toMatchObject({ presence: "waiting", activity: "Wants permission to use Bash" });
    expect(st("11:01").get(NOVA)).toMatchObject({ presence: "error", statusNote: "Couldn't finish: the run failed" });
  });

  it("an agent holding a mission that went quiet shows as stuck, like the live view", () => {
    const quiet: ReplayDay = { ...day, events: day.events.filter((e) => e.agentId === MAX && e.at <= at("10:01")) };
    // Max took the mission at 10:00 and edited at 10:01; 20 minutes of silence later he's stuck (local limit: 15 min).
    expect(agentsAt(quiet, crew, at("10:21")).get(MAX)).toMatchObject({ presence: "stuck" });
  });
});

describe("radio and marks", () => {
  it("flies only what was sent in the window, newest first when capped", () => {
    expect(messagesBetween(day.messages, at("09:00"), at("10:30")).map((m) => m.id)).toEqual([2, 3]);
    expect(messagesBetween(day.messages, at("08:00"), at("12:00"), 2).map((m) => m.id)).toEqual([2, 3]);
    expect(messagesBetween(day.messages, at("10:30"), at("09:00"))).toEqual([]); // scrubbing back fires nothing
  });

  it("marks errors and waits on the timeline", () => {
    const marks = replayMarks(day);
    expect(marks.map((m) => m.kind)).toEqual(["waiting", "error"]);
    expect(marks[1].pct).toBeGreaterThan(45);
    expect(marks[1].pct).toBeLessThan(47);
  });
});

describe("days and times", () => {
  it("finds midnight in the user's timezone, including on a DST day", () => {
    expect(new Date(dayStartIn("2026-10-14", "Europe/Sarajevo")).toISOString()).toBe("2026-10-13T22:00:00.000Z"); // CEST
    expect(new Date(dayStartIn("2026-12-01", "Europe/Sarajevo")).toISOString()).toBe("2026-11-30T23:00:00.000Z"); // CET
    expect(new Date(dayStartIn("2026-10-25", "Europe/Sarajevo")).toISOString()).toBe("2026-10-24T22:00:00.000Z"); // clocks go back that night
    expect(dayStartIn("2026-10-14", "Not/AZone")).toBe(Date.parse("2026-10-14T00:00:00Z"));
  });

  it("lists the replayable days and formats the badge time", () => {
    expect(replayDays(Date.parse("2026-10-14T22:30:00Z"), "Europe/Sarajevo")).toEqual(["2026-10-15", "2026-10-14", "2026-10-13"]);
    expect(dayKeyIn(Date.parse("2026-10-14T22:30:00Z"), "UTC")).toBe("2026-10-14");
    expect(hhmmAt(Date.parse("2026-10-14T12:32:00Z"), "Europe/Sarajevo")).toBe("14:32");
  });
});
