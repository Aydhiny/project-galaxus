import { describe, expect, it } from "vitest";
import { detectBudget, isHiringPost, keywordScore, matchKeywords, parseGigScores, parseRedditListing, parseRedditRss, parseRemotive, splitList, templateReply } from "./gigs";

const KEYS = splitList("video editor, shorts, tiktok, capcut");
const EXCL = splitList("for hire, unpaid");

describe("matching", () => {
  it("hits keywords and honours excludes", () => {
    expect(matchKeywords("Need a TikTok + Shorts video editor", KEYS, EXCL)).toEqual(["video editor", "shorts", "tiktok"]);
    expect(matchKeywords("Video editor for hire, cheap", KEYS, EXCL)).toEqual([]);
    expect(matchKeywords("Unpaid shorts editor wanted", KEYS, EXCL)).toEqual([]);
  });
  it("keeps people hiring, drops people offering", () => {
    expect(isHiringPost({ source: "reddit", title: "[Hiring] Shorts editor $25/video", body: "", flair: null })).toBe(true);
    expect(isHiringPost({ source: "reddit", title: "[For Hire] Video editor with 5 years", body: "", flair: null })).toBe(false);
    expect(isHiringPost({ source: "reddit", title: "Editor for my channel?", body: "Looking for an editor for weekly shorts, will pay", flair: null })).toBe(true);
    expect(isHiringPost({ source: "reddit", title: "My first edit, thoughts?", body: "feedback welcome", flair: null })).toBe(false);
    expect(isHiringPost({ source: "remotive", title: "Video Editor", body: "", flair: null })).toBe(true);
  });
  it("finds budgets", () => {
    expect(detectBudget("Paying $25 per short, 20 shorts a month")).toBe("$25 per short");
    expect(detectBudget("Budget €300-€500")).toBe("€300-€500");
    expect(detectBudget("rate 500 USD per month")).toBe("500 USD per month");
    expect(detectBudget("budget is flexible")).toBeNull();
  });
  it("scores fresh paid ongoing work higher", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    const good = { source: "reddit" as const, externalId: "a", title: "[Hiring] Shorts editor $25/video", url: "u", body: "ongoing, remote, TikTok shorts", author: null, postedAt: new Date("2026-10-10T10:00:00Z") };
    const meh = { ...good, title: "Editor maybe", body: "someday", postedAt: new Date("2026-10-01T10:00:00Z") };
    expect(keywordScore(good, ["shorts", "tiktok"], now)).toBeGreaterThan(keywordScore(meh, ["shorts"], now));
  });
});

describe("parsers", () => {
  it("parses Reddit JSON and skips NSFW", () => {
    const r = parseRedditListing({ data: { children: [
      { data: { id: "abc", title: "[Hiring] Editor", selftext: "body", permalink: "/r/forhire/comments/abc/x/", author: "u1", created_utc: 1791640000, link_flair_text: "Hiring", subreddit: "forhire" } },
      { data: { id: "nsfw", title: "x", permalink: "/r/x/", over_18: true } },
    ] } });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ externalId: "reddit:abc", url: "https://www.reddit.com/r/forhire/comments/abc/x/", flair: "Hiring" });
  });
  it("parses Reddit RSS", () => {
    const xml = `<feed><entry><author><name>/u/bob</name></author><category term="forhire" label="r/forhire"/><content type="html">&lt;p&gt;Need shorts editor&lt;/p&gt;</content><id>t3_xyz</id><link href="https://www.reddit.com/r/forhire/comments/xyz/hiring/"/><published>2026-10-10T08:00:00+00:00</published><title>[Hiring] Shorts editor</title></entry></feed>`;
    expect(parseRedditRss(xml)[0]).toMatchObject({ externalId: "reddit:xyz", author: "bob", subreddit: "forhire", body: "Need shorts editor" });
  });
  it("parses Remotive", () => {
    expect(parseRemotive({ jobs: [{ id: 7, url: "https://remotive.com/j/7", title: "Video Editor", company_name: "Acme", description: "<p>Edit</p>", salary: "$40k" }] })[0])
      .toMatchObject({ externalId: "remotive:7", title: "Video Editor — Acme", body: "Salary: $40k. Edit" });
  });
  it("reads Claude's scores defensively", () => {
    expect(parseGigScores({ gigs: [{ id: 1, score: 140, reason: "great", reply: "Hi" }, { id: 2, score: 50 }] })).toEqual([{ id: 1, score: 100, reason: "great", reply: "Hi" }]);
  });
  it("writes a fallback reply without Claude", () => {
    expect(templateReply({ title: "[Hiring] Shorts editor", source: "reddit" }, "I edit shorts. Fast turnaround. Extra.")).toContain('"Shorts editor"');
  });
});
