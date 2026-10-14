"use client";

// Shared memory (claude-mem's model): what every agent knows about you and what
// you're building. Captured on its own — your answers to agents, results you
// accept, project goals, and "about you" from your Galaxus data — and you can
// add, pin or forget anything here. Pinned memories go into every agent's brief.

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Brain, ExternalLink, Loader2, Pin, PinOff, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, btnGhost, btnPrimary, field } from "@/components/ops/ops-dialog";
import { addMemoryC, forgetMemoryC, getMemories, pinMemoryC, refreshAboutMemoryC } from "@/lib/client/ops";

type Memory = Awaited<ReturnType<typeof getMemories>>[number];
const TYPES = ["about", "goal", "decision", "finding", "preference", "note", "direction"] as const;
const TINT: Record<string, string> = {
  about: "bg-sky-400/15 text-sky-100", goal: "bg-emerald-400/15 text-emerald-100", decision: "bg-amber-400/15 text-amber-100",
  finding: "bg-violet-400/15 text-violet-100", preference: "bg-rose-400/15 text-rose-100", note: "bg-white/10 text-white/80",
  direction: "bg-[#6b8afd]/20 text-[#c7d2ff]",
};
const SOURCE = (s: string) => s.startsWith("answer:") ? "your answer" : s.startsWith("deliverable:") ? "accepted result" : s.startsWith("project") ? "project"
  : s.startsWith("direction:") ? "your direction to the Chief"
  : s.startsWith("galaxus:") ? "from Galaxus" : s.startsWith("you:") ? "you" : s.startsWith("agent:") ? "an agent" : "MCP";

export function MemoryDialog({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Memory[] | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ type: "preference", title: "", body: "" });
  const [busy, start] = useTransition();
  const load = () => getMemories().then(setItems).catch((e) => toast.error((e as Error).message));
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (items ?? []).filter((m) => (type === "all" || m.type === type) && w.every((x) => `${m.title} ${m.body}`.toLowerCase().includes(x)));
  }, [items, q, type]);
  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => { try { await fn(); if (ok) toast.success(ok); await load(); } catch (e) { toast.error((e as Error).message); } });

  return (
    <Dialog wide onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><Brain className="w-4 h-4 text-[#8ea6ff]" /> Shared memory</span>}
      sub="What every agent knows about you and what you're building. Pinned items go into every agent's brief; the rest is found by search (mem_search).">
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memories…" className={cn(field, "flex-1 min-w-[12rem]")} />
        <select value={type} onChange={(e) => setType(e.target.value)} className={cn(field, "w-auto")}>
          <option value="all">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button disabled={busy} onClick={() => run(() => refreshAboutMemoryC(), "Refreshed from your Galaxus data.")} className={btnGhost} title="Rebuild “About you” from your goals, gigs, game and projects">
          <RefreshCw className="w-4 h-4" /> About me
        </button>
        <button onClick={() => setAdding((a) => !a)} className={btnPrimary}>Add</button>
      </div>

      {adding && (
        <div className="mt-3 rounded-xl border border-white/10 p-3 space-y-2">
          <div className="flex gap-2">
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} className={cn(field, "w-auto")}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Short title, e.g. “I don't do cold calls”" className={field} />
          </div>
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={3} placeholder="A sentence or two every agent should know." className={field} />
          <div className="flex justify-end">
            <button disabled={busy} className={btnPrimary} onClick={() => run(async () => { await addMemoryC(draft); setDraft({ type: draft.type, title: "", body: "" }); setAdding(false); }, "Remembered.")}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}Remember
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {items == null && <p className="text-sm text-white/50 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>}
        {items && shown.length === 0 && <p className="text-sm text-white/55">{items.length ? "Nothing matches." : "Nothing yet. Answer an agent's question, accept a result, or start a project: it's remembered automatically."}</p>}
        {shown.map((m) => (
          <div key={m.id} className={cn("rounded-xl border px-3 py-2", m.pinned ? "border-[#6b8afd]/40 bg-[#6b8afd]/[0.06]" : "border-white/10")}>
            <div className="flex items-start gap-2">
              <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold", TINT[m.type] ?? TINT.note)}>{m.type}</span>
              <p className="text-sm font-medium flex-1 min-w-0">{m.title}</p>
              <button disabled={busy} onClick={() => run(() => pinMemoryC(m.id, !m.pinned))} title={m.pinned ? "Unpin" : "Pin: every agent sees it"} className="h-7 w-7 rounded-lg hover:bg-white/10 inline-flex items-center justify-center text-white/70">
                {m.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              </button>
              <button disabled={busy} onClick={() => run(() => forgetMemoryC(m.id), "Forgotten.")} title="Forget" className="h-7 w-7 rounded-lg hover:bg-white/10 inline-flex items-center justify-center text-rose-300">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-white/70 whitespace-pre-wrap break-words line-clamp-4">{m.body}</p>
            <p className="mt-1 text-[10px] text-white/40">{SOURCE(m.source)} · {new Date(m.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-white/[0.03] border border-white/10 p-3 text-[11px] text-white/60">
        <p><b className="text-white/80">Agents use it through MCP:</b> mem_search → mem_timeline → mem_get (3 steps, so they only read what they need), and mem_remember to save.</p>
        <p className="mt-1">For memory across your own coding sessions on your PC, also install <a href="https://github.com/thedotmack/claude-mem" target="_blank" rel="noopener noreferrer" className="text-[#8ea6ff] hover:underline inline-flex items-center gap-0.5">claude-mem <ExternalLink className="w-3 h-3" /></a>: <code className="font-mono text-white/80">npx claude-mem install</code>. It remembers code-level context locally; Galaxus memory is what your whole facility shares.</p>
      </div>
    </Dialog>
  );
}
