"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  GripVertical, Plus, Trash2, Copy, Type, Heading1, Heading2, Heading3, CheckSquare,
  List, ListOrdered, Quote, Lightbulb, Code2, Minus, Check, ChevronRight, Image as ImageIcon,
  Bookmark, MonitorPlay, Loader2, AlignCenter, AlignLeft, ExternalLink, Palette, IndentIncrease,
  ArrowUp, ArrowDown, ClipboardCopy, FileDown, Bold, Italic, Strikethrough, Link2, IndentDecrease,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BLOCK_COLORS, BLOCK_META, BLOCK_TYPES, CONTINUING_TYPES, NON_TEXT_TYPES, blocksToMarkdown, createBlock, listNumber, matchShortcut, youtubeId,
  type Block, type BlockColor, type BlockType,
} from "@/lib/blocks";
import { hasInlineMarks, renderInline } from "@/lib/inline-md";
import { CODE_LANGS, highlight } from "@/lib/highlight";
import { imageFiles, uploadPageImage } from "@/lib/client/page-images";
import { linkPreview } from "@/lib/actions/pages";

/*
  Design note — one <textarea> per block instead of one big contentEditable:
  React keeps full control (no caret jumps), and every block has exact caret
  positions. On top of that this editor adds what Notion users expect:
    • its own undo/redo history of the whole document (structure, not just text)
    • block selection: drag across blocks, Shift+click, Esc, Ctrl+A twice —
      then Backspace, Ctrl+C/X, Ctrl+D, Tab work on all selected blocks
    • a formatting toolbar on text selection, inline marks rendered when not editing
    • code blocks highlighted live while you type
*/

const ICONS: Record<BlockType, React.ComponentType<{ className?: string }>> = {
  paragraph: Type, h1: Heading1, h2: Heading2, h3: Heading3, todo: CheckSquare,
  bullet: List, numbered: ListOrdered, quote: Quote, callout: Lightbulb, code: Code2, divider: Minus,
  toggle: ChevronRight, image: ImageIcon, bookmark: Bookmark, video: MonitorPlay,
};

const PLACEHOLDER: Partial<Record<BlockType, string>> = {
  paragraph: "Type '/' for commands, paste an image or a link",
  h1: "Heading 1", h2: "Heading 2", h3: "Heading 3",
  todo: "To-do", bullet: "List", numbered: "List", quote: "Quote",
  callout: "Write a note…", code: "Code", toggle: "Toggle", image: "Add a caption…",
};

const TEXT_CLASS: Record<BlockType, string> = {
  paragraph: "text-[15px] leading-7",
  h1: "text-[1.6rem] sm:text-[1.9rem] leading-tight font-bold tracking-tight",
  h2: "text-[1.3rem] sm:text-[1.45rem] leading-snug font-semibold tracking-tight",
  h3: "text-[1.1rem] sm:text-[1.15rem] leading-snug font-semibold",
  todo: "text-[15px] leading-7", bullet: "text-[15px] leading-7", numbered: "text-[15px] leading-7",
  quote: "text-[15px] leading-7", callout: "text-[15px] leading-7",
  code: "font-mono text-[13px] leading-6",
  divider: "", toggle: "text-[15px] leading-7 font-medium", image: "text-sm leading-6 text-muted-foreground text-center", bookmark: "", video: "",
};

const ROW_SPACING: Partial<Record<BlockType, string>> = {
  h1: "mt-6 first:mt-0", h2: "mt-5 first:mt-0", h3: "mt-3 first:mt-0",
  callout: "my-1", code: "my-1", quote: "my-0.5", image: "my-2", bookmark: "my-1.5", video: "my-2",
};

const TEXT_COLOR: Record<BlockColor, string> = {
  default: "", gray: "text-zinc-500", brown: "text-amber-800 dark:text-amber-600", orange: "text-orange-600", yellow: "text-yellow-600 dark:text-yellow-500",
  green: "text-emerald-600", blue: "text-blue-600 dark:text-blue-400", purple: "text-purple-600 dark:text-purple-400", pink: "text-pink-600 dark:text-pink-400", red: "text-red-600 dark:text-red-400",
};
const BG_COLOR: Record<BlockColor, string> = {
  default: "", gray: "bg-zinc-500/10", brown: "bg-amber-800/10", orange: "bg-orange-500/12", yellow: "bg-yellow-400/15",
  green: "bg-emerald-500/12", blue: "bg-blue-500/12", purple: "bg-purple-500/12", pink: "bg-pink-500/12", red: "bg-red-500/12",
};
const SWATCH: Record<BlockColor, string> = {
  default: "#9ca3af", gray: "#71717a", brown: "#92400e", orange: "#ea580c", yellow: "#ca8a04", green: "#059669", blue: "#2563eb", purple: "#9333ea", pink: "#db2777", red: "#dc2626",
};
const CALLOUT_EMOJI = ["💡", "📌", "⚠️", "✅", "❗", "🔥", "📚", "🎯", "🧠", "💬", "🚀", "⭐", "🕌", "📝", "❓", "🛠️"];

const INDENTABLE: ReadonlySet<BlockType> = new Set(["paragraph", "todo", "bullet", "numbered", "toggle"]);
const URL_ONLY = /^https?:\/\/\S+$/;
const MAX_HISTORY = 200;

type CaretTarget = "start" | "end" | number;

interface BlockEditorProps {
  initialBlocks: Block[];
  onChange: (blocks: Block[]) => void;
  onExitTop?: () => void;
  autoFocus?: boolean;
}

