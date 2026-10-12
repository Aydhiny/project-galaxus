"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Award, CalendarPlus, Check, Clock, ExternalLink, EyeOff, Loader2, MapPin, RefreshCw, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { OPP_KINDS, type OppKind } from "@/lib/opportunities";
import { addOpportunityTaskC, scanOpportunitiesNowC, setOpportunityStatusC, type OpportunityList } from "@/lib/client/opportunities";

type Item = OpportunityList[number];
const SOURCE: Record<string, string> = { devpost: "Devpost", itch: "itch.io", eu: "EU Funding", bih: "BiH" };
const KIND_TINT: Record<string, string> = {
  hackathon: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  jam: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  grant: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
};

function daysLeft(d: Date | string | null, now: number) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - now) / 86_400_000);
}

export function OpportunitiesView({ items }: { items: OpportunityList }) {
  const [kind, setKind] = useState<OppKind | "all">("all");
  const [local, setLocal] = useState<Record<number, string>>({});
  const [now] = useState(() => Date.now());
  const [busy, start] = useTransition();
  const [adding, setAdding] = useState<number | null>(null);

  const status = (o: Item) => local[o.id] ?? o.status;
  const visible = items.filter((o) => status(o) !== "hidden");
  const list = visible.filter((o) => kind === "all" || o.kind === kind);
  const count = (k: OppKind | "all") => visible.filter((o) => k === "all" || o.kind === k).length;
  const top = list.filter((o) => o.score >= 70).slice(0, 3);
  const rest = list.filter((o) => !top.includes(o));

  function mark(id: number, s: "new" | "saved" | "hidden") {
    setLocal((m) => ({ ...m, [id]: s }));
    setOpportunityStatusC(id, s).catch((e) => toast.error((e as Error).message));
  }
  async function addTask(o: Item) {
    setAdding(o.id);
    try {
      await addOpportunityTaskC(o.id);
      setLocal((m) => ({ ...m, [o.id]: "tasked" }));
      toast.success(o.deadline ? "Added to tasks with the deadline." : "Added to tasks.");
    } catch (e) { toast.error((e as Error).message); }
    setAdding(null);
  }

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center"><Award className="w-5 h-5" /></span>
            Opportunities
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Hackathons, game jams, and EU and BiH grants, scanned every morning. The best ones go straight into your tasks with their deadline.</p>
        </div>
        <button
          onClick={() => start(async () => {
            try {
              const r = await scanOpportunitiesNowC();
              toast.success(`${r.added} new · ${r.tasked} added to tasks`);
              if (r.errors.length) toast.message(r.errors.join(" · "));
            } catch (e) { toast.error((e as Error).message); }
          })}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-xs font-medium disabled:opacity-50 active:scale-95 transition-transform">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Scan now
        </button>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        {(["all", ...OPP_KINDS.map((k) => k.key)] as const).map((k) => {
          const meta = OPP_KINDS.find((x) => x.key === k);
          return (
            <button key={k} onClick={() => setKind(k)}
              className={cn("h-8 px-3 rounded-full text-sm border transition-colors", kind === k ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground")}>
              {meta ? `${meta.emoji} ${meta.label}` : "All"} <span className="text-xs opacity-60 tabular-nums">{count(k)}</span>
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center">
          <Award className="w-8 h-8 mx-auto text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">Nothing yet. Tap Scan now (it also runs every morning at 07:00).</p>
        </div>
      ) : (
        <>
          {top.length > 0 && (
            <section className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Star className="w-3.5 h-3.5" /> Best for you</h2>
              <ul className="mt-2 grid md:grid-cols-3 gap-3">
                {top.map((o, i) => <Card key={o.id} o={o} i={i} big now={now} status={status(o)} adding={adding === o.id} onTask={() => addTask(o)} onMark={(s) => mark(o.id, s)} />)}
              </ul>
            </section>
          )}
          <ul className="mt-6 grid sm:grid-cols-2 gap-3">
            {rest.map((o, i) => <Card key={o.id} o={o} i={i} now={now} status={status(o)} adding={adding === o.id} onTask={() => addTask(o)} onMark={(s) => mark(o.id, s)} />)}
          </ul>
        </>
      )}
    </div>
  );
}

function Card({ o, i, big, now, status, adding, onTask, onMark }: {
  o: Item; i: number; big?: boolean; now: number; status: string; adding: boolean;
  onTask: () => void; onMark: (s: "new" | "saved" | "hidden") => void;
}) {
  const days = daysLeft(o.deadline, now);
  const tasked = status === "tasked";
  return (
    <li style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
      className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col hover:border-foreground/20 hover:shadow-md hover:-translate-y-0.5 transition-all animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both">
      {big && (
        <div className="h-28 bg-muted relative">
          {o.image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={o.image} alt="" loading="lazy" className="w-full h-full object-cover" />
            : <div className={cn("w-full h-full flex items-center justify-center text-4xl", KIND_TINT[o.kind])}>{OPP_KINDS.find((k) => k.key === o.kind)?.emoji}</div>}
          <span className="absolute top-2 right-2 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-semibold tabular-nums">{o.score}</span>
        </div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start gap-3">
          {!big && (
            <span className={cn("w-11 h-11 rounded-xl overflow-hidden shrink-0 flex items-center justify-center text-lg", KIND_TINT[o.kind])}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {o.image ? <img src={o.image} alt="" loading="lazy" className="w-full h-full object-cover" /> : OPP_KINDS.find((k) => k.key === o.kind)?.emoji}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug line-clamp-2">{o.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{SOURCE[o.source] ?? o.source}</span>
              {o.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{o.location}</span>}
              {!big && <span className="tabular-nums">score {o.score}</span>}
            </p>
          </div>
        </div>
        {o.summary && <p className="mt-2 text-xs text-muted-foreground line-clamp-3">{o.summary}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {days != null && (
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              days <= 7 ? "bg-rose-500/12 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground")}>
              <Clock className="w-3 h-3" />{days <= 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`}{o.kind === "jam" ? " to start" : " left"}
            </span>
          )}
          {o.prize && <span className="rounded-full px-2 py-0.5 text-[11px] bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">🏆 {o.prize}</span>}
          {(o.tags as string[]).slice(0, 3).map((t) => <span key={t} className="rounded-full px-2 py-0.5 text-[11px] bg-muted text-muted-foreground">{t}</span>)}
        </div>
        <div className="mt-auto pt-3 flex items-center gap-1.5">
          <button onClick={onTask} disabled={tasked || adding}
            className={cn("inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors",
              tasked ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-foreground text-background active:scale-95")}>
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : tasked ? <Check className="w-3.5 h-3.5" /> : <CalendarPlus className="w-3.5 h-3.5" />}
            {tasked ? "In tasks" : "Add to tasks"}
          </button>
          <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-border text-xs hover:bg-muted">
            Open <ExternalLink className="w-3 h-3" />
          </a>
          <button onClick={() => onMark("hidden")} title="Not for me" className="ml-auto h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted inline-flex items-center justify-center">
            <EyeOff className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}
