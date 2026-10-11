import { describe, expect, it } from "vitest";
import {
  buildSubmitUrl, classifyPromo, firstCommentWithLink, hasDisclosure, normalizeRedditUsername, normalizeSubreddit, parseAbout, parseHot,
  parseRedditPost, parseRules, parseSearch, pickCommunity, redditPostPrompt, type PickableCommunity,
} from "./reddit";

describe("subreddit names", () => {
  it("accepts the usual ways of writing one", () => {
    expect(normalizeSubreddit("r/IndieDev")).toBe("IndieDev");
    expect(normalizeSubreddit("/r/IndieDev/")).toBe("IndieDev");
    expect(normalizeSubreddit("https://www.reddit.com/r/IndieDev/new")).toBe("IndieDev");
    expect(normalizeSubreddit("  n64 ")).toBe("n64");
  });
  it("rejects things that aren't one", () => {
    expect(normalizeSubreddit("")).toBeNull();
    expect(normalizeSubreddit("a")).toBeNull();
    expect(normalizeSubreddit("not a sub!")).toBeNull();
    expect(normalizeSubreddit("https://evil.example/r/IndieDev")).toBeNull();
  });
});

describe("Reddit usernames", () => {
  it("accepts the usual ways of writing one", () => {
    expect(normalizeRedditUsername("Aydhiny")).toBe("Aydhiny");
    expect(normalizeRedditUsername("u/Aydhiny")).toBe("Aydhiny");
    expect(normalizeRedditUsername("/u/Aydhiny/")).toBe("Aydhiny");
    expect(normalizeRedditUsername("https://www.reddit.com/user/Aydhiny")).toBe("Aydhiny");
  });
  it("rejects what Reddit wouldn't allow", () => {
    expect(normalizeRedditUsername("")).toBeNull();
    expect(normalizeRedditUsername("ab")).toBeNull();
    expect(normalizeRedditUsername("has spaces")).toBeNull();
    expect(normalizeRedditUsername("x".repeat(21))).toBeNull();
    expect(normalizeRedditUsername("a)\r\nX-Injected: 1")).toBeNull(); // goes into a header — no line breaks
  });
});

describe("reading Reddit's JSON", () => {
  it("parses about, and flags subs you can't post to", () => {
    const open = parseAbout({ data: { display_name: "IndieDev", subscribers: 150000, title: "Indie Dev", public_description: "For devs", over18: false, subreddit_type: "public" } });
    expect(open).toMatchObject({ subscribers: 150000, open: true, over18: false });
    expect(parseAbout({ data: { display_name: "x", subreddit_type: "restricted" } })?.open).toBe(false);
    expect(parseAbout({ data: { display_name: "x", subreddit_type: "public", quarantine: true } })?.open).toBe(false);
    expect(parseAbout({ nope: 1 })).toBeNull();
    expect(parseAbout(null)).toBeNull();
  });
  it("parses rules defensively", () => {
    expect(parseRules({ rules: [{ short_name: "No spam", description: "Be nice" }, {}, { short_name: "", description: "" }] }))
      .toEqual([{ title: "No spam", description: "Be nice" }]);
    expect(parseRules({})).toEqual([]);
  });
  it("keeps young, non-sticky, SFW threads to help in", () => {
    const hot = parseHot({ data: { children: [
      { data: { title: "My boss fight", permalink: "/r/x/comments/a/b/", score: 40, num_comments: 5 } },
      { data: { title: "Pinned rules", permalink: "/r/x/comments/c/d/", stickied: true, num_comments: 1 } },
      { data: { title: "Huge thread", permalink: "/r/x/comments/e/f/", num_comments: 900 } },
      { data: { title: "NSFW", permalink: "/r/x/comments/g/h/", over_18: true, num_comments: 2 } },
    ] } });
    expect(hot).toEqual([{ title: "My boss fight", url: "https://www.reddit.com/r/x/comments/a/b/", score: 40, comments: 5 }]);
  });
  it("filters subreddit search to public, SFW, mid-sized communities", () => {
    const found = parseSearch({ data: { children: [
      { data: { display_name: "good", subscribers: 50000, subreddit_type: "public", title: "Good" } },
      { data: { display_name: "tiny", subscribers: 200, subreddit_type: "public" } },
      { data: { display_name: "huge", subscribers: 40_000_000, subreddit_type: "public" } },
      { data: { display_name: "nsfw", subscribers: 50000, subreddit_type: "public", over18: true } },
      { data: { display_name: "private", subscribers: 50000, subreddit_type: "private" } },
    ] } });
    expect(found.map((f) => f.name)).toEqual(["good"]);
  });
});

