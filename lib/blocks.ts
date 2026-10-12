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
  "toggle",
  "image",
  "bookmark",
  "video",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_COLORS = ["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
export type BlockColor = (typeof BLOCK_COLORS)[number];

export interface Block {
  id: string;
  type: BlockType;
  text: string; // the line itself; for images it's the caption, for toggles the summary line
  checked?: boolean; // todo only
  indent?: number; // 0–3, nesting for lists / text (Tab, Shift+Tab)
  color?: BlockColor; // text colour
  bg?: BlockColor; // background colour
  url?: string; // image (/api/page-files/…), bookmark and video links
  width?: number; // image width in % (20–100)
  align?: "left" | "center";
  open?: boolean; // toggle expanded
  body?: string; // toggle content
  meta?: { title?: string; description?: string; image?: string; site?: string }; // bookmark preview
}

/** Blocks without a text line to type into (keyboard navigation skips them). */
export const NON_TEXT_TYPES: ReadonlySet<BlockType> = new Set(["divider", "bookmark", "video"]);

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
  toggle:    { label: "Toggle list",   hint: "Hide content inside a toggle", keywords: "toggle collapse details >>" },
  image:     { label: "Image",         hint: "Upload or paste an image",   keywords: "image picture photo img upload" },
  bookmark:  { label: "Web bookmark",  hint: "A link as a visual card",    keywords: "bookmark link url web embed" },
  video:     { label: "Video",         hint: "Embed a YouTube video",      keywords: "video youtube embed" },
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
  [">> ", "toggle"],
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

/** Number shown for a numbered-list block: consecutive numbered blocks at the same indent (deeper ones don't break the run). */
export function listNumber(blocks: Block[], index: number): number {
  const level = blocks[index]?.indent ?? 0;
  let n = 1;
  for (let i = index - 1; i >= 0; i--) {
    const b = blocks[i], l = b.indent ?? 0;
    if (l > level) continue;
    if (l < level || b.type !== "numbered") break;
    n++;
  }
  return n;
}

/** YouTube link → video id (watch, youtu.be, shorts, embed), else null. */
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m?.[1] ?? null;
}

const SAFE_URL = /^(https:\/\/[^\s]{4,2000}|\/api\/page-files\/[\w-]{8,64})$/;

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
    if (typeof r.indent === "number" && r.indent > 0) block.indent = Math.min(3, Math.round(r.indent));
    if (BLOCK_COLORS.includes(r.color as BlockColor) && r.color !== "default") block.color = r.color as BlockColor;
    if (BLOCK_COLORS.includes(r.bg as BlockColor) && r.bg !== "default") block.bg = r.bg as BlockColor;
    if (typeof r.url === "string" && SAFE_URL.test(r.url)) block.url = r.url;
    if (type === "image") {
      if (typeof r.width === "number") block.width = Math.max(20, Math.min(100, Math.round(r.width)));
      if (r.align === "left" || r.align === "center") block.align = r.align;
    }
    if (type === "toggle") {
      block.open = r.open === true;
      if (typeof r.body === "string") block.body = r.body.slice(0, MAX_BLOCK_TEXT);
    }
    if (type === "bookmark" && r.meta && typeof r.meta === "object") {
      const m = r.meta as Record<string, unknown>;
      const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
      block.meta = { title: str(m.title, 300), description: str(m.description, 600), site: str(m.site, 100), image: typeof m.image === "string" && /^https:\/\//.test(m.image) ? m.image.slice(0, 1000) : undefined };
    }
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

/** The page as Markdown (Export). Images point at their Galaxus URL. */
export function blocksToMarkdown(title: string, blocks: Block[]): string {
  const lines: string[] = title ? [`# ${title}`, ""] : [];
  blocks.forEach((b, i) => {
    const pad = "  ".repeat(b.indent ?? 0);
    switch (b.type) {
      case "h1": lines.push(`# ${b.text}`); break;
      case "h2": lines.push(`## ${b.text}`); break;
      case "h3": lines.push(`### ${b.text}`); break;
      case "todo": lines.push(`${pad}- [${b.checked ? "x" : " "}] ${b.text}`); break;
      case "bullet": lines.push(`${pad}- ${b.text}`); break;
      case "numbered": lines.push(`${pad}${listNumber(blocks, i)}. ${b.text}`); break;
      case "quote": lines.push(`> ${b.text}`); break;
      case "callout": lines.push(`> 💡 ${b.text}`); break;
      case "code": lines.push("```", b.text, "```"); break;
      case "divider": lines.push("---"); break;
      case "toggle": lines.push(`<details><summary>${b.text}</summary>`, "", b.body ?? "", "", "</details>"); break;
      case "image": lines.push(`![${b.text}](${b.url ?? ""})`); break;
      case "bookmark": lines.push(`[${b.meta?.title || b.url || "Link"}](${b.url ?? ""})`); break;
      case "video": lines.push(b.url ?? ""); break;
      default: lines.push(`${pad}${b.text}`);
    }
  });
  return lines.join("\n") + "\n";
}
