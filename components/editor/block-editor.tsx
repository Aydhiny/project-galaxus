"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  GripVertical, Plus, Trash2, Copy, Type, Heading1, Heading2, Heading3, CheckSquare,
  List, ListOrdered, Quote, Lightbulb, Code2, Minus, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BLOCK_META, BLOCK_TYPES, CONTINUING_TYPES, createBlock, listNumber, matchShortcut,
  type Block, type BlockType,
} from "@/lib/blocks";

/*
  Design note — why one <textarea> per block instead of one big contentEditable:
  React and contentEditable fight over who owns the DOM (caret jumps, lost
  input on re-render). A textarea per block keeps React fully in control, gives
  us exact caret positions via selectionStart, and native undo per block. The
  tradeoff is no inline rich text (bold/links inside a line) — block-level
  structure is what matters for a productivity tool, and inline marks can be
  added later as a markdown-ish layer if wanted.
*/

const ICONS: Record<BlockType, React.ComponentType<{ className?: string }>> = {
  paragraph: Type, h1: Heading1, h2: Heading2, h3: Heading3, todo: CheckSquare,
  bullet: List, numbered: ListOrdered, quote: Quote, callout: Lightbulb, code: Code2, divider: Minus,
};

const PLACEHOLDER: Partial<Record<BlockType, string>> = {
  paragraph: "Type '/' for commands",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  todo: "To-do",
  bullet: "List",
  numbered: "List",
  quote: "Quote",
  callout: "Write a note…",
  code: "Code",
};

const TEXT_CLASS: Record<BlockType, string> = {
  paragraph: "text-[15px] leading-7",
  h1: "text-[1.9rem] leading-tight font-bold tracking-tight",
  h2: "text-[1.45rem] leading-snug font-semibold tracking-tight",
  h3: "text-[1.15rem] leading-snug font-semibold",
  todo: "text-[15px] leading-7",
  bullet: "text-[15px] leading-7",
  numbered: "text-[15px] leading-7",
  quote: "text-[15px] leading-7",
  callout: "text-[15px] leading-7",
  code: "font-mono text-[13px] leading-6",
  divider: "",
};

const ROW_SPACING: Partial<Record<BlockType, string>> = {
  h1: "mt-6 first:mt-0",
  h2: "mt-5 first:mt-0",
  h3: "mt-3 first:mt-0",
  callout: "my-1",
  code: "my-1",
  quote: "my-0.5",
};

type CaretTarget = "start" | "end" | number;

interface BlockEditorProps {
  initialBlocks: Block[];
  onChange: (blocks: Block[]) => void;
  /** Called when the user presses ArrowUp in the first block (e.g. to jump to the title). */
  onExitTop?: () => void;
  autoFocus?: boolean;
}

