"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { BookHeart, Eye, EyeOff, Loader2, Lock, PenLine, Search, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOODS, moodOf, onThisDay, parseImport, wordCount } from "@/lib/diary";
import { deleteDiaryEntryC, finishDiaryImport, importDiaryChunkC, saveDiaryEntryC, type DiaryEntry } from "@/lib/client/diary";

const hud = "font-hud uppercase tracking-wide";

export function DiaryView({ entries }: { entries: DiaryEntry[] }) {
  const [q, setQ] = useState("");
  const [year, setYear] = useState<string>("all");
  const [hidden, setHidden] = useState(true); // privacy blur until you choose to read
  const [open, setOpen] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const [now] = useState(() => new Date());
  const years = useMemo(() => [...new Set(entries.map((e) => e.date.slice(0, 4)))].sort().reverse(), [entries]);
  const memories = useMemo(() => onThisDay(entries.filter((e) => !e.locked), now), [entries, now]);
  const list = entries.filter((e) => (year === "all" || e.date.startsWith(year)) && (!q || `${e.title} ${e.content}`.toLowerCase().includes(q.toLowerCase())));
  const words = useMemo(() => entries.reduce((s, e) => s + wordCount(e.content), 0), [entries]);

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400 flex items-center justify-center"><BookHeart className="w-5 h-5" /></span>
            Diary
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{entries.length} entries · {words.toLocaleString()} words · encrypted, never sent to AI.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setHidden((h) => !h)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm" title="Privacy blur">
            {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {hidden ? "Hidden" : "Visible"}
          </button>
          <ImportButton />
          <button onClick={() => setWriting(true)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium">
            <PenLine className="w-4 h-4" /> Write
          </button>
        </div>
      </header>

      {writing && <Editor onDone={() => setWriting(false)} />}

      {memories.length > 0 && (
        <section className="mt-6 rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-4">
          <p className={cn("text-sm", hud)}>On this day</p>
          <ul className="mt-2 space-y-1">
            {memories.map((e) => (
              <li key={e.id}><button onClick={() => { setOpen(e.id); setHidden(false); }} className="text-sm hover:underline text-left">
                {e.date.slice(0, 4)} · {moodOf(e.mood)?.emoji} {e.title || "Untitled"} <span className="text-muted-foreground">— {now.getFullYear() - Number(e.date.slice(0, 4))} year{now.getFullYear() - Number(e.date.slice(0, 4)) === 1 ? "" : "s"} ago</span>
              </button></li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your diary" className="w-full h-9 rounded-lg border border-border bg-transparent pl-8 pr-3 text-sm" />
        </div>
        {["all", ...years].map((y) => (
          <button key={y} onClick={() => setYear(y)} className={cn("h-8 px-3 rounded-full text-sm border", year === y ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>{y === "all" ? "All" : y}</button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Empty for now. Write your first entry, or import your MyDiary master file (galaxus-diary-import.json).
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {list.map((e) => <EntryCard key={e.id} e={e} hidden={hidden} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />)}
        </ul>
      )}
    </div>
  );
}

function EntryCard({ e, hidden, open, onToggle }: { e: DiaryEntry; hidden: boolean; open: boolean; onToggle: () => void }) {
  const mood = moodOf(e.mood);
  const [editing, setEditing] = useState(false);
  if (editing) return <li><Editor entry={e} onDone={() => setEditing(false)} /></li>;
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <button onClick={onToggle} disabled={e.locked} className="w-full text-left flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5" title={mood?.label}>{e.locked ? "✉️" : mood?.emoji ?? "📝"}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-medium truncate">{e.title || "Untitled"}</span>
          <span className="block text-[11px] text-muted-foreground" suppressHydrationWarning>
            {format(new Date(e.date), "EEEE, d MMMM yyyy")}
            {e.locked && e.unlockAt && <> · <Lock className="w-3 h-3 inline -mt-0.5" /> opens {format(new Date(e.unlockAt), "d MMM yyyy")}</>}
          </span>
          {!open && !e.locked && <span className={cn("block mt-1 text-sm text-muted-foreground line-clamp-2", hidden && "blur-sm select-none")}>{e.content}</span>}
        </span>
      </button>
      {open && !e.locked && (
        <div className="mt-3">
          <p className={cn("text-[15px] leading-relaxed whitespace-pre-line", hidden && "blur-sm select-none")}>{e.content}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setEditing(true)} className="h-8 px-3 rounded-lg border border-border text-xs">Edit</button>
            <button onClick={() => { if (confirm("Delete this entry permanently?")) deleteDiaryEntryC(e.id).catch((x) => toast.error((x as Error).message)); }}
              className="h-8 px-3 rounded-lg text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          </div>
        </div>
      )}
    </li>
  );
}

function Editor({ entry, onDone }: { entry?: DiaryEntry; onDone: () => void }) {
  const [title, setTitle] = useState(entry?.title ?? "");
  const [content, setContent] = useState(entry?.content ?? "");
  const [mood, setMood] = useState<string | null>(entry?.mood ?? "mood_basic_002");
  const [sealed, setSealed] = useState(false);
  const [unlockAt, setUnlockAt] = useState("");
  const [pending, start] = useTransition();
  // Gentle nudge when the inner critic takes over (words you'd never say to a friend).
  const harsh = /\b(retard|retardiran|glup si|pizd|picka|luzer|propalitet|bolestan sam)\w*/i.test(content);
  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-4 animate-in fade-in-0">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full bg-transparent text-lg font-medium outline-none" />
      <div className="mt-2 flex flex-wrap gap-1">
        {MOODS.map((m) => (
          <button key={m.key} onClick={() => setMood(m.key)} title={m.label}
            className={cn("w-9 h-9 rounded-lg text-xl", mood === m.key ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-muted")}>{m.emoji}</button>
        ))}
      </div>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} autoFocus placeholder="Dragi dnevniče…"
        className="mt-3 w-full rounded-xl border border-border bg-transparent p-3 text-[15px] leading-relaxed" />
      {harsh && (
        <p className="mt-2 text-xs rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-200 p-2">
          Would you say this to Amer if he wrote it? Try writing the next line the way your future self wrote to you in January: &quot;Volim te brate moj.&quot;
        </p>
      )}
      {!entry && (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={sealed} onChange={(e) => setSealed(e.target.checked)} /> Letter to my future self — sealed until
          <input type="date" value={unlockAt} onChange={(e) => setUnlockAt(e.target.value)} disabled={!sealed} className="input-base w-40 disabled:opacity-40" />
        </label>
      )}
      <div className="mt-3 flex gap-2">
        <button disabled={pending || !content.trim() || (sealed && !unlockAt)}
          onClick={() => start(async () => {
            try {
              await saveDiaryEntryC(entry?.id ?? null, { title, content, mood, unlockAt: sealed ? unlockAt : null });
              toast.success(sealed ? "Sealed. It opens on that day." : "Saved.");
              onDone();
            } catch (e) { toast.error((e as Error).message); }
          })}
          className="h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
        <button onClick={onDone} className="h-9 px-3 rounded-lg border border-border text-sm">Cancel</button>
      </div>
    </div>
  );
}

/** Import the master file (or raw MyDiary JSON files) — sent in chunks, safe to run twice. */
function ImportButton() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function run(files: FileList | null) {
    if (!files?.length) return;
    try {
      const all = [];
      for (const f of [...files]) all.push(...parseImport(JSON.parse(await f.text())));
      if (all.length === 0) throw new Error("No diary entries found in that file.");
      let added = 0, skipped = 0;
      for (let i = 0; i < all.length; i += 20) {
        setBusy(`${Math.min(i + 20, all.length)}/${all.length}`);
        const r = await importDiaryChunkC(all.slice(i, i + 20));
        added += r.added; skipped += r.skipped;
      }
      await finishDiaryImport();
      toast.success(`Imported ${added} entries${skipped ? ` (${skipped} already there)` : ""}.`);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
    if (input.current) input.current.value = "";
  }
  return (
    <>
      <button onClick={() => input.current?.click()} disabled={!!busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm disabled:opacity-60">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {busy ?? "Import"}
      </button>
      <input ref={input} type="file" accept="application/json,.json" multiple hidden onChange={(e) => run(e.target.files)} />
    </>
  );
}
