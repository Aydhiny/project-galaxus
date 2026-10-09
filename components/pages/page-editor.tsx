"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Star, Trash2, Plus, FileText, Smile, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BlockEditor } from "@/components/editor/block-editor";
import { savePage, deletePage, toggleFavoritePage, createPage, type PageSummary } from "@/lib/actions/pages";
import { todoProgress, type Block } from "@/lib/blocks";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const EMOJIS = [
  "📄", "📝", "✅", "📌", "🎯", "🚀", "💡", "📚", "🧠", "💪", "🏋️", "🕌",
  "🎵", "🎧", "🎨", "🎮", "💻", "🛠️", "📈", "💰", "🗓️", "⏰", "🌱", "🔥",
  "⭐", "❤️", "🌙", "☀️", "✈️", "🏠", "🍽️", "🧘",
];

type SaveState = "saved" | "saving" | "unsaved" | "error";

interface PageEditorProps {
  page: { id: number; title: string; icon: string | null; isFavorite: boolean; blocks: Block[] };
  breadcrumbs: PageSummary[];
  subpages: PageSummary[];
}

export function PageEditor({ page, breadcrumbs, subpages }: PageEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [favorite, setFavorite] = useState(page.isFavorite);
  const [progress, setProgress] = useState(() => todoProgress(page.blocks));
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // ── Autosave ──────────────────────────────────────────────────────────────
  // Changes are debounced, and saves are chained on one promise so they reach
  // the server strictly in order. Without the chain, a slow older request
  // could land after a newer one and silently overwrite fresher content.
  const pendingPatch = useRef<Parameters<typeof savePage>[1]>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const patch = pendingPatch.current;
    if (Object.keys(patch).length === 0) return;
    pendingPatch.current = {};
    setSaveState("saving");
    chain.current = chain.current
      .then(() => savePage(page.id, patch))
      .then(() => {
        if (Object.keys(pendingPatch.current).length === 0) setSaveState("saved");
        // Title/icon changes show up in the page tree, which lives in the server layout.
        if (patch.title !== undefined || patch.icon !== undefined) router.refresh();
      })
      .catch(() => setSaveState("error"));
  }, [page.id, router]);

  const queue = useCallback((patch: Parameters<typeof savePage>[1], delay = 700) => {
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    setSaveState("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [flush]);

  // Flush when leaving the page; warn if the tab closes mid-save.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pendingPatch.current).length > 0) { flush(); e.preventDefault(); }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => { window.removeEventListener("beforeunload", onBeforeUnload); flush(); };
  }, [flush]);

  const handleBlocks = useCallback((blocks: Block[]) => {
    setProgress(todoProgress(blocks));
    queue({ blocks });
  }, [queue]);

  // Focus the title on brand-new pages.
  useEffect(() => {
    if (!page.title && page.blocks.length <= 1 && !page.blocks[0]?.text) titleRef.current?.focus();
  }, [page.title, page.blocks]);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [title]);

  function focusFirstBlock() {
    const first = document.querySelector<HTMLTextAreaElement>("[data-page-body] textarea");
    first?.focus();
    first?.setSelectionRange(0, 0);
  }

  return (
    <div className="max-w-[46rem] mx-auto px-6 md:px-16 pt-10 md:pt-14 pb-24">
      {/* Top bar: breadcrumbs + status + actions */}
      <div className="flex items-center gap-2 mb-10 text-sm text-muted-foreground min-h-7">
        <nav className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
          <Link href="/pages" className="hover:text-foreground shrink-0">Pages</Link>
          {breadcrumbs.map((b) => (
            <span key={b.id} className="flex items-center gap-1 min-w-0">
              <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
              <Link href={`/pages/${b.id}`} className="hover:text-foreground truncate">
                {b.icon ? `${b.icon} ` : ""}{b.title || "Untitled"}
              </Link>
            </span>
          ))}
        </nav>
        <span className={cn("text-xs shrink-0 tabular-nums", saveState === "error" && "text-destructive")}>
          {saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Edited" : saveState === "error" ? "Couldn't save — retrying on next edit" : "Saved"}
        </span>
        <button
          onClick={() => { setFavorite(!favorite); toggleFavoritePage(page.id); }}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-accent hover:text-foreground"
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          title={favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={cn("w-4 h-4", favorite && "fill-amber-400 text-amber-400")} />
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive"
          aria-label="Delete page"
          title="Delete page"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Icon */}
      <div className="relative group/icon">
        {icon ? (
          <button onClick={() => setEmojiOpen(!emojiOpen)} className="text-[3.25rem] leading-none mb-3 rounded-lg hover:bg-accent p-1 -ml-1">
            {icon}
          </button>
        ) : (
          <button
            onClick={() => setEmojiOpen(!emojiOpen)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground opacity-0 group-hover/icon:opacity-100 focus:opacity-100 hover:text-foreground mb-2 transition-opacity"
          >
            <Smile className="w-4 h-4" /> Add icon
          </button>
        )}
        {emojiOpen && (
          <div className="absolute z-30 top-full left-0 mt-1 w-[19rem] rounded-xl border border-border bg-popover p-2 shadow-lg">
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => { setIcon(e); setEmojiOpen(false); queue({ icon: e }, 0); }}
                  className="h-8 rounded-md text-lg hover:bg-accent"
                >
                  {e}
                </button>
              ))}
            </div>
            {icon && (
              <button
                onClick={() => { setIcon(null); setEmojiOpen(false); queue({ icon: null }, 0); }}
                className="mt-2 w-full rounded-md py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Remove icon
              </button>
            )}
          </div>
        )}
      </div>

      {/* Title */}
      <textarea
        ref={titleRef}
        value={title}
        rows={1}
        placeholder="Untitled"
        onChange={(e) => { const t = e.target.value.replace(/\n/g, ""); setTitle(t); queue({ title: t }); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); focusFirstBlock(); }
        }}
        className="block w-full resize-none overflow-hidden bg-transparent p-0 border-0 rounded-none shadow-none outline-none focus:shadow-none focus-visible:outline-none text-[2.5rem] leading-[1.15] font-bold tracking-tight placeholder:text-muted-foreground/40 mb-2"
        style={{ fontFamily: "var(--font-heading)" }}
      />

      {progress.total > 0 && (
        <div className="flex items-center gap-2.5 mb-4 text-xs text-muted-foreground">
          <div className="h-1 w-28 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          {progress.done}/{progress.total} done
        </div>
      )}

      <div className="mt-6 pl-0" data-page-body>
        <BlockEditor
          initialBlocks={page.blocks}
          onChange={handleBlocks}
          onExitTop={() => titleRef.current?.focus()}
        />
      </div>

      {/* Sub-pages */}
      <div className="mt-2 border-t border-border pt-4">
        {subpages.map((s) => (
          <Link key={s.id} href={`/pages/${s.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 -mx-2 text-sm hover:bg-accent">
            <span className="w-5 text-center">{s.icon ?? <FileText className="w-4 h-4 inline text-muted-foreground" />}</span>
            <span className="underline decoration-border underline-offset-4">{s.title || "Untitled"}</span>
          </Link>
        ))}
        <button
          disabled={pending}
          onClick={() => startTransition(async () => { flush(); const id = await createPage(page.id); router.push(`/pages/${id}`); })}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 -mx-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Add a sub-page
        </button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title || "Untitled"}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the page{subpages.length > 0 ? ` and its ${subpages.length} sub-page${subpages.length > 1 ? "s" : ""}` : ""}. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => startTransition(async () => {
                // Drop any queued autosave so it can't run against a deleted row.
                pendingPatch.current = {};
                if (timer.current) clearTimeout(timer.current);
                await deletePage(page.id);
                router.push(breadcrumbs.length > 0 ? `/pages/${breadcrumbs[breadcrumbs.length - 1].id}` : "/pages");
              })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