export function BlockEditor({ initialBlocks, onChange, onExitTop, autoFocus }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>(() => (initialBlocks.length > 0 ? initialBlocks : [createBlock("paragraph")]));
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const root = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ id: string; caret: CaretTarget } | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<string | null>(null);

  const [slash, setSlash] = useState<{ blockId: string; query: string; index: number } | null>(null);
  const [actionMenuFor, setActionMenuFor] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "above" | "below" } | null>(null);

  // Block selection (multi-select) and the text-selection toolbar.
  const [sel, setSel] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);
  const textDrag = useRef<{ id: string; x: number; y: number } | null>(null);
  const [textSel, setTextSel] = useState<string | null>(null); // block whose text has a selection

  function focusBlock(id: string, caret: CaretTarget) {
    pendingFocus.current = { id, caret };
    setFocusedId(id);
  }

  function selectRange(fromId: string, toId: string) {
    const a = blocks.findIndex((b) => b.id === fromId), b = blocks.findIndex((x) => x.id === toId);
    if (a < 0 || b < 0) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    anchor.current = fromId;
    setSel(blocks.slice(lo, hi + 1).map((x) => x.id));
    setSlash(null); setTextSel(null);
  }
  function selectOnly(id: string) { anchor.current = id; setSel([id]); setSlash(null); setTextSel(null); (document.activeElement as HTMLElement | null)?.blur(); root.current?.focus({ preventScroll: true }); }

  // ── Undo / redo: snapshots of the whole document ────────────────────────
  const hist = useRef<{ stack: Block[][]; i: number; at: number; textId: string | null }>({ stack: [blocks], i: 0, at: 0, textId: null });
  const replaying = useRef(false);

  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    onChange(blocks);
    if (replaying.current) { replaying.current = false; return; }
    const h = hist.current;
    const prev = h.stack[h.i];
    // Typing in one block within a short pause → same undo step (word-sized chunks).
    const textOnly = prev.length === blocks.length && prev.every((b, i) => b.id === blocks[i].id && b.type === blocks[i].type);
    const changed = textOnly ? blocks.filter((b, i) => b !== prev[i]) : [];
    const sameTyping = textOnly && changed.length === 1 && changed[0].id === h.textId && Date.now() - h.at < 900 && !/\s$/.test(changed[0].text);
    if (sameTyping) h.stack[h.i] = blocks;
    else {
      h.stack = [...h.stack.slice(0, h.i + 1), blocks].slice(-MAX_HISTORY);
      h.i = h.stack.length - 1;
    }
    h.at = Date.now();
    h.textId = textOnly && changed.length === 1 ? changed[0].id : null;
  }, [blocks, onChange]);

  function undo(redo = false) {
    const h = hist.current;
    const to = redo ? h.i + 1 : h.i - 1;
    if (to < 0 || to >= h.stack.length) return;
    const current = h.stack[h.i];
    h.i = to;
    h.textId = null;
    replaying.current = true;
    const next = h.stack[to];
    setBlocks(next);
    setSel([]);
    // Put the caret on the block that changed (or stay where you were).
    const changed = next.find((b) => !current.some((c) => c === b)) ?? next.find((b) => b.id === focusedId);
    if (changed && !NON_TEXT_TYPES.has(changed.type)) focusBlock(changed.id, "end");
  }

  useLayoutEffect(() => {
    const req = pendingFocus.current;
    if (!req) return;
    const el = refs.current.get(req.id);
    if (!el) return;
    pendingFocus.current = null;
    el.focus();
    const pos = req.caret === "start" ? 0 : req.caret === "end" ? el.value.length : req.caret;
    el.setSelectionRange(pos, pos);
  });

  useEffect(() => {
    if (autoFocus && blocks[0]) setTimeout(() => focusBlock(blocks[0].id, "end"), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clicking outside the editor drops the block selection.
  useEffect(() => {
    if (!sel.length) return;
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setSel([]); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [sel.length]);

  // Dragging a text selection out of one block into another → select those blocks (like Notion).
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = textDrag.current;
      if (!d || !(e.buttons & 1)) return;
      if (Math.abs(e.clientY - d.y) < 6) return;
      const row = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.("[data-block-id]") as HTMLElement | null;
      const id = row?.dataset.blockId;
      if (!id || id === d.id && sel.length === 0) return;
      selectRange(d.id, id);
      window.getSelection()?.removeAllRanges();
      (document.activeElement as HTMLElement | null)?.blur();
      root.current?.focus({ preventScroll: true });
    };
    const up = () => { textDrag.current = null; };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, sel.length]);

  const update = useCallback((id: string, patch: Partial<Block>) => {
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  function insertAfter(index: number, block: Block, focus: CaretTarget | null = "start") {
    setBlocks((bs) => [...bs.slice(0, index + 1), block, ...bs.slice(index + 1)]);
    if (focus != null) focusBlock(block.id, focus);
  }

  function removeBlock(id: string) {
    setBlocks((bs) => { const next = bs.filter((b) => b.id !== id); return next.length > 0 ? next : [createBlock("paragraph")]; });
  }

  function moveBlock(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= blocks.length) return;
    const id = blocks[index].id;
    setBlocks((bs) => { const c = [...bs]; const [m] = c.splice(index, 1); c.splice(to, 0, m); return c; });
    if (!NON_TEXT_TYPES.has(blocks[index].type)) focusBlock(id, "end");
  }

  // ── Block selection ─────────────────────────────────────────────────────
  const selected = new Set(sel);

  function deleteSelected() {
    if (!sel.length) return;
    const first = blocks.findIndex((b) => selected.has(b.id));
    const rest = blocks.filter((b) => !selected.has(b.id));
    const replacement = createBlock("paragraph");
    const next = rest.length ? rest : [replacement];
    setBlocks(next);
    setSel([]);
    const target = next[Math.max(0, Math.min(first - 1, next.length - 1))];
    if (target && !NON_TEXT_TYPES.has(target.type)) focusBlock(target.id, "end");
  }
  function copySelected(cut = false) {
    const picked = blocks.filter((b) => selected.has(b.id));
    void navigator.clipboard.writeText(blocksToMarkdown("", picked).trimEnd());
    toast.success(cut ? "Cut" : `Copied ${picked.length} block${picked.length === 1 ? "" : "s"}`);
    if (cut) deleteSelected();
  }

  function onRootKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); undo(e.shiftKey); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); undo(true); return; }
    if (!sel.length || e.target !== root.current) return;
    if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); deleteSelected(); return; }
    if (e.key === "Escape") { e.preventDefault(); setSel([]); return; }
    if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); copySelected(); return; }
    if (mod && e.key.toLowerCase() === "x") { e.preventDefault(); copySelected(true); return; }
    if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSel(blocks.map((b) => b.id)); return; }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      const last = Math.max(...sel.map((id) => blocks.findIndex((b) => b.id === id)));
      const copies = blocks.filter((b) => selected.has(b.id)).map((b) => ({ ...b, id: createBlock().id }));
      setBlocks((bs) => [...bs.slice(0, last + 1), ...copies, ...bs.slice(last + 1)]);
      setSel(copies.map((c) => c.id));
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      setBlocks((bs) => bs.map((b) => (selected.has(b.id) && INDENTABLE.has(b.type) ? { ...b, indent: Math.max(0, Math.min(3, (b.indent ?? 0) + (e.shiftKey ? -1 : 1))) || undefined } : b)));
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const idxs = sel.map((id) => blocks.findIndex((b) => b.id === id)).sort((a, b) => a - b);
      const edge = e.key === "ArrowUp" ? idxs[0] - 1 : idxs[idxs.length - 1] + 1;
      if (edge < 0 || edge >= blocks.length) return;
      if (e.shiftKey && anchor.current) selectRange(anchor.current, blocks[edge].id);
      else selectOnly(blocks[edge].id);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const b = blocks.find((x) => x.id === sel[0]);
      setSel([]);
      if (b && !NON_TEXT_TYPES.has(b.type)) focusBlock(b.id, "end");
    }
  }

  function changeType(id: string, type: BlockType, text?: string) {
    const index = blocks.findIndex((b) => b.id === id);
    if (index === -1) return;
    if (type === "divider") {
      const next = createBlock("paragraph");
      setBlocks((bs) => { const copy = [...bs]; copy.splice(index, 1, { id, type: "divider", text: "" }, next); return copy; });
      focusBlock(next.id, "start");
      return;
    }
    if (type === "image") {
      setBlocks((bs) => bs.map((b) => (b.id === id ? { id, type: "image", text: "", width: 100, align: "center" } : b)));
      fileTarget.current = id;
      setTimeout(() => fileInput.current?.click(), 0);
      return;
    }
    if (type === "bookmark" || type === "video") { setBlocks((bs) => bs.map((b) => (b.id === id ? { id, type, text: "" } : b))); return; }
    setBlocks((bs) => bs.map((b) => (b.id === id
      ? { id: b.id, type, text: text ?? b.text, ...(b.indent ? { indent: b.indent } : {}), ...(b.color ? { color: b.color } : {}), ...(b.bg ? { bg: b.bg } : {}), ...(type === "todo" ? { checked: b.checked ?? false } : {}), ...(type === "toggle" ? { open: true, body: b.body ?? "" } : {}), ...(type === "code" ? { lang: b.lang ?? "typescript" } : {}) }
      : b)));
    focusBlock(id, "end");
  }

  // ── Images ─────────────────────────────────────────────────────────────────
  async function putImage(blockId: string, file: Blob) {
    setUploading((s) => new Set(s).add(blockId));
    try { update(blockId, { url: await uploadPageImage(file) }); }
    catch (e) { toast.error((e as Error).message); setBlocks((bs) => bs.filter((b) => b.id !== blockId || b.url)); }
    setUploading((s) => { const n = new Set(s); n.delete(blockId); return n; });
  }
  function insertImages(index: number, files: File[]) {
    const created = files.slice(0, 10).map(() => ({ ...createBlock("image"), width: 100, align: "center" as const }));
    setBlocks((bs) => {
      const at = bs[index];
      const replace = at && at.type === "paragraph" && at.text === "";
      const head = replace ? bs.slice(0, index) : bs.slice(0, index + 1);
      return [...head, ...created, ...bs.slice(index + 1)];
    });
    created.forEach((b, i) => void putImage(b.id, files[i]));
  }

  async function makeBookmark(id: string, url: string) {
    update(id, { type: "bookmark", url, text: "", meta: { title: url } });
    const meta = await linkPreview(url).catch(() => null);
    if (meta) update(id, { meta });
  }
  function placeLink(block: Block, index: number, url: string) {
    if (block.text.trim() === "" && block.type === "paragraph") {
      if (youtubeId(url)) update(block.id, { type: "video", url, text: "" });
      else void makeBookmark(block.id, url);
      insertAfter(index, createBlock("paragraph"));
      return true;
    }
    return false;
  }

  // ── Slash menu ────────────────────────────────────────────────────────────
  const slashOptions = useMemo(() => {
    if (!slash) return [];
    const q = slash.query.toLowerCase().trim();
    return BLOCK_TYPES.filter((t) => { if (!q) return true; const m = BLOCK_META[t]; return m.label.toLowerCase().includes(q) || m.keywords.includes(q); });
  }, [slash]);
  function applySlash(type: BlockType) { if (!slash) return; const id = slash.blockId; setSlash(null); changeType(id, type, ""); }

  // ── Text input ────────────────────────────────────────────────────────────
  function handleInput(block: Block, value: string, caret: number) {
    if (block.type === "paragraph") {
      const m = matchShortcut(value);
      if (m) {
        if (m.type === "divider") { changeType(block.id, "divider"); return; }
        setBlocks((bs) => bs.map((b) => (b.id === block.id
          ? { id: b.id, type: m.type, text: m.text, ...(b.indent ? { indent: b.indent } : {}), ...(m.type === "todo" ? { checked: m.checked ?? false } : {}), ...(m.type === "toggle" ? { open: true, body: "" } : {}), ...(m.type === "code" ? { lang: "typescript" } : {}) }
          : b)));
        focusBlock(block.id, Math.max(0, caret - (value.length - m.text.length)));
        setSlash(null);
        return;
      }
    }
    update(block.id, { text: value });
    if (block.type !== "code" && block.type !== "image" && /^\/[\w ]{0,24}$/.test(value)) {
      setSlash((s) => ({ blockId: block.id, query: value.slice(1), index: s?.blockId === block.id ? s.index : 0 }));
    } else if (slash?.blockId === block.id) setSlash(null);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>, block: Block, index: number) {
    const imgs = imageFiles(e.clipboardData);
    if (imgs.length) { e.preventDefault(); insertImages(index, imgs); return; }
    if (block.type === "code") return;
    const text = e.clipboardData.getData("text/plain");
    const el = e.currentTarget;
    if (URL_ONLY.test(text.trim())) {
      const url = text.trim();
      if (el.selectionStart !== el.selectionEnd) {
        e.preventDefault();
        const s = block.text.slice(el.selectionStart, el.selectionEnd);
        update(block.id, { text: block.text.slice(0, el.selectionStart) + `[${s}](${url})` + block.text.slice(el.selectionEnd) });
        return;
      }
      if (placeLink(block, index, url)) e.preventDefault();
      return;
    }
    if (!text.includes("\n")) return;
    e.preventDefault();
    const before = block.text.slice(0, el.selectionStart);
    const after = block.text.slice(el.selectionEnd);
    const parsed: Block[] = text.replace(/\r\n/g, "\n").split("\n").map((line) => {
      const m = matchShortcut(line);
      if (!m) return createBlock("paragraph", line);
      const b = createBlock(m.type, m.text);
      if (m.type === "todo") b.checked = m.checked ?? false;
      return b;
    });
    const first = { ...block, text: before + (parsed[0].type === "paragraph" ? parsed[0].text : "") };
    const rest = parsed[0].type === "paragraph" ? parsed.slice(1) : parsed;
    const last = rest[rest.length - 1];
    if (last) last.text += after; else first.text += after;
    setBlocks((bs) => [...bs.slice(0, index), first, ...rest, ...bs.slice(index + 1)]);
    const t = last ?? first;
    focusBlock(t.id, t.text.length - after.length);
  }

  function wrap(block: Block, el: HTMLTextAreaElement, left: string, right = left) {
    const { selectionStart: s, selectionEnd: e } = el;
    const picked = block.text.slice(s, e);
    // Toggle off if the selection is already wrapped.
    if (block.text.slice(s - left.length, s) === left && block.text.slice(e, e + right.length) === right) {
      update(block.id, { text: block.text.slice(0, s - left.length) + picked + block.text.slice(e + right.length) });
      focusBlock(block.id, e - left.length);
      return;
    }
    update(block.id, { text: block.text.slice(0, s) + left + picked + right + block.text.slice(e) });
    focusBlock(block.id, picked ? s + left.length + picked.length + right.length : s + left.length);
  }
  function wrapFocused(left: string, right = left) {
    const b = blocks.find((x) => x.id === textSel);
    const el = b && refs.current.get(b.id);
    if (b && el) wrap(b, el, left, right);
  }
  function addLink() {
    const url = window.prompt("Link to (https://…)", "https://");
    if (url && /^https?:\/\/\S+$/.test(url)) wrapFocused("[", `](${url})`);
  }

  // ── Keyboard inside a block ───────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, block: Block, index: number) {
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end, value } = el;
    const mod = e.metaKey || e.ctrlKey;

    if (slash?.blockId === block.id && slashOptions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlash({ ...slash, index: (slash.index + 1) % slashOptions.length }); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlash({ ...slash, index: (slash.index - 1 + slashOptions.length) % slashOptions.length }); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applySlash(slashOptions[slash.index]); return; }
      if (e.key === "Escape") { e.preventDefault(); setSlash(null); return; }
    }

    if (e.key === "Escape") { e.preventDefault(); selectOnly(block.id); return; } // like Notion: Esc selects the block
    if (mod && e.key.toLowerCase() === "a" && start === 0 && end === value.length) { e.preventDefault(); setSel(blocks.map((b) => b.id)); el.blur(); root.current?.focus({ preventScroll: true }); return; }
    if (mod && !e.shiftKey && e.key.toLowerCase() === "b") { e.preventDefault(); wrap(block, el, "**"); return; }
    if (mod && !e.shiftKey && e.key.toLowerCase() === "i") { e.preventDefault(); wrap(block, el, "*"); return; }
    if (mod && !e.shiftKey && e.key.toLowerCase() === "e") { e.preventDefault(); wrap(block, el, "`"); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); wrap(block, el, "~~"); return; }
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); const url = window.prompt("Link to (https://…)", "https://"); if (url && /^https?:\/\/\S+$/.test(url)) wrap(block, el, "[", `](${url})`); return; }
    if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); insertAfter(index, { ...block, id: createBlock().id }, "end"); return; }
    if (mod && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); moveBlock(index, e.key === "ArrowUp" ? -1 : 1); return; }

    if (e.key === "Tab" && block.type === "code") {
      e.preventDefault();
      update(block.id, { text: value.slice(0, start) + "  " + value.slice(end) });
      focusBlock(block.id, start + 2);
      return;
    }
    if (e.key === "Tab" && INDENTABLE.has(block.type)) {
      e.preventDefault();
      update(block.id, { indent: Math.max(0, Math.min(3, (block.indent ?? 0) + (e.shiftKey ? -1 : 1))) || undefined });
      focusBlock(block.id, start);
      return;
    }

    if (e.key === "Enter" && mod) {
      e.preventDefault();
      if (block.type === "todo") update(block.id, { checked: !block.checked });
      else if (block.type === "toggle") update(block.id, { open: !block.open });
      else insertAfter(index, createBlock("paragraph"));
      return;
    }

    if (e.key === "Enter" && !e.shiftKey && block.type !== "code") {
      e.preventDefault();
      if (URL_ONLY.test(value.trim()) && block.type === "paragraph" && placeLink({ ...block, text: "" }, index, value.trim())) return;
      if ((CONTINUING_TYPES.has(block.type) || block.type === "toggle") && value === "") {
        if (block.indent) { update(block.id, { indent: block.indent - 1 || undefined }); return; }
        changeType(block.id, "paragraph");
        return;
      }
      const before = value.slice(0, start), after = value.slice(end);
      const nextType: BlockType = CONTINUING_TYPES.has(block.type) ? block.type : "paragraph";
      update(block.id, { text: before });
      if (block.type === "image") { insertAfter(index, createBlock("paragraph"), "start"); return; }
      const nb = createBlock(nextType, after);
      if (block.indent && nextType !== "paragraph") nb.indent = block.indent;
      insertAfter(index, nb, "start");
      return;
    }

    if (e.key === "Backspace" && start === 0 && end === 0) {
      if (block.indent) { e.preventDefault(); update(block.id, { indent: block.indent - 1 || undefined }); return; }
      if (block.type !== "paragraph" && block.type !== "image") { e.preventDefault(); changeType(block.id, "paragraph"); return; }
      if (block.type === "image" && value === "") { e.preventDefault(); selectOnly(block.id); return; } // next Backspace deletes the image
      if (index > 0 && block.type === "paragraph") {
        e.preventDefault();
        const prev = blocks[index - 1];
        // A media / divider block above: first Backspace selects it, the next one deletes it (Notion behaviour).
        if (NON_TEXT_TYPES.has(prev.type) || prev.type === "image") {
          if (value === "") { removeBlock(block.id); selectOnlyLater(prev.id); }
          else selectOnly(prev.id);
          return;
        }
        update(prev.id, { text: prev.text + value });
        removeBlock(block.id);
        focusBlock(prev.id, prev.text.length);
        return;
      }
      if (value === "" && blocks.length > 1) { e.preventDefault(); removeBlock(block.id); focusBlock(blocks[1].id, "start"); }
      return;
    }
    // Delete at the end pulls the next block's text up.
    if (e.key === "Delete" && start === value.length && end === value.length && index < blocks.length - 1) {
      const next = blocks[index + 1];
      if (NON_TEXT_TYPES.has(next.type) || next.type === "image") return;
      e.preventDefault();
      update(block.id, { text: value + next.text });
      removeBlock(next.id);
      focusBlock(block.id, value.length);
      return;
    }

    if (e.key === "ArrowUp" && !e.shiftKey) {
      const onFirstLine = !value.slice(0, start).includes("\n") && isSingleVisualLine(el);
      if (start === 0 || onFirstLine) {
        const prev = findTextBlock(index, -1);
        if (prev) { e.preventDefault(); focusBlock(prev.id, "end"); }
        else if (onExitTop) { e.preventDefault(); onExitTop(); }
      }
      return;
    }
    if (e.key === "ArrowDown" && !e.shiftKey) {
      const onLastLine = !value.slice(end).includes("\n") && isSingleVisualLine(el);
      if (end === value.length || onLastLine) { const next = findTextBlock(index, 1); if (next) { e.preventDefault(); focusBlock(next.id, "start"); } }
    }
    // Shift+Arrow at a block edge starts selecting whole blocks.
    if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const atEdge = e.key === "ArrowUp" ? start === 0 : end === value.length;
      const other = blocks[index + (e.key === "ArrowUp" ? -1 : 1)];
      if (atEdge && other) { e.preventDefault(); selectRange(block.id, other.id); el.blur(); root.current?.focus({ preventScroll: true }); }
    }
  }

  function selectOnlyLater(id: string) { setTimeout(() => selectOnly(id), 0); }

  function findTextBlock(from: number, dir: 1 | -1): Block | undefined {
    for (let i = from + dir; i >= 0 && i < blocks.length; i += dir) if (!NON_TEXT_TYPES.has(blocks[i].type)) return blocks[i];
    return undefined;
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────
  function handleDrop(e: React.DragEvent) {
    const files = imageFiles(e.dataTransfer);
    const target = dropTarget;
    if (files.length) {
      e.preventDefault();
      setDropTarget(null);
      const idx = target ? blocks.findIndex((b) => b.id === target.id) + (target.position === "below" ? 0 : -1) : blocks.length - 1;
      insertImages(Math.max(-1, idx), files);
      return;
    }
    const from = dragId.current;
    dragId.current = null;
    setDropTarget(null);
    if (!from || !target || from === target.id) return;
    // Dragging one block of a selection moves the whole selection.
    const moving = selected.has(from) ? blocks.filter((b) => selected.has(b.id)) : blocks.filter((b) => b.id === from);
    if (moving.some((m) => m.id === target.id)) return;
    setBlocks((bs) => {
      const ids = new Set(moving.map((m) => m.id));
      const without = bs.filter((b) => !ids.has(b.id));
      const ti = without.findIndex((b) => b.id === target.id);
      const at = target.position === "above" ? ti : ti + 1;
      return [...without.slice(0, at), ...moving, ...without.slice(at)];
    });
  }

  function handleTailClick() {
    const last = blocks[blocks.length - 1];
    if (last && last.type === "paragraph" && last.text === "") focusBlock(last.id, "start");
    else insertAfter(blocks.length - 1, createBlock("paragraph"));
  }

  const textareaFor = (block: Block, index: number, extra?: string, placeholder?: string) => (
    <AutoTextarea
      ref={(el) => { if (el) refs.current.set(block.id, el); else refs.current.delete(block.id); }}
      value={block.text}
      placeholder={placeholder ?? (focusedId === block.id || blocks.length === 1 ? PLACEHOLDER[block.type] : block.type === "paragraph" ? "" : PLACEHOLDER[block.type])}
      className={cn(TEXT_CLASS[block.type], block.color && TEXT_COLOR[block.color], block.type === "todo" && block.checked && "line-through text-muted-foreground", extra)}
      spellCheck={block.type !== "code"}
      onFocus={() => { setFocusedId(block.id); if (sel.length) setSel([]); }}
      onBlur={() => {
        setTimeout(() => setSlash((s) => (s?.blockId === block.id ? null : s)), 150);
        setTimeout(() => setTextSel((t) => (t === block.id && document.activeElement !== refs.current.get(block.id) ? null : t)), 150);
        setFocusedId((f) => (f === block.id ? null : f));
      }}
      onMouseDown={(e) => { if (e.shiftKey && (anchor.current || focusedId)) { e.preventDefault(); selectRange(anchor.current ?? focusedId!, block.id); root.current?.focus({ preventScroll: true }); return; } textDrag.current = { id: block.id, x: e.clientX, y: e.clientY }; anchor.current = block.id; }}
      onSelect={(e) => { const t = e.currentTarget; setTextSel(t.selectionStart !== t.selectionEnd ? block.id : null); }}
      onChange={(e) => handleInput(block, e.target.value, e.target.selectionStart)}
      onKeyDown={(e) => handleKeyDown(e, block, index)}
      onPaste={(e) => handlePaste(e, block, index)}
    />
  );

  const textOrRendered = (block: Block, index: number, extra?: string, placeholder?: string) => {
    if (focusedId !== block.id && block.text && hasInlineMarks(block.text)) {
      return (
        <div onMouseDown={(e) => { if (e.shiftKey) { e.preventDefault(); selectRange(anchor.current ?? block.id, block.id); return; } e.preventDefault(); focusBlock(block.id, "end"); }}
          className={cn("w-full whitespace-pre-wrap break-words cursor-text", TEXT_CLASS[block.type], block.color && TEXT_COLOR[block.color], block.type === "todo" && block.checked && "line-through text-muted-foreground", extra)}>
          {renderInline(block.text, block.id)}
        </div>
      );
    }
    return textareaFor(block, index, extra, placeholder);
  };

  /** Code: a highlighted <pre> under a transparent textarea, so colours update as you type. */
  const codeArea = (block: Block, index: number) => (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5 -mt-0.5">
        <select value={block.lang ?? "typescript"} onChange={(e) => update(block.id, { lang: e.target.value })}
          className="h-6 rounded-md bg-transparent text-[11px] text-muted-foreground hover:text-foreground border-0 pr-1 cursor-pointer">
          {CODE_LANGS.map((l) => <option key={l} value={l}>{l === "csharp" ? "C#" : l === "cpp" ? "C++" : l[0].toUpperCase() + l.slice(1)}</option>)}
        </select>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(block.text); toast.success("Code copied"); }}
          className="h-6 px-2 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] inline-flex items-center gap-1"><ClipboardCopy className="w-3 h-3" /> Copy</button>
      </div>
      <div className="relative">
        <pre aria-hidden className={cn(TEXT_CLASS.code, "absolute inset-0 m-0 whitespace-pre-wrap break-words pointer-events-none")}>{highlight(block.text, block.lang ?? "typescript")}{"\n"}</pre>
        {textareaFor(block, index, "relative text-transparent caret-foreground selection:bg-primary/25 placeholder:text-muted-foreground/50")}
      </div>
    </div>
  );

  return (
    <div ref={root} tabIndex={-1} className="relative outline-none" onKeyDown={onRootKeyDown}
      onCopy={(e) => { if (sel.length && e.target === root.current) { e.preventDefault(); e.clipboardData.setData("text/plain", blocksToMarkdown("", blocks.filter((b) => selected.has(b.id))).trimEnd()); } }}
      onDragEnd={() => { dragId.current = null; setDropTarget(null); }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
      onDrop={(e) => { if (e.dataTransfer.types.includes("Files")) handleDrop(e); }}>
      <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0];
        const id = fileTarget.current;
        e.target.value = "";
        if (f && id) void putImage(id, f);
        else if (id) setBlocks((bs) => bs.filter((b) => b.id !== id || b.url));
        fileTarget.current = null;
      }} />
      {sel.length > 1 && (
        <div className="sticky top-2 z-30 mx-auto mb-2 w-fit flex items-center gap-1 rounded-xl border border-border bg-popover px-2 py-1 shadow-lg text-xs">
          <span className="px-1 text-muted-foreground">{sel.length} selected</span>
          <button type="button" onClick={() => copySelected()} className="h-7 px-2 rounded-md hover:bg-accent inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copy</button>
          <button type="button" onClick={deleteSelected} className="h-7 px-2 rounded-md hover:bg-destructive/10 hover:text-destructive inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          <span className="px-1 text-muted-foreground hidden sm:inline">Tab indent · Esc clear</span>
        </div>
      )}
      {blocks.map((block, index) => {
        const isDropAbove = dropTarget?.id === block.id && dropTarget.position === "above";
        const isDropBelow = dropTarget?.id === block.id && dropTarget.position === "below";
        const isSel = selected.has(block.id);
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={cn("group/block relative flex items-start -ml-10 pl-10 sm:-ml-14 sm:pl-14", ROW_SPACING[block.type])}
            onMouseDown={(e) => {
              // Clicking the row outside any text (gutter, media, divider) selects the block.
              const t = e.target as HTMLElement;
              if (t.closest("textarea, input, select, button, a, [data-no-select]")) return;
              if (NON_TEXT_TYPES.has(block.type) || block.type === "image" || t === e.currentTarget) {
                e.preventDefault();
                if (e.shiftKey && anchor.current) selectRange(anchor.current, block.id); else selectOnly(block.id);
              }
            }}
            onDragOver={(e) => {
              if (!dragId.current && !e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const position = e.clientY < rect.top + rect.height / 2 ? "above" : "below";
              if (dropTarget?.id !== block.id || dropTarget.position !== position) setDropTarget({ id: block.id, position });
            }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e); }}
          >
            {isSel && <div className="absolute inset-y-0 left-9 sm:left-13 right-0 rounded-md bg-primary/10 ring-1 ring-primary/25 pointer-events-none" />}
            {isDropAbove && <div className="absolute left-10 sm:left-14 right-0 -top-px h-0.5 rounded bg-primary/70" />}
            {isDropBelow && <div className="absolute left-10 sm:left-14 right-0 -bottom-px h-0.5 rounded bg-primary/70" />}

            <div className={cn(
              "absolute left-0 flex items-center gap-0 sm:gap-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity",
              block.type === "h1" ? "top-1.5" : block.type === "h2" ? "top-1" : "top-0.5",
              (actionMenuFor === block.id || focusedId === block.id) && "max-sm:opacity-100", actionMenuFor === block.id && "opacity-100"
            )} style={{ marginLeft: (block.indent ?? 0) * 24 }}>
              <button type="button" tabIndex={-1} aria-label="Add block below"
                onClick={() => { const b = createBlock("paragraph", "/"); insertAfter(index, b, "end"); setSlash({ blockId: b.id, query: "", index: 0 }); }}
                className="w-5 h-6 sm:w-6 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.06]">
                <Plus className="w-4 h-4" />
              </button>
              <button type="button" tabIndex={-1} draggable aria-label="Drag to move, click for options"
                onDragStart={(e) => {
                  dragId.current = block.id;
                  e.dataTransfer.effectAllowed = "move";
                  const row = (e.currentTarget as HTMLElement).closest("[data-block-id]");
                  if (row) e.dataTransfer.setDragImage(row, 40, 12);
                }}
                onClick={() => setActionMenuFor((v) => (v === block.id ? null : block.id))}
                className="w-5 h-6 sm:w-6 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] cursor-grab active:cursor-grabbing">
                <GripVertical className="w-4 h-4" />
              </button>
            </div>

            {actionMenuFor === block.id && (
              <BlockActionMenu
                block={block}
                canUp={index > 0} canDown={index < blocks.length - 1}
                onClose={() => setActionMenuFor(null)}
                onTurnInto={(t) => { setActionMenuFor(null); changeType(block.id, t); }}
                onColor={(patch) => update(block.id, patch)}
                onIndent={(d) => update(block.id, { indent: Math.max(0, Math.min(3, (block.indent ?? 0) + d)) || undefined })}
                onMove={(d) => { setActionMenuFor(null); moveBlock(index, d); }}
                onCopyText={() => { setActionMenuFor(null); void navigator.clipboard.writeText(block.type === "image" || block.type === "bookmark" || block.type === "video" ? block.url ?? "" : block.text); toast.success("Copied"); }}
                onCopyMd={() => { setActionMenuFor(null); void navigator.clipboard.writeText(blocksToMarkdown("", [block]).trimEnd()); toast.success("Copied as Markdown"); }}
                onDuplicate={() => { setActionMenuFor(null); insertAfter(index, { ...block, id: createBlock().id }, NON_TEXT_TYPES.has(block.type) ? null : "end"); }}
                onReplaceImage={block.type === "image" ? () => { setActionMenuFor(null); fileTarget.current = block.id; fileInput.current?.click(); } : undefined}
                onDelete={() => {
                  setActionMenuFor(null);
                  const neighbour = findTextBlock(index, -1) ?? findTextBlock(index, 1);
                  removeBlock(block.id);
                  if (neighbour) focusBlock(neighbour.id, "end");
                }}
              />
            )}

            {/* Formatting toolbar on a text selection */}
            {textSel === block.id && block.type !== "code" && (
              <div className="absolute -top-10 left-10 sm:left-14 z-30 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-0.5 shadow-lg" onMouseDown={(e) => e.preventDefault()} data-no-select>
                {([[Bold, "**", "**", "Bold (Ctrl+B)"], [Italic, "*", "*", "Italic (Ctrl+I)"], [Strikethrough, "~~", "~~", "Strike (Ctrl+Shift+S)"], [Code2, "`", "`", "Code (Ctrl+E)"]] as const).map(([Icon, l, r, title]) => (
                  <button key={title} type="button" title={title} onClick={() => wrapFocused(l, r)} className="w-7 h-7 rounded-md hover:bg-accent flex items-center justify-center"><Icon className="w-3.5 h-3.5" /></button>
                ))}
                <button type="button" title="Link (Ctrl+K)" onClick={addLink} className="w-7 h-7 rounded-md hover:bg-accent flex items-center justify-center"><Link2 className="w-3.5 h-3.5" /></button>
                <span className="w-px h-5 bg-border mx-0.5" />
                {(["default", "red", "orange", "green", "blue", "purple"] as BlockColor[]).map((c) => (
                  <button key={c} type="button" title={`${c} text`} onClick={() => update(block.id, { color: c === "default" ? undefined : c })} className="w-6 h-7 rounded-md hover:bg-accent text-xs font-bold" style={{ color: SWATCH[c] }}>A</button>
                ))}
                <span className="w-px h-5 bg-border mx-0.5" />
                <button type="button" title="More options" onClick={() => setActionMenuFor(block.id)} className="h-7 px-1.5 rounded-md hover:bg-accent text-[11px] text-muted-foreground">More</button>
              </div>
            )}

            <div className={cn("flex-1 min-w-0 flex items-start rounded-md", block.bg && BG_COLOR[block.bg], block.bg && "px-1.5 -mx-1.5")} style={{ paddingLeft: (block.indent ?? 0) * 24 || undefined }}>
              {block.type === "divider" ? (
                <div className="w-full py-3 cursor-pointer"><hr className="border-t border-border" /></div>
              ) : block.type === "image" ? (
                <ImageBlock block={block} busy={uploading.has(block.id)} onPatch={(p) => update(block.id, p)}
                  onPick={() => { fileTarget.current = block.id; fileInput.current?.click(); }}
                  caption={textOrRendered(block, index)} />
              ) : block.type === "bookmark" ? (
                <BookmarkBlock block={block} onUrl={(url) => void makeBookmark(block.id, url)} />
              ) : block.type === "video" ? (
                <VideoBlock block={block} onUrl={(url) => update(block.id, { url })} />
              ) : block.type === "code" ? (
                <div className={cn("w-full rounded-lg bg-muted px-4 py-3 ring-1 ring-transparent", focusedId === block.id && "ring-border")}>{codeArea(block, index)}</div>
              ) : block.type === "toggle" ? (
                <div className="w-full">
                  <div className="flex items-start gap-1">
                    <button type="button" onClick={() => update(block.id, { open: !block.open })} aria-label={block.open ? "Collapse" : "Expand"}
                      className="mt-1 w-5 h-5 shrink-0 rounded hover:bg-foreground/[0.06] flex items-center justify-center">
                      <ChevronRight className={cn("w-4 h-4 transition-transform", block.open && "rotate-90")} />
                    </button>
                    {textOrRendered(block, index)}
                  </div>
                  {block.open && (
                    <div className="pl-6">
                      <AutoTextarea value={block.body ?? ""} placeholder="Empty toggle. Write inside it…"
                        className="text-[15px] leading-7 placeholder:text-muted-foreground/40"
                        onChange={(e) => update(block.id, { body: e.target.value })} />
                    </div>
                  )}
                </div>
              ) : (
                <BlockBody block={block} number={block.type === "numbered" ? listNumber(blocks, index) : 0}
                  onToggle={() => update(block.id, { checked: !block.checked })} onEmoji={(emoji) => update(block.id, { emoji })}>
                  {textOrRendered(block, index)}
                </BlockBody>
              )}
            </div>

            {slash?.blockId === block.id && slashOptions.length > 0 && (
              <SlashMenu options={slashOptions} activeIndex={Math.min(slash.index, slashOptions.length - 1)}
                onHover={(i) => setSlash({ ...slash, index: i })} onSelect={applySlash} />
            )}
          </div>
        );
      })}
      <div className="h-20 cursor-text" onClick={handleTailClick} />
    </div>
  );
}

