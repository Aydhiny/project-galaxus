"use client";

// "Use it": a delivered result goes where it belongs in Galaxus.
//   Tasks   — the next steps it lists (you tick which)
//   Page    — the whole result as a page in Pages
//   Lead    — one business into Outreach (audited like any lead; nothing is sent)
//   Reddit  — a draft for your game-promo queue (never posted for you)

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckSquare, ChevronDown, FileText, Loader2, MessageSquare, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { mdLead, mdTasks } from "@/lib/ops";
import { Dialog, btnGhost, btnPrimary, field } from "@/components/ops/ops-dialog";
import { missionToLeadC, missionToPageC, missionToRedditC, missionToTasksC, redditSubsC, type OpsOverview } from "@/lib/client/ops";

type Mission = OpsOverview["missions"][number];
type Which = "tasks" | "lead" | "reddit" | null;

export function UseIt({ m }: { m: Mission }) {
  const [menu, setMenu] = useState(false);
  const [which, setWhich] = useState<Which>(null);
  const [busy, start] = useTransition();
  if (!m.deliverable) return null;

  const toPage = () => start(async () => {
    try {
      const { pageId } = await missionToPageC(m.id);
      toast.success("Saved to Pages.", { action: { label: "Open", onClick: () => { window.location.href = `/pages/${pageId}`; } } });
    } catch (e) { toast.error((e as Error).message); }
    setMenu(false);
  });

  return (
    <div className="relative">
      <button onClick={() => setMenu((o) => !o)} disabled={busy} aria-expanded={menu}
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-medium border border-white/15 text-white/85 hover:bg-white/10">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Use it <ChevronDown className="w-3 h-3" />
      </button>
      {menu && (
        <div className="absolute z-30 left-0 top-8 w-52 rounded-xl bg-[#303136] border border-white/10 p-1 shadow-xl">
          <Item icon={CheckSquare} label="Make tasks" hint="Its next steps → Tasks" onClick={() => { setWhich("tasks"); setMenu(false); }} />
          <Item icon={FileText} label="Save as a page" hint="The whole result → Pages" onClick={toPage} />
          <Item icon={Send} label="Outreach lead" hint="A business → Outreach" onClick={() => { setWhich("lead"); setMenu(false); }} />
          <Item icon={MessageSquare} label="Reddit draft" hint="A post → Reddit drafts" onClick={() => { setWhich("reddit"); setMenu(false); }} />
        </div>
      )}
      {which === "tasks" && <TasksDialog m={m} onClose={() => setWhich(null)} />}
      {which === "lead" && <LeadDialog m={m} onClose={() => setWhich(null)} />}
      {which === "reddit" && <RedditDialog m={m} onClose={() => setWhich(null)} />}
    </div>
  );
}

function Item({ icon: Icon, label, hint, onClick }: { icon: typeof Send; label: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06]">
      <Icon className="w-4 h-4 mt-0.5 text-[#8ea6ff]" />
      <span><span className="block text-xs font-medium text-white">{label}</span><span className="block text-[10px] text-white/50">{hint}</span></span>
    </button>
  );
}

function TasksDialog({ m, onClose }: { m: Mission; onClose: () => void }) {
  const found = mdTasks(m.deliverable!);
  const [items, setItems] = useState(found.map((t) => ({ t, on: true })));
  const [extra, setExtra] = useState("");
  const [busy, start] = useTransition();
  const picked = items.filter((i) => i.on).map((i) => i.t);
  return (
    <Dialog title="Make tasks" sub={found.length ? "Tick the ones you want in Tasks." : "No next steps found in this result. Add your own."} onClose={onClose}>
      <ul className="space-y-1 max-h-64 overflow-y-auto">
        {items.map((it, i) => (
          <li key={i}>
            <label className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04] cursor-pointer">
              <input type="checkbox" checked={it.on} onChange={() => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} className="mt-0.5 accent-[#6b8afd]" />
              <span className="text-sm text-white/85">{it.t}</span>
            </label>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); if (extra.trim()) { setItems((xs) => [...xs, { t: extra.trim(), on: true }]); setExtra(""); } }} className="mt-2 flex gap-1.5">
        <input value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={200} placeholder="Add a task…" className={field} />
        <button className={btnGhost}>Add</button>
      </form>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button disabled={busy || !picked.length} className={btnPrimary}
          onClick={() => start(async () => {
            try { const r = await missionToTasksC(m.id, picked); toast.success(`${r.count} task${r.count === 1 ? "" : "s"} added.`, { action: { label: "Open", onClick: () => { window.location.href = "/tasks"; } } }); onClose(); }
            catch (e) { toast.error((e as Error).message); }
          })}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}Add {picked.length} to Tasks
        </button>
      </div>
    </Dialog>
  );
}