export function BlockEditor({ initialBlocks, onChange, onExitTop, autoFocus }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>(() =>
    initialBlocks.length > 0 ? initialBlocks : [createBlock("paragraph")]
  );
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ id: string; caret: CaretTarget } | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Slash menu: open for one block at a time, filtered by what's typed after "/".
  const [slash, setSlash] = useState<{ blockId: string; query: string; index: number } | null>(null);
  // Block action menu (opened from the grip handle).
  const [actionMenuFor, setActionMenuFor] = useState<string | null>(null);
  // Drag-and-drop reordering.
  const dragId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "above" | "below" } | null>(null);

  // Notify parent on every change except the initial mount.
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    onChange(blocks);
  }, [blocks, onChange]);

  // Apply queued focus requests after React has committed the new blocks.
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
    if (autoFocus && blocks[0]) focusBlock(blocks[0].id, "end");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function focusBlock(id: string, caret: CaretTarget) {
    pendingFocus.current = { id, caret };
    // Trigger a render so the layout effect runs even if blocks didn't change.
    setFocusedId(id);
  }

  const update = useCallback((id: string, patch: Partial<Block>) => {
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  function insertAfter(index: number, block: Block, focus: CaretTarget = "start") {
    setBlocks((bs) => [...bs.slice(0, index + 1), block, ...bs.slice(index + 1)]);
    focusBlock(block.id, focus);
  }

  function removeBlock(id: string) {
    setBlocks((bs) => {
      const next = bs.filter((b) => b.id !== id);
      return next.length > 0 ? next : [createBlock("paragraph")];
    });
  }

  function changeType(id: string, type: BlockType, text?: string) {
    const index = blocks.findIndex((b) => b.id === id);
    if (index === -1) return;
    if (type === "divider") {
      // A divider has no text to type into — replace this block and continue on a fresh line below.
      const next = createBlock("paragraph");
      setBlocks((bs) => {
        const copy = [...bs];
        copy.splice(index, 1, { id, type: "divider", text: "" }, next);
        return copy;
      });
      focusBlock(next.id, "start");
      return;
    }
    setBlocks((bs) =>
      bs.map((b) =>
        b.id === id
          ? { id: b.id, type, text: text ?? b.text, ...(type === "todo" ? { checked: b.checked ?? false } : {}) }
          : b
      )
    );
    focusBlock(id, "end");
  }

  // ── Slash menu ────────────────────────────────────────────────────────────
  const slashOptions = useMemo(() => {
    if (!slash) return [];
    const q = slash.query.toLowerCase().trim();
    return BLOCK_TYPES.filter((t) => {
      if (!q) return true;
      const m = BLOCK_META[t];
      return m.label.toLowerCase().includes(q) || m.keywords.includes(q);
    });
  }, [slash]);

  function applySlash(type: BlockType) {
    if (!slash) return;
    const id = slash.blockId;
    setSlash(null);
    changeType(id, type, "");
  }

  // ── Text input ────────────────────────────────────────────────────────────
  function handleInput(block: Block, value: string, caret: number) {
    // Markdown shortcuts only fire on plain paragraphs, so typing "- " inside
    // a heading or code block stays literal text.
    if (block.type === "paragraph") {
      const m = matchShortcut(value);
      if (m) {
        if (m.type === "divider") { changeType(block.id, "divider"); return; }
        setBlocks((bs) =>
          bs.map((b) =>
            b.id === block.id
              ? { id: b.id, type: m.type, text: m.text, ...(m.type === "todo" ? { checked: m.checked ?? false } : {}) }
              : b
          )
        );
        // Keep the caret where the user was typing, shifted left by the
        // stripped trigger. (Forcing it to 0 breaks fast typing: if "## Hi"
        // arrives in one go, the caret must land after "Hi", not before it.)
        focusBlock(block.id, Math.max(0, caret - (value.length - m.text.length)));
        setSlash(null);
        return;
      }
    }

    update(block.id, { text: value });

    if (block.type !== "code" && /^\/[\w ]{0,24}$/.test(value)) {
      setSlash((s) => ({ blockId: block.id, query: value.slice(1), index: s?.blockId === block.id ? s.index : 0 }));
    } else if (slash?.blockId === block.id) {
      setSlash(null);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>, block: Block, index: number) {
    if (block.type === "code") return;
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\n")) return;
    e.preventDefault();

    // Multi-line paste → one block per line, honouring markdown prefixes, so
    // pasting a markdown checklist or notes from elsewhere keeps its structure.
    const el = e.currentTarget;
    const before = block.text.slice(0, el.selectionStart);
    const after = block.text.slice(el.selectionEnd);
    const lines = text.replace(/\r\n/g, "\n").split("\n");

    const parsed: Block[] = lines.map((line) => {
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
    const focusTarget = last ?? first;
    focusBlock(focusTarget.id, focusTarget.text.length - after.length);
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, block: Block, index: number) {
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end, value } = el;

    // Slash menu navigation takes priority.
    if (slash?.blockId === block.id && slashOptions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlash({ ...slash, index: (slash.index + 1) % slashOptions.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlash({ ...slash, index: (slash.index - 1 + slashOptions.length) % slashOptions.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applySlash(slashOptions[slash.index]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlash(null);
        return;
      }
    }

    // Cmd/Ctrl+Enter toggles a to-do (or exits a code block).
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (block.type === "todo") update(block.id, { checked: !block.checked });
      else insertAfter(index, createBlock("paragraph"));
      return;
    }

    if (e.key === "Enter" && !e.shiftKey && block.type !== "code") {
      e.preventDefault();
      // Enter on an empty list item exits the list (same as Notion / Google Docs).
      if (CONTINUING_TYPES.has(block.type) && value === "") {
        changeType(block.id, "paragraph");
        return;
      }
      const before = value.slice(0, start);
      const after = value.slice(end);
      const nextType: BlockType = CONTINUING_TYPES.has(block.type) ? block.type : "paragraph";
      update(block.id, { text: before });
      insertAfter(index, createBlock(nextType, after), "start");
      return;
    }

    if (e.key === "Backspace" && start === 0 && end === 0) {
      // First Backspace at the start of a styled block just removes the styling.
      if (block.type !== "paragraph") {
        e.preventDefault();
        changeType(block.id, "paragraph");
        return;
      }
      if (index > 0) {
        e.preventDefault();
        const prev = blocks[index - 1];
        if (prev.type === "divider") { removeBlock(prev.id); return; }
        // Merge this block's text into the previous one.
        update(prev.id, { text: prev.text + value });
        removeBlock(block.id);
        focusBlock(prev.id, prev.text.length);
        return;
      }
      if (value === "" && blocks.length > 1) {
        e.preventDefault();
        removeBlock(block.id);
        focusBlock(blocks[1].id, "start");
      }
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
      if (end === value.length || onLastLine) {
        const next = findTextBlock(index, 1);
        if (next) { e.preventDefault(); focusBlock(next.id, "start"); }
      }
    }
  }

  function findTextBlock(from: number, dir: 1 | -1): Block | undefined {
    for (let i = from + dir; i >= 0 && i < blocks.length; i += dir) {
      if (blocks[i].type !== "divider") return blocks[i];
    }
    return undefined;
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────
  function handleDrop() {
    const from = dragId.current;
    const target = dropTarget;
    dragId.current = null;
    setDropTarget(null);
    if (!from || !target || from === target.id) return;
    setBlocks((bs) => {
      const moving = bs.find((b) => b.id === from);
      if (!moving) return bs;
      const without = bs.filter((b) => b.id !== from);
      const targetIndex = without.findIndex((b) => b.id === target.id);
      const insertAt = target.position === "above" ? targetIndex : targetIndex + 1;
      return [...without.slice(0, insertAt), moving, ...without.slice(insertAt)];
    });
  }

  // Click on empty space under the last block → keep typing at the end.
  function handleTailClick() {
    const last = blocks[blocks.length - 1];
    if (last && last.type === "paragraph" && last.text === "") focusBlock(last.id, "start");
    else insertAfter(blocks.length - 1, createBlock("paragraph"));
  }

  return (
    <div className="relative" onDragEnd={() => { dragId.current = null; setDropTarget(null); }}>
      {blocks.map((block, index) => {
        const isDropAbove = dropTarget?.id === block.id && dropTarget.position === "above";
        const isDropBelow = dropTarget?.id === block.id && dropTarget.position === "below";
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={cn("group/block relative flex items-start -ml-14 pl-14", ROW_SPACING[block.type])}
            onDragOver={(e) => {
              if (!dragId.current) return;
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const position = e.clientY < rect.top + rect.height / 2 ? "above" : "below";
              if (dropTarget?.id !== block.id || dropTarget.position !== position) setDropTarget({ id: block.id, position });
            }}
            onDrop={(e) => { e.preventDefault(); handleDrop(); }}
          >
            {isDropAbove && <div className="absolute left-14 right-0 -top-px h-0.5 rounded bg-primary/70" />}
            {isDropBelow && <div className="absolute left-14 right-0 -bottom-px h-0.5 rounded bg-primary/70" />}

            {/* Hover controls: add + drag handle (also opens the block menu) */}
            <div className={cn(
              "absolute left-0 flex items-center gap-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity",
              block.type === "h1" ? "top-1.5" : block.type === "h2" ? "top-1" : "top-0.5",
              actionMenuFor === block.id && "opacity-100"
            )}>
              <button
                type="button"
                tabIndex={-1}
                aria-label="Add block below"
                onClick={() => {
                  const b = createBlock("paragraph", "/");
                  insertAfter(index, b, "end");
                  setSlash({ blockId: b.id, query: "", index: 0 });
                }}
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.06]"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                tabIndex={-1}
                draggable
                aria-label="Drag to move, click for options"
                onDragStart={(e) => {
                  dragId.current = block.id;
                  e.dataTransfer.effectAllowed = "move";
                  const row = (e.currentTarget as HTMLElement).closest("[data-block-id]");
                  if (row) e.dataTransfer.setDragImage(row, 40, 12);
                }}
                onClick={() => setActionMenuFor((v) => (v === block.id ? null : block.id))}
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="w-4 h-4" />
              </button>
            </div>

            {actionMenuFor === block.id && (
              <BlockActionMenu
                current={block.type}
                onClose={() => setActionMenuFor(null)}
                onTurnInto={(t) => { setActionMenuFor(null); changeType(block.id, t); }}
                onDuplicate={() => {
                  setActionMenuFor(null);
                  insertAfter(index, { ...block, id: createBlock().id }, "end");
                }}
                onDelete={() => {
                  setActionMenuFor(null);
                  const neighbour = findTextBlock(index, -1) ?? findTextBlock(index, 1);
                  removeBlock(block.id);
                  if (neighbour) focusBlock(neighbour.id, "end");
                }}
              />
            )}

            <div className="flex-1 min-w-0 flex items-start">
              {block.type === "divider" ? (
                <div className="w-full py-3"><hr className="border-t border-border" /></div>
              ) : (
                <BlockBody
                  block={block}
                  number={block.type === "numbered" ? listNumber(blocks, index) : 0}
                  focused={focusedId === block.id}
                  onToggle={() => update(block.id, { checked: !block.checked })}
                >
                  <AutoTextarea
                    ref={(el) => { if (el) refs.current.set(block.id, el); else refs.current.delete(block.id); }}
                    value={block.text}
                    placeholder={focusedId === block.id || blocks.length === 1 ? PLACEHOLDER[block.type] : block.type === "paragraph" ? "" : PLACEHOLDER[block.type]}
                    className={cn(
                      TEXT_CLASS[block.type],
                      block.type === "todo" && block.checked && "line-through text-muted-foreground"
                    )}
                    spellCheck={block.type !== "code"}
                    onFocus={() => setFocusedId(block.id)}
                    onBlur={() => {
                      // Delay so a click on a slash-menu item registers before it closes.
                      setTimeout(() => setSlash((s) => (s?.blockId === block.id ? null : s)), 150);
                    }}
                    onChange={(e) => handleInput(block, e.target.value, e.target.selectionStart)}
                    onKeyDown={(e) => handleKeyDown(e, block, index)}
                    onPaste={(e) => handlePaste(e, block, index)}
                  />
                </BlockBody>
              )}
            </div>

            {slash?.blockId === block.id && slashOptions.length > 0 && (
              <SlashMenu
                options={slashOptions}
                activeIndex={Math.min(slash.index, slashOptions.length - 1)}
                onHover={(i) => setSlash({ ...slash, index: i })}
                onSelect={applySlash}
              />
            )}
          </div>
        );
      })}

      {/* Clickable tail — makes the whole area below the doc a "keep writing" target */}
      <div className="h-20 cursor-text" onClick={handleTailClick} />
    </div>
  );
}

// ─── Block chrome (checkbox, bullet, quote bar, …) ─────────────────────────

function BlockBody({ block, number, focused, onToggle, children }: {
  block: Block;
  number: number;
  focused: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  switch (block.type) {
    case "todo":
      return (
        <div className="flex items-start gap-2.5 w-full">
          <button
            type="button"
            role="checkbox"
            aria-checked={!!block.checked}
            onClick={onToggle}
            className={cn(
              "mt-[5px] w-[18px] h-[18px] shrink-0 rounded-[5px] border flex items-center justify-center transition-colors",
              block.checked ? "bg-primary border-primary text-primary-foreground" : "border-foreground/30 hover:border-foreground/50 hover:bg-foreground/[0.04]"
            )}
          >
            {block.checked && <Check className="w-3 h-3" strokeWidth={3} />}
          </button>
          {children}
        </div>
      );
    case "bullet":
      return (
        <div className="flex items-start gap-2 w-full">
          <span className="w-5 shrink-0 text-center leading-7 select-none text-foreground/70">•</span>
          {children}
        </div>
      );
    case "numbered":
      return (
        <div className="flex items-start gap-1.5 w-full">
          <span className="min-w-5 shrink-0 text-right leading-7 select-none tabular-nums text-foreground/70">{number}.</span>
          {children}
        </div>
      );
    case "quote":
      return <div className="w-full border-l-[3px] border-foreground/70 pl-4">{children}</div>;
    case "callout":
      return (
        <div className="w-full flex items-start gap-3 rounded-lg bg-muted px-4 py-3">
          <span className="leading-7 select-none">💡</span>
          {children}
        </div>
      );
    case "code":
      return (
        <div className={cn("w-full rounded-lg bg-muted px-4 py-3 ring-1 ring-transparent", focused && "ring-border")}>
          {children}
        </div>
      );
    default:
      return <div className="w-full">{children}</div>;
  }
}

// ─── Auto-growing textarea ──────────────────────────────────────────────────

function AutoTextarea({ ref, className, value, ...props }: React.ComponentProps<"textarea">) {
  const inner = useRef<HTMLTextAreaElement | null>(null);

  // Resize to content on every value change. Done in a layout effect so the
  // height is correct before paint (no one-frame jump).
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [value]);

  return (
    <textarea
      {...props}
      value={value}
      rows={1}
      ref={(el) => {
        inner.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      className={cn(
        "block w-full resize-none overflow-hidden bg-transparent p-0 border-0 rounded-none shadow-none outline-none",
        "focus:shadow-none focus:outline-none focus-visible:outline-none",
        "placeholder:text-muted-foreground/50 text-foreground",
        className
      )}
    />
  );
}

function isSingleVisualLine(el: HTMLTextAreaElement): boolean {
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
  return el.scrollHeight < lineHeight * 1.6;
}

// ─── Menus ──────────────────────────────────────────────────────────────────

function SlashMenu({ options, activeIndex, onHover, onSelect }: {
  options: BlockType[];
  activeIndex: number;
  onHover: (i: number) => void;
  onSelect: (t: BlockType) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div
      ref={listRef}
      role="listbox"
      className="absolute left-14 top-full z-30 mt-1 w-72 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-lg"
    >
      <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium text-muted-foreground">Basic blocks</p>
      {options.map((t, i) => {
        const Icon = ICONS[t];
        return (
          <button
            key={t}
            type="button"
            data-index={i}
            role="option"
            aria-selected={i === activeIndex}
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => { e.preventDefault(); onSelect(t); }}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg px-2 py-1.5 text-left",
              i === activeIndex ? "bg-accent" : "hover:bg-accent/60"
            )}
          >
            <span className="w-9 h-9 shrink-0 rounded-md border border-border bg-background flex items-center justify-center">
              <Icon className="w-4 h-4 text-foreground/80" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{BLOCK_META[t].label}</span>
              <span className="block text-xs text-muted-foreground truncate">{BLOCK_META[t].hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BlockActionMenu({ current, onClose, onTurnInto, onDuplicate, onDelete }: {
  current: BlockType;
  onClose: () => void;
  onTurnInto: (t: BlockType) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return (
    <div ref={ref} className="absolute left-0 top-7 z-30 w-56 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
      <button type="button" onClick={onDelete} className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-destructive/10 hover:text-destructive">
        <Trash2 className="w-4 h-4" /> Delete
      </button>
      <button type="button" onClick={onDuplicate} className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
        <Copy className="w-4 h-4" /> Duplicate
      </button>
      <div className="my-1 h-px bg-border" />
      <p className="px-2 pt-1 pb-1 text-[11px] font-medium text-muted-foreground">Turn into</p>
      <div className="max-h-56 overflow-y-auto">
        {BLOCK_TYPES.filter((t) => t !== "divider").map((t) => {
          const Icon = ICONS[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => onTurnInto(t)}
              className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Icon className="w-4 h-4 text-muted-foreground" />
              <span className="flex-1 text-left">{BLOCK_META[t].label}</span>
              {t === current && <Check className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