// ─── Block chrome ───────────────────────────────────────────────────────────

function BlockBody({ block, number, onToggle, onEmoji, children }: { block: Block; number: number; onToggle: () => void; onEmoji: (e: string) => void; children: React.ReactNode }) {
  const [picker, setPicker] = useState(false);
  switch (block.type) {
    case "todo":
      return (
        <div className="flex items-start gap-2.5 w-full">
          <button type="button" role="checkbox" aria-checked={!!block.checked} onClick={onToggle}
            className={cn("mt-[5px] w-[18px] h-[18px] shrink-0 rounded-[5px] border flex items-center justify-center transition-colors",
              block.checked ? "bg-primary border-primary text-primary-foreground" : "border-foreground/30 hover:border-foreground/50 hover:bg-foreground/[0.04]")}>
            {block.checked && <Check className="w-3 h-3" strokeWidth={3} />}
          </button>
          {children}
        </div>
      );
    case "bullet":
      return <div className="flex items-start gap-2 w-full"><span className="w-5 shrink-0 text-center leading-7 select-none text-foreground/70">{["•", "◦", "▪", "•"][block.indent ?? 0]}</span>{children}</div>;
    case "numbered":
      return <div className="flex items-start gap-1.5 w-full"><span className="min-w-5 shrink-0 text-right leading-7 select-none tabular-nums text-foreground/70">{(block.indent ?? 0) % 2 === 1 ? String.fromCharCode(96 + Math.min(26, number)) : number}.</span>{children}</div>;
    case "quote":
      return <div className="w-full border-l-[3px] border-foreground/70 pl-4">{children}</div>;
    case "callout":
      return (
        <div className={cn("relative w-full flex items-start gap-3 rounded-lg px-3 sm:px-4 py-3", block.bg ? "" : "bg-muted")}>
          <button type="button" onClick={() => setPicker((v) => !v)} className="leading-7 select-none rounded hover:bg-foreground/[0.06] px-0.5" aria-label="Change icon">{block.emoji ?? "💡"}</button>
          {picker && (
            <div className="absolute left-2 top-10 z-30 grid grid-cols-8 gap-0.5 rounded-xl border border-border bg-popover p-1.5 shadow-lg" data-no-select>
              {CALLOUT_EMOJI.map((e) => <button key={e} type="button" onClick={() => { onEmoji(e); setPicker(false); }} className="w-8 h-8 rounded-md text-lg hover:bg-accent">{e}</button>)}
            </div>
          )}
          {children}
        </div>
      );
    default:
      return <div className="w-full">{children}</div>;
  }
}

