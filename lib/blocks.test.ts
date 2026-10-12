import { describe, it, expect } from "vitest";
import { matchShortcut, listNumber, sanitizeBlocks, todoProgress, blocksToPlainText, type Block } from "./blocks";

describe("matchShortcut", () => {
  it("turns markdown prefixes into block types", () => {
    expect(matchShortcut("# ")).toEqual({ type: "h1", text: "" });
    expect(matchShortcut("## Plan")).toEqual({ type: "h2", text: "Plan" });
    expect(matchShortcut("- milk")).toEqual({ type: "bullet", text: "milk" });
    expect(matchShortcut("[] ")).toEqual({ type: "todo", text: "" });
    expect(matchShortcut("[x] done")).toEqual({ type: "todo", text: "done", checked: true });
    expect(matchShortcut("1. ")).toEqual({ type: "numbered", text: "" });
    expect(matchShortcut("---")).toEqual({ type: "divider", text: "" });
  });

  it("ignores text that merely contains a trigger", () => {
    expect(matchShortcut("hello # world")).toBeNull();
    expect(matchShortcut("#hashtag")).toBeNull();
  });
});

describe("listNumber", () => {
  it("restarts numbering after a non-numbered block", () => {
    const b = (type: Block["type"]): Block => ({ id: type + Math.random(), type, text: "" });
    const blocks = [b("numbered"), b("numbered"), b("paragraph"), b("numbered")];
    expect(listNumber(blocks, 1)).toBe(2);
    expect(listNumber(blocks, 3)).toBe(1);
  });
});

describe("sanitizeBlocks", () => {
  it("drops junk and coerces unknown types to paragraph", () => {
    const out = sanitizeBlocks([null, 5, { id: "a", type: "evil", text: "hi" }, { id: "b", type: "todo", text: "x", checked: "yes" }]);
    expect(out).toEqual([
      { id: "a", type: "paragraph", text: "hi" },
      { id: "b", type: "todo", text: "x", checked: false },
    ]);
  });

  it("returns [] for non-arrays", () => {
    expect(sanitizeBlocks({ blocks: [] })).toEqual([]);
  });
});

describe("summaries", () => {
  const blocks: Block[] = [
    { id: "1", type: "h1", text: "Week plan" },
    { id: "2", type: "todo", text: "Gym", checked: true },
    { id: "3", type: "todo", text: "Read", checked: false },
    { id: "4", type: "divider", text: "" },
  ];
  it("counts todo progress", () => {
    expect(todoProgress(blocks)).toEqual({ done: 1, total: 2 });
  });
  it("builds a plain-text preview", () => {
    expect(blocksToPlainText(blocks)).toBe("Week plan · Gym · Read");
  });
});

describe("notion extras", () => {
  it("parses YouTube links", async () => {
    const { youtubeId } = await import("./blocks");
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ?t=3")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://example.com")).toBeNull();
  });
  it("keeps only safe urls, clamps image width and indent", async () => {
    const { sanitizeBlocks } = await import("./blocks");
    const [img, bad, list] = sanitizeBlocks([
      { id: "a", type: "image", text: "cap", url: "/api/page-files/abcdef1234", width: 500 },
      { id: "b", type: "bookmark", text: "", url: "javascript:alert(1)" },
      { id: "c", type: "bullet", text: "x", indent: 9, color: "red" },
    ]);
    expect(img.url).toBe("/api/page-files/abcdef1234");
    expect(img.width).toBe(100);
    expect(bad.url).toBeUndefined();
    expect(list.indent).toBe(3);
    expect(list.color).toBe("red");
  });
  it("numbers nested lists per level", async () => {
    const { listNumber } = await import("./blocks");
    const bs = [
      { id: "1", type: "numbered" as const, text: "" },
      { id: "2", type: "numbered" as const, text: "", indent: 1 },
      { id: "3", type: "numbered" as const, text: "" },
    ];
    expect(listNumber(bs, 2)).toBe(2);
    expect(listNumber(bs, 1)).toBe(1);
  });
});
