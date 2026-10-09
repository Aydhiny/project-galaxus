// Block model for the Notion-style page editor. Pure — no React, no DB — so
// both the editor (client) and the server actions can share it, and it's
// trivially unit-testable.

export const BLOCK_TYPES = [
  "paragraph",
  "h1",
  "h2",
  "h3",
  "todo",
  "bullet",
  "numbered",
  "quote",
  "callout",
  "code",
  "divider",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export interface Block {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean; // todo only
}

export const BLOCK_META: Record<BlockType, { label: string; hint: string; keywords: string }> = {
  paragraph: { label: "Text",          hint: "Plain text",                 keywords: "text paragraph plain" },
  h1:        { label: "Heading 1",     hint: "Big section heading",        keywords: "heading title h1 #" },
  h2:        { label: "Heading 2",     hint: "Medium section heading",     keywords: "heading subtitle h2 ##" },
  h3:        { label: "Heading 3",     hint: "Small section heading",      keywords: "heading h3 ###" },
  todo:      { label: "To-do",         hint: "Track a task with a checkbox", keywords: "todo task check checkbox []" },
  bullet:    { label: "Bulleted list", hint: "A simple bulleted list",     keywords: "bullet list ul -" },
  numbered:  { label: "Numbered list", hint: "A list with numbering",      keywords: "numbered list ol 1." },
  quote:     { label: "Quote",         hint: "Capture a quote",            keywords: "quote blockquote >" },
  callout:   { label: "Callout",       hint: "Make a note stand out",      keywords: "callout note info tip !" },
  code:      { label: "Code",          hint: "Monospaced code snippet",    keywords: "code snippet ```" },
  divider:   { label: "Divider",       hint: "Visually separate sections", keywords: "divider line hr ---" },
};

/** Types where pressing Enter keeps the same type (lists continue). */
export const CONTINUING_TYPES: ReadonlySet<BlockType> = new Set(["todo", "bullet", "numbered"]);

export function newBlockId(): string {
  // crypto.randomUUID exists in every modern browser and in Node 19+.
  return crypto.randomUUID().slice(0, 12);
}

export function createBlock(type: BlockType = "paragraph", text = ""): Block {
  const b: Block = { id: newBlockId(), type, text };
  if (type === "todo") b.checked = false;
  return b;
}

/**
 * Markdown-style shortcuts typed at the very start of a block:
 * "# " → h1, "- " → bullet, "[] " → todo, etc. Returns the new type and the
 * text left over after stripping the trigger, or null if nothing matched.
 */
const SHORTCUTS: Array<[string, BlockType, boolean?]> = [
  ["### ", "h3"],
  ["## ", "h2"],
  ["# ", "h1"],
  ["[x] ", "todo", true],
  ["[] ", "todo"],
  ["[ ] ", "todo"],
  ["- ", "bullet"],
  ["* ", "bullet"],
  ["1. ", "numbered"],
  ["> ", "quote"],
  ["! ", "callout"],
  ["```", "code"],
];

export function matchShortcut(text: string): { type: BlockType; text: string; checked?: boolean } | null {
  if (text === "---") return { type: "divider", text: "" };
  for (const [trigger, type, checked] of SHORTCUTS) {
    if (text.startsWith(trigger)) {
      return { type, text: text.slice(trigger.length), ...(checked ? { checked } : {}) };
    }
  }
  return null;
}

/** Number shown for a numbered-list block: counts consecutive numbered blocks above it. */
export function listNumber(blocks: Block[], index: number): number {
  let n = 1;
  for (let i = index - 1; i >= 0 && blocks[i].type === "numbered"; i--) n++;
  return n;
}

/**
 * Defensive normaliser for anything coming over the wire into a server action.
 * Server actions are public HTTP endpoints, so the client's types are a
 * suggestion, not a guarantee — drop anything malformed and cap sizes.
 */
export const MAX_BLOCKS = 2000;
export const MAX_BLOCK_TEXT = 10_000;

export function sanitizeBlocks(input: unknown): Block[] {
  if (!Array.isArray(input)) return [];
  const out: Block[] = [];
  for (const raw of input.slice(0, MAX_BLOCKS)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const type = BLOCK_TYPES.includes(r.type as BlockType) ? (r.type as BlockType) : "paragraph";
    const id = typeof r.id === "string" && r.id.length > 0 && r.id.length <= 64 ? r.id : newBlockId();
    const text = typeof r.text === "string" ? r.text.slice(0, MAX_BLOCK_TEXT) : "";
    const block: Block = { id, type, text };
    if (type === "todo") block.checked = r.checked === true;
    out.push(block);
  }
  return out;
}

/** Plain-text preview of a page (for search results / page list snippets). */
export function blocksToPlainText(blocks: Block[], maxLength = 140): string {
  const joined = blocks
    .filter((b) => b.type !== "divider" && b.text.trim())
    .map((b) => b.text.trim())
    .join(" · ");
  return joined.length > maxLength ? joined.slice(0, maxLength - 1) + "…" : joined;
}

/** Progress of to-do blocks in a page, e.g. for a "3/5 done" badge. */
export function todoProgress(blocks: Block[]): { done: number; total: number } {
  const todos = blocks.filter((b) => b.type === "todo");
  return { done: todos.filter((b) => b.checked).length, total: todos.length };
}
