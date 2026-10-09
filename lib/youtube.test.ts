import { describe, expect, it } from "vitest";
import {
  auditVideo, channelContext, channelFindings, isShortVideo, isStalled, parseChannelInput, parseDuration, type AuditVideo,
} from "./youtube";

describe("parsing", () => {
  it("reads channel links, handles and ids", () => {
    expect(parseChannelInput("https://www.youtube.com/channel/UCEXAp1jCB2j45tgx-d5UUQg")).toEqual({ id: "UCEXAp1jCB2j45tgx-d5UUQg" });
    expect(parseChannelInput("https://youtube.com/@AidiniiHD/shorts")).toEqual({ handle: "AidiniiHD" });
    expect(parseChannelInput("@AidiniiHD")).toEqual({ handle: "AidiniiHD" });
    expect(parseChannelInput("not a channel!!")).toBeNull();
  });
  it("parses ISO durations and detects Shorts", () => {
    expect(parseDuration("PT1M5S")).toBe(65);
    expect(parseDuration("PT2H")).toBe(7200);
    expect(isShortVideo(50, "x", "")).toBe(true);
    expect(isShortVideo(90, "x #shorts", "")).toBe(true);
    expect(isShortVideo(90, "x", "")).toBe(false);
    expect(isShortVideo(600, "x #shorts", "")).toBe(false);
  });
});

// The aidinii channel as of 2026-10-10 (public numbers), oldest first.
const BOILER = "Welcome back to the development of Hunter Mouse 2! In this devlog, I'm showing you what I've been working on.";
const v = (videoId: string, title: string, views: number, likes: number, durationSec: number, publishedAt: string, extra: Partial<AuditVideo> = {}): AuditVideo =>
  ({ videoId, title, views, likes, durationSec, publishedAt, isShort: true, tags: [], description: BOILER, ...extra });
const channel: AuditVideo[] = [
  v("GhGqQCtngXY", "How to set up Unity MCP Server with Claude Code (FULL GUIDE) #gamedev #indiedev", 11155, 121, 65, "2026-03-28", { description: "Build Unity games faster with AI." }),
  v("qfv3Gr91jxM", "2 Years of Solo Game Dev… This Is The Result #indiegame #gamedev", 1892, 36, 33, "2026-03-29", { description: "I've been building this game for 2 years." }),
  v("BBN68hcazJc", "The Soundtrack That Changed My Game #gamedev #unitydev", 1362, 18, 60, "2026-03-30", { description: "How 7 years as a producer shaped the soundtrack." }),
  v("4LfjEE-lQGo", "I built 6 minigames as a solo indir game dev #devlogs #unity", 1190, 11, 63, "2026-10-03"),
  v("PY-8WmWFNgA", "Making collectibles in my game #devlogs #unity", 266, 2, 56, "2026-10-04", { tags: Array.from({ length: 23 }, (_, i) => `devlog 2026 ${i}`) }),
  v("aaYR3QUecI4", "Collectathon + RPG: genius or a mistake? #devlog #unity", 945, 8, 63, "2026-10-05"),
  v("qD1ce8tvoPI", "Indie unity adventure game 2 year progress #devlog #unity", 421, 6, 43, "2026-10-06"),
  v("Q4BB00A7eck", "Showcasing worlds inside my 4 year indie game project #devlogs", 145, 1, 52, "2026-10-07"),
  v("3jvwBlA0D8s", "Your First Indie Project WILL Fail (Here's Why) #unity #devlogs", 234, 2, 48, "2026-10-07"),
  v("Jz2ha7RwhPU", "I Deleted My Game… Then Won 1st Place", 10, 1, 50, "2026-10-09"),
];

describe("channel audit (real channel)", () => {
  const codes = channelFindings(channel).map((i) => i.code);
  it("spots the one-hit pattern, the decline, the gap and long Shorts", () => {
    expect(codes).toEqual(expect.arrayContaining(["one_hit", "declining", "upload_gap", "shorts_too_long"]));
  });
  it("flags per-video problems", () => {
    const ctx = channelContext(channel);
    const codesFor = (id: string) => auditVideo(channel.find((x) => x.videoId === id)!, ctx).map((i) => i.code);
    expect(codesFor("PY-8WmWFNgA")).toEqual(expect.arrayContaining(["long_short", "title_hashtags", "tag_stuffing", "boilerplate_description"]));
    expect(codesFor("Q4BB00A7eck")).toContain("underperformer");
    expect(codesFor("qfv3Gr91jxM")).not.toContain("long_short");
  });
  it("uses Studio retention numbers when you add them", () => {
    const ctx = channelContext(channel);
    const codes = auditVideo({ ...channel[9], swipeViewedPct: 48, avgViewedPct: 55 }, ctx).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["swiped_away", "low_retention"]));
  });
});

describe("pipeline", () => {
  it("flags unfinished work that hasn't moved in a week", () => {
    const now = new Date("2026-10-20");
    expect(isStalled({ stage: "edit", updatedAt: "2026-10-10" }, now)).toBe(true);
    expect(isStalled({ stage: "edit", updatedAt: "2026-10-18" }, now)).toBe(false);
    expect(isStalled({ stage: "published", updatedAt: "2026-01-01" }, now)).toBe(false);
  });
});
