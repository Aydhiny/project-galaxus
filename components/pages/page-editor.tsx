"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Star, Trash2, Plus, FileText, Smile, ChevronRight, Download, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadPageImage } from "@/lib/client/page-images";
import { cn } from "@/lib/utils";
import { BlockEditor } from "@/components/editor/block-editor";
import { savePage, deletePage, toggleFavoritePage, createPage, type PageSummary } from "@/lib/actions/pages";
import { blocksToMarkdown, todoProgress, type Block } from "@/lib/blocks";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Notion-style covers: a few calm gradients, or your own image.
const COVERS: Record<string, string> = {
  dusk: "linear-gradient(120deg,#1e1b4b,#7c3aed 55%,#f472b6)",
  ocean: "linear-gradient(120deg,#0f172a,#0369a1 50%,#22d3ee)",
  forest: "linear-gradient(120deg,#052e16,#15803d 55%,#a3e635)",
  sand: "linear-gradient(120deg,#78350f,#d97706 50%,#fde68a)",
  ink: "linear-gradient(120deg,#09090b,#3f3f46 60%,#a1a1aa)",
  rose: "linear-gradient(120deg,#4c0519,#e11d48 55%,#fda4af)",
};

const EMOJIS = [
  "📄", "📝", "✅", "📌", "🎯", "🚀", "💡", "📚", "🧠", "💪", "🏋️", "🕌",
  "🎵", "🎧", "🎨", "🎮", "💻", "🛠️", "📈", "💰", "🗓️", "⏰", "🌱", "🔥",
  "⭐", "❤️", "🌙", "☀️", "✈️", "🏠", "🍽️", "🧘",
];

type SaveState = "saved" | "saving" | "unsaved" | "error";

interface PageEditorProps {
  page: { id: number; title: string; icon: string | null; isFavorite: boolean; blocks: Block[]; cover: string | null };
  breadcrumbs: PageSummary[];
  subpages: PageSummary[];
}

export function PageEditor({ page, breadcrumbs, subpages }: PageEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [favorite, setFavorite] = useState(page.isFavorite);
  const [progress, setProgress] = useState(() => todoProgress(page.blocks));
  const [cover, setCover] = useState(page.cover);
  const [coverMenu, setCoverMenu] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const latestBlocks = useRef<Block[]>(page.blocks);
  const coverInput = useRef<HTMLInputElement>(null);
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
    latestBlocks.current = blocks;
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

  function setPageCover(c: string | null) { setCover(c); setCoverMenu(false); queue({ cover: c }, 0); }

  function exportMarkdown() {
    const md = blocksToMarkdown(title, latestBlocks.current);
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${(title || "Untitled").replace(/[^\w\- ]+/g, "").trim() || "page"}.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function focusFirstBlock() {
    const first = document.querySelector<HTMLTextAreaElement>("[data-page-body] textarea");
    first?.focus();
    first?.setSelectionRange(0, 0);
  }

  const coverStyle = cover?.startsWith("grad:") ? { background: COVERS[cover.slice(5)] ?? COVERS.dusk } : cover ? { backgroundImage: `url(${cover})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined;

  return (
    <>
    {cover && (
      <div className="relative h-44 md:h-56 w-full group/cover" style={coverStyle}>
        <div className="absolute bottom-3 right-4 flex gap-1.5 opacity-0 group-hover/cover:opacity-100 transition-opacity">
          <button onClick={() => setCoverMenu((v) => !v)} className="h-8 px-3 rounded-md bg-black/55 text-white text-xs backdrop-blur">Change cover</button>
          <button onClick={() => setPageCover(null)} className="h-8 px-3 rounded-md bg-black/55 text-white text-xs backdrop-blur">Remove</button>
        </div>
      </div>
    )}
    <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={async (e) => {
      const f = e.target.files?.[0]; e.target.value = "";
      if (!f) return;
      setCoverBusy(true);
      try { setPageCover(await uploadPageImage(f)); } catch (err) { toast.error((err as Error).message); }
      setCoverBusy(false);
    }} />
    <div className="max-w-[46rem] mx-auto px-4 sm:px-6 md:px-16 pt-6 sm:pt-10 md:pt-14 pb-24 relative">
      {coverMenu && (
        <div className="absolute z-40 right-6 md:right-16 top-2 w-72 rounded-xl border border-border bg-popover p-3 shadow-lg">
          <p className="text-[11px] font-medium text-muted-foreground mb-2">Gradients</p>
          <div className="grid grid-cols-3 gap-1.5">
            {Object.entries(COVERS).map(([k, g]) => <button key={k} onClick={() => setPageCover(`grad:${k}`)} className="h-12 rounded-md ring-offset-2 hover:ring-2 ring-foreground/40" style={{ background: g }} aria-label={k} />)}
          </div>
          <button onClick={() => coverInput.current?.click()} disabled={coverBusy} className="mt-3 w-full h-9 rounded-md border border-border text-sm inline-flex items-center justify-center gap-1.5 hover:bg-accent disabled:opacity-50">
            {coverBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} Upload an image
          </button>
        </div>
      )}
      {/* Top bar: breadcrumbs + status + actions */}
      <div className="flex items-center gap-1 sm:gap-2 mb-6 sm:mb-10 text-sm text-muted-foreground min-h-7">
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
        {!cover && (
          <button onClick={() => setCoverMenu((v) => !v)} className="h-7 px-2 flex items-center gap-1 rounded-md hover:bg-accent hover:text-foreground text-xs" title="Add a cover">
            <ImagePlus className="w-3.5 h-3.5" /> Cover
          </button>
        )}
        <button onClick={exportMarkdown} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-accent hover:text-foreground" aria-label="Export as Markdown" title="Export as Markdown">
          <Download className="w-4 h-4" />
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
        className="block w-full resize-none overflow-hidden bg-transparent p-0 border-0 rounded-none shadow-none outline-none focus:shadow-none focus-visible:outline-none text-[1.9rem] sm:text-[2.5rem] leading-[1.15] font-bold tracking-tight placeholder:text-muted-foreground/40 mb-2"
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

      <div className="mt-6 pl-6 sm:pl-0" data-page-body>
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
    </>
  );
}