function LeadDialog({ m, onClose }: { m: Mission; onClose: () => void }) {
  const guess = mdLead(m.deliverable!);
  const [lead, setLead] = useState({ name: "", phone: guess.phone ?? "", website: guess.website ?? "", city: "Sarajevo" });
  const [busy, start] = useTransition();
  const set = (k: keyof typeof lead) => (e: React.ChangeEvent<HTMLInputElement>) => setLead({ ...lead, [k]: e.target.value });
  return (
    <Dialog title="Add an Outreach lead" sub="It's audited like any lead. Nothing is sent: you still decide in Outreach." onClose={onClose}>
      <div className="space-y-2">
        <input autoFocus value={lead.name} onChange={set("name")} maxLength={200} placeholder="Business name" className={field} />
        <input value={lead.phone} onChange={set("phone")} maxLength={40} placeholder="Phone (optional)" className={field} />
        <input value={lead.website} onChange={set("website")} maxLength={300} placeholder="Website (optional)" className={field} />
        <input value={lead.city} onChange={set("city")} maxLength={100} placeholder="City" className={field} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button disabled={busy || lead.name.trim().length < 2} className={btnPrimary}
          onClick={() => start(async () => { try { await missionToLeadC(m.id, lead); toast.success("Lead added to Outreach."); onClose(); } catch (e) { toast.error((e as Error).message); } })}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}Add lead
        </button>
      </div>
    </Dialog>
  );
}

function RedditDialog({ m, onClose }: { m: Mission; onClose: () => void }) {
  const firstHeading = m.deliverable!.match(/^#{1,3}\s+(.+)$/m)?.[1];
  const [subs, setSubs] = useState<string[] | null>(null);
  const [post, setPost] = useState({ subreddit: "", title: (firstHeading ?? m.deliverableTitle ?? m.title).slice(0, 300), body: m.deliverable! });
  const [busy, start] = useTransition();
  useEffect(() => { redditSubsC().then((s) => { setSubs(s); if (s[0]) setPost((p) => ({ ...p, subreddit: p.subreddit || s[0] })); }).catch(() => setSubs([])); }, []);
  return (
    <Dialog title="Save as a Reddit draft" sub="It joins your drafts in Game → Reddit. Galaxus never posts for you." onClose={onClose} wide>
      <div className="space-y-2">
        <div className="flex gap-2">
          <span className="h-9 inline-flex items-center text-sm text-white/50">r/</span>
          <input list="ops-subs" value={post.subreddit} onChange={(e) => setPost({ ...post, subreddit: e.target.value })} placeholder={subs === null ? "loading…" : "subreddit"} className={field} />
          <datalist id="ops-subs">{(subs ?? []).map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <input value={post.title} onChange={(e) => setPost({ ...post, title: e.target.value })} maxLength={300} placeholder="Title" className={field} />
        <textarea value={post.body} onChange={(e) => setPost({ ...post, body: e.target.value })} rows={10} className={cn(field, "font-mono text-xs")} />
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Link href="/game/reddit" className="mr-auto text-xs text-[#8ea6ff] hover:underline">Your drafts</Link>
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button disabled={busy || !post.subreddit.trim() || post.title.trim().length < 5} className={btnPrimary}
          onClick={() => start(async () => { try { await missionToRedditC(m.id, post); toast.success("Draft saved."); onClose(); } catch (e) { toast.error((e as Error).message); } })}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}Save draft
        </button>
      </div>
    </Dialog>
  );
}
