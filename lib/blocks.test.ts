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