describe("reading a subreddit's self-promotion rules", () => {
  const rule = (title: string, description = "") => ({ title, description });

  it("is unknown until the rules are read", () => {
    expect(classifyPromo(null).policy).toBe("unknown");
  });
  it("says ok when no rule mentions promotion", () => {
    expect(classifyPromo([rule("Be civil"), rule("Stay on topic")]).policy).toBe("ok");
    expect(classifyPromo([]).policy).toBe("ok");
  });
  it("bans when promotion is prohibited with no exception", () => {
    expect(classifyPromo([rule("No self-promotion")]).policy).toBe("banned");
    expect(classifyPromo([rule("No advertising", "Do not post links to your own stuff.")]).policy).toBe("banned");
  });
  it("restricts when there is a day, thread, ratio or flair", () => {
    expect(classifyPromo([rule("Self-promotion", "Only allowed on Saturdays in the weekly thread.")]).policy).toBe("restricted");
    expect(classifyPromo([rule("Limit promotion", "Keep self promotion under 10% of your posts.")]).policy).toBe("restricted");
    expect(classifyPromo([rule("Promotion", "Use the Promo flair.")]).policy).toBe("restricted");
  });
  it("keeps a note of which rule decided it", () => {
    expect(classifyPromo([rule("No self-promotion")]).note).toContain("No self-promotion");
  });
});

describe("choosing today's community", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const base: PickableCommunity = { id: 1, name: "a", status: "active", promoPolicy: "ok", priority: 100, rules: [], lastPostedAt: null, skipUntil: null };
  const c = (o: Partial<PickableCommunity>) => ({ ...base, ...o });
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it("never picks muted, suggested, banned, unknown or rule-less communities", () => {
    expect(pickCommunity([c({ status: "muted" }), c({ id: 2, status: "suggested" }), c({ id: 3, promoPolicy: "banned" }), c({ id: 4, promoPolicy: "unknown" }), c({ id: 5, rules: null })], now)).toBeNull();
  });
  it("respects the one-week cooldown and the skip window", () => {
    expect(pickCommunity([c({ lastPostedAt: daysAgo(3) })], now)).toBeNull();
    expect(pickCommunity([c({ lastPostedAt: daysAgo(8) })], now)?.id).toBe(1);
    expect(pickCommunity([c({ skipUntil: new Date(now.getTime() + 1000) })], now)).toBeNull();
    expect(pickCommunity([c({ skipUntil: new Date(now.getTime() - 1000) })], now)?.id).toBe(1);
  });
  it("prefers ok over restricted, then never-posted, then your ranking", () => {
    expect(pickCommunity([c({ id: 1, promoPolicy: "restricted" }), c({ id: 2, promoPolicy: "ok" })], now)?.id).toBe(2);
    expect(pickCommunity([c({ id: 1, lastPostedAt: daysAgo(9) }), c({ id: 2 })], now)?.id).toBe(2);
    expect(pickCommunity([c({ id: 1, priority: 50, lastPostedAt: daysAgo(30) }), c({ id: 2, priority: 10, lastPostedAt: daysAgo(30) })], now)?.id).toBe(2);
  });
});

describe("the prompt", () => {
  const prompt = redditPostPrompt({
    game: "Hunter Mouse 2", tagline: "a 3D collectathon", about: "43 worlds. Solo dev.", hasWishlistLink: true,
    community: { name: "IndieDev", title: "Indie Dev", description: "", subscribers: 150000, policy: "restricted", rules: [{ title: "Promo", description: "Saturdays only" }], hot: [{ title: "My jam game", url: "u", score: 1, comments: 1 }] },
    previous: [{ subreddit: "n64", title: "Why I rebuilt my game", angle: "rebuilding from scratch" }],
  });
  it("carries the rules, tone examples and past angles", () => {
    expect(prompt.prompt).toContain("Saturdays only");
    expect(prompt.prompt).toContain("My jam game");
    expect(prompt.prompt).toContain("rebuilding from scratch");
  });
  it("makes disclosure and no-links part of the instructions", () => {
    expect(prompt.system).toMatch(/you made the game/i);
    expect(prompt.system).toMatch(/No links in the body/);
    expect(prompt.system).toMatch(/untrusted/);
  });
});