function ImageBlock({ block, busy, onPatch, onPick, caption }: { block: Block; busy: boolean; onPatch: (p: Partial<Block>) => void; onPick: () => void; caption: React.ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const width = block.width ?? 100;
  function startResize(e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    const parent = frame.current?.parentElement?.getBoundingClientRect();
    if (!parent) return;
    const move = (ev: PointerEvent) => {
      const px = block.align !== "left" ? Math.abs(ev.clientX - (parent.left + parent.width / 2)) * 2 : ev.clientX - parent.left;
      onPatch({ width: Math.max(20, Math.min(100, Math.round((px / parent.width) * 100))) });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  if (!block.url) {
    return (
      <button type="button" onClick={onPick} className="w-full rounded-lg border border-dashed border-border bg-muted/40 py-8 text-sm text-muted-foreground hover:bg-muted flex items-center justify-center gap-2">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <><ImageIcon className="w-4 h-4" /> Click to upload, or paste / drop an image</>}
      </button>
    );
  }
  return (
    <figure className="w-full">
      <div ref={frame} className={cn("relative group/img", block.align === "left" ? "mr-auto" : "mx-auto")} style={{ width: `${width}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={block.url} alt={block.text || ""} className="w-full rounded-md block" draggable={false} />
        <div className="absolute top-2 right-2 flex flex-wrap justify-end gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity" data-no-select>
          {([[40, "S"], [65, "M"], [85, "L"], [100, "Full"]] as const).map(([w, l]) => (
            <button key={l} type="button" onClick={() => onPatch({ width: w })} className={cn("h-7 px-2 rounded-md text-xs font-medium backdrop-blur", width === w ? "bg-white text-black" : "bg-black/60 text-white")}>{l}</button>
          ))}
          <button type="button" title="Align" onClick={() => onPatch({ align: block.align === "left" ? "center" : "left" })} className="h-7 w-7 rounded-md bg-black/60 text-white flex items-center justify-center backdrop-blur">{block.align === "left" ? <AlignCenter className="w-3.5 h-3.5" /> : <AlignLeft className="w-3.5 h-3.5" />}</button>
          <a href={block.url} download title="Download" className="h-7 w-7 rounded-md bg-black/60 text-white flex items-center justify-center backdrop-blur"><FileDown className="w-3.5 h-3.5" /></a>
          <a href={block.url} target="_blank" rel="noopener noreferrer" title="Open original" className="h-7 w-7 rounded-md bg-black/60 text-white flex items-center justify-center backdrop-blur"><ExternalLink className="w-3.5 h-3.5" /></a>
        </div>
        <span onPointerDown={startResize} title="Drag to resize" className="absolute top-1/2 -right-1.5 -translate-y-1/2 h-12 w-1.5 rounded-full bg-foreground/50 opacity-0 group-hover/img:opacity-100 cursor-ew-resize" data-no-select />
      </div>
      <figcaption className="mt-1.5">{caption}</figcaption>
    </figure>
  );
}

function BookmarkBlock({ block, onUrl }: { block: Block; onUrl: (url: string) => void }) {
  const [draft, setDraft] = useState("");
  if (!block.url) {
    return (
      <form className="w-full flex gap-2" onSubmit={(e) => { e.preventDefault(); if (URL_ONLY.test(draft.trim())) onUrl(draft.trim()); }}>
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste a link and press Enter…" className="flex-1 h-10 rounded-lg border border-border bg-transparent px-3 text-sm" />
      </form>
    );
  }
  const m = block.meta ?? {};
  return (
    <a href={block.url} target="_blank" rel="noopener noreferrer" className="w-full flex rounded-lg border border-border overflow-hidden hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0 p-3">
        <p className="text-sm font-medium truncate">{m.title || block.url}</p>
        {m.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{m.description}</p>}
        <p className="mt-2 text-xs text-muted-foreground truncate">{m.site || safeHost(block.url)}</p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {m.image && <img src={m.image} alt="" className="hidden sm:block w-40 object-cover shrink-0" referrerPolicy="no-referrer" />}
    </a>
  );
}
function safeHost(url: string) { try { return new URL(url).hostname; } catch { return url; } }

function VideoBlock({ block, onUrl }: { block: Block; onUrl: (url: string) => void }) {
  const [draft, setDraft] = useState("");
  const id = block.url ? youtubeId(block.url) : null;
  if (!id) {
    return (
      <form className="w-full flex gap-2" onSubmit={(e) => { e.preventDefault(); if (youtubeId(draft)) onUrl(draft.trim()); else toast.error("Paste a YouTube link."); }}>
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste a YouTube link and press Enter…" className="flex-1 h-10 rounded-lg border border-border bg-transparent px-3 text-sm" />
      </form>
    );
  }
  return (
    <div className="w-full aspect-video rounded-lg overflow-hidden bg-black">
      <iframe src={`https://www.youtube-nocookie.com/embed/${id}`} title="YouTube video" className="w-full h-full" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
    </div>
  );
}

// ─── Auto-growing textarea ──────────────────────────────────────────────────

function AutoTextarea({ ref, className, value, ...props }: React.ComponentProps<"textarea">) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  return (
    <textarea {...props} value={value} rows={1}
      ref={(el) => { inner.current = el; if (typeof ref === "function") ref(el); else if (ref) ref.current = el; }}
      className={cn("block w-full resize-none overflow-hidden bg-transparent p-0 border-0 rounded-none shadow-none outline-none",
        "focus:shadow-none focus:outline-none focus-visible:outline-none", "placeholder:text-muted-foreground/50 text-foreground", className)} />
  );
}

function isSingleVisualLine(el: HTMLTextAreaElement): boolean {
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
  return el.scrollHeight < lineHeight * 1.6;
}

// ─── Menus ──────────────────────────────────────────────────────────────────

function SlashMenu({ options, activeIndex, onHover, onSelect }: { options: BlockType[]; activeIndex: number; onHover: (i: number) => void; onSelect: (t: BlockType) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" }); }, [activeIndex]);
  const media = new Set<BlockType>(["image", "bookmark", "video"]);
  return (
    <div ref={listRef} role="listbox" data-no-select className="absolute left-10 sm:left-14 top-full z-30 mt-1 w-[min(18rem,calc(100vw-3rem))] max-h-80 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-lg">
      {options.map((t, i) => {
        const Icon = ICONS[t];
        const header = i === 0 ? (media.has(t) ? "Media" : "Basic blocks") : media.has(t) && !media.has(options[i - 1]) ? "Media" : null;
        return (
          <div key={t}>
            {header && <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium text-muted-foreground">{header}</p>}
            <button type="button" data-index={i} role="option" aria-selected={i === activeIndex}
              onMouseEnter={() => onHover(i)} onMouseDown={(e) => { e.preventDefault(); onSelect(t); }}
              className={cn("w-full flex items-center gap-3 rounded-lg px-2 py-1.5 text-left", i === activeIndex ? "bg-accent" : "hover:bg-accent/60")}>
              <span className="w-9 h-9 shrink-0 rounded-md border border-border bg-background flex items-center justify-center"><Icon className="w-4 h-4 text-foreground/80" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{BLOCK_META[t].label}</span>
                <span className="block text-xs text-muted-foreground truncate">{BLOCK_META[t].hint}</span>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function MenuItem({ icon: Icon, label, hint, onClick, danger, disabled }: { icon: React.ComponentType<{ className?: string }>; label: string; hint?: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn("w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm disabled:opacity-40", danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-accent")}>
      <Icon className="w-4 h-4 text-muted-foreground" /><span className="flex-1 text-left">{label}</span>{hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </button>
  );
}

function BlockActionMenu({ block, canUp, canDown, onClose, onTurnInto, onColor, onIndent, onMove, onCopyText, onCopyMd, onDuplicate, onReplaceImage, onDelete }: {
  block: Block; canUp: boolean; canDown: boolean; onClose: () => void; onTurnInto: (t: BlockType) => void; onColor: (p: Partial<Block>) => void; onIndent: (d: number) => void;
  onMove: (d: -1 | 1) => void; onCopyText: () => void; onCopyMd: () => void; onDuplicate: () => void; onReplaceImage?: () => void; onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"actions" | "turn" | "color">("actions");
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div ref={ref} data-no-select className="absolute left-0 top-7 z-30 w-[min(16rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-1.5 shadow-lg">
      <div className="flex gap-1 px-0.5 pb-1">
        {(["actions", "turn", "color"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={cn("flex-1 rounded-md py-1 text-xs inline-flex items-center justify-center gap-1", tab === t ? "bg-accent font-medium" : "text-muted-foreground")}>
            {t === "color" && <Palette className="w-3 h-3" />}{t === "actions" ? "Actions" : t === "turn" ? "Turn into" : "Color"}
          </button>
        ))}
      </div>
      {tab === "actions" && (
        <div>
          <MenuItem icon={Copy} label="Duplicate" hint="Ctrl+D" onClick={onDuplicate} />
          <MenuItem icon={ArrowUp} label="Move up" hint="Ctrl+⇧+↑" onClick={() => onMove(-1)} disabled={!canUp} />
          <MenuItem icon={ArrowDown} label="Move down" hint="Ctrl+⇧+↓" onClick={() => onMove(1)} disabled={!canDown} />
          {INDENTABLE.has(block.type) && <MenuItem icon={IndentIncrease} label="Indent" hint="Tab" onClick={() => onIndent(1)} disabled={(block.indent ?? 0) >= 3} />}
          {INDENTABLE.has(block.type) && <MenuItem icon={IndentDecrease} label="Outdent" hint="⇧+Tab" onClick={() => onIndent(-1)} disabled={!block.indent} />}
          <MenuItem icon={ClipboardCopy} label={block.type === "image" || block.type === "bookmark" || block.type === "video" ? "Copy link" : "Copy text"} onClick={onCopyText} />
          <MenuItem icon={FileDown} label="Copy as Markdown" onClick={onCopyMd} />
          {onReplaceImage && <MenuItem icon={ImageIcon} label="Replace image" onClick={onReplaceImage} />}
          <div className="my-1 h-px bg-border" />
          <MenuItem icon={Trash2} label="Delete" hint="Del" onClick={onDelete} danger />
        </div>
      )}
      {tab === "turn" && (
        <div className="max-h-64 overflow-y-auto">
          {BLOCK_TYPES.filter((t) => t !== "divider" && t !== "image" && t !== "bookmark" && t !== "video").map((t) => {
            const Icon = ICONS[t];
            return (
              <button key={t} type="button" onClick={() => onTurnInto(t)} className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <Icon className="w-4 h-4 text-muted-foreground" /><span className="flex-1 text-left">{BLOCK_META[t].label}</span>{t === block.type && <Check className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      )}
      {tab === "color" && (
        <div className="max-h-72 overflow-y-auto px-1">
          <p className="px-1 pt-1 pb-1 text-[11px] font-medium text-muted-foreground">Text</p>
          <div className="grid grid-cols-5 gap-1">
            {BLOCK_COLORS.map((c) => (
              <button key={c} type="button" title={c} onClick={() => onColor({ color: c === "default" ? undefined : c })}
                className={cn("h-8 rounded-md border text-sm font-semibold", (block.color ?? "default") === c ? "border-foreground" : "border-border")} style={{ color: SWATCH[c] }}>A</button>
            ))}
          </div>
          <p className="px-1 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">Background</p>
          <div className="grid grid-cols-5 gap-1 pb-1">
            {BLOCK_COLORS.map((c) => (
              <button key={c} type="button" title={c} onClick={() => onColor({ bg: c === "default" ? undefined : c })}
                className={cn("h-8 rounded-md border", BG_COLOR[c], (block.bg ?? "default") === c ? "border-foreground" : "border-border")} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