describe("enforcing the principles on Claude's draft", () => {
  const draft = (o: Record<string, unknown>) => JSON.stringify({
    skip: false, title: "I rebuilt my collectathon from scratch after 2 years", linkAllowed: true,
    body: "I'm the solo dev behind Hunter Mouse 2. After two years I threw out the first version and started over. Here is what I learned about world design. What would you have kept?",
    firstComment: "Happy to share the Steam page if anyone wants it.", mediaHint: "10s clip of a world", flairHint: "Showcase", angle: "rebuilding from scratch", ...o,
  });

  it("accepts an honest draft", () => {
    const r = parseRedditPost(draft({}));
    expect(r.kind).toBe("draft");
    if (r.kind === "draft") {
      expect(r.draft.firstComment).toBe("Happy to share the Steam page if anyone wants it.");
      expect(r.draft.warnings).toEqual([]);
      expect(r.draft.angle).toBe("rebuilding from scratch");
    }
  });
  it("rejects a draft that doesn't say you made the game", () => {
    const r = parseRedditPost(draft({ title: "This collectathon looks amazing", body: "Wow, what a great game with 43 worlds. Everyone should try it. Thoughts?" }));
    expect(r).toMatchObject({ kind: "invalid" });
  });
  it("strips links from the body but keeps the post", () => {
    const r = parseRedditPost(draft({ body: "I'm the solo dev of Hunter Mouse 2, wishlist at https://store.steampowered.com/app/1 or www.example.com. What do you think?" }));
    expect(r.kind).toBe("draft");
    if (r.kind === "draft") {
      expect(r.draft.body).not.toMatch(/steampowered|example|https?:/);
      expect(r.draft.body).toContain("What do you think?");
      expect(r.draft.warnings).toHaveLength(1);
    }
  });
  it("drops the first comment when the rules don't allow links", () => {
    const r = parseRedditPost(draft({ linkAllowed: false }));
    expect(r.kind === "draft" && r.draft.firstComment).toBeNull();
  });
  it("passes a skip through with its reason", () => {
    expect(parseRedditPost('{"skip": true, "reason": "Rule 3 bans self-promotion."}')).toEqual({ kind: "skip", reason: "Rule 3 bans self-promotion." });
  });
  it("rejects unreadable or empty replies", () => {
    expect(parseRedditPost("sorry, I can't")).toMatchObject({ kind: "invalid" });
    expect(parseRedditPost('{"skip": false, "title": "", "body": ""}')).toMatchObject({ kind: "invalid" });
  });
  it("recognises disclosure in the common phrasings", () => {
    expect(hasDisclosure("I'm the solo dev behind this.")).toBe(true);
    expect(hasDisclosure("I've been building a game for 4 years")).toBe(true);
    expect(hasDisclosure("My game has 43 worlds")).toBe(true);
    expect(hasDisclosure("This game looks great, you should play it")).toBe(false);
  });
});

describe("links the model never writes", () => {
  it("adds the real URL in code", () => {
    expect(firstCommentWithLink("Happy to share the page!", "https://store.steampowered.com/app/1")).toBe("Happy to share the page!\n\nhttps://store.steampowered.com/app/1");
    expect(firstCommentWithLink("Happy to share the page!", null)).toBe("Happy to share the page!");
    expect(firstCommentWithLink(null, "https://x.test")).toBeNull();
  });
});

describe("opening Reddit with the post filled in", () => {
  it("encodes title and text", () => {
    const { url, truncated } = buildSubmitUrl("IndieDev", "Hello & welcome?", "Line one\nLine two");
    expect(truncated).toBe(false);
    expect(url).toContain("/r/IndieDev/submit?");
    expect(url).toContain("title=Hello%20%26%20welcome%3F");
    expect(url).toContain("text=Line%20one%0ALine%20two");
  });
  it("cuts text that would make the URL too long and says so", () => {
    const { url, truncated } = buildSubmitUrl("IndieDev", "T", "word ".repeat(1000));
    expect(truncated).toBe(true);
    expect(url.length).toBeLessThanOrEqual(1900);
  });
});
