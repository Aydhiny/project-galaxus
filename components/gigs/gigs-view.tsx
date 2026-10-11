"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { Banknote, Bell, BellOff, Bookmark, Check, Clock, Copy, ExternalLink, Flame, Layers, Loader2, Mail, PenLine, Plus, Radar, RefreshCw, Settings2, Sparkles, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Gig, GigProfile } from "@/lib/db/schema";
import { GIG_PRESETS, GIG_SOURCES, SOURCE_LABEL, isOneTime, type GigSource } from "@/lib/gigs";
import {
  saveGigProfileC, saveRedditKeyC, scanGigsNowC, setGigNotificationsC, updateGigC, type RadarState,
} from "@/lib/client/gigs";
import { BrandIcon } from "@/components/brand-icon";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { AutopilotPanel } from "./autopilot-panel";
import type { AutopilotState } from "@/lib/client/autopilot";

const scoreTone = (s: number | null) =>
  (s ?? 0) >= 70 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : (s ?? 0) >= 45 ? "bg-amber-500/15 text-amber-800 dark:text-amber-200" : "bg-muted text-muted-foreground";

const SOURCE_TONE: Record<string, string> = {
  reddit: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  remotive: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  remoteok: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  wwr: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  hn: "bg-amber-500/12 text-amber-800 dark:text-amber-200",
};

type Filter = "hot" | "budget" | "onetime" | null;

const subredditOf = (url: string) => url.match(/reddit\.com\/r\/([^/]+)/i)?.[1] ?? null;
const oneTime = (g: Gig) => isOneTime(`${g.title} ${g.body ?? ""}`, g.source);
const presetEmoji = (name: string) => GIG_PRESETS.find((p) => p.name.toLowerCase() === name.toLowerCase())?.emoji ?? "🎯";

export function GigsView({ state, autopilot }: { state: RadarState; autopilot: AutopilotState }) {
  const [profileId, setProfileId] = useState<number | "all">("all");
  const [source, setSource] = useState<GigSource | "all">("all");
  const [tab, setTab] = useState<"new" | "saved" | "applied">("new");
  const [filter, setFilter] = useState<Filter>(null);
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [editing, setEditing] = useState<GigProfile | null>(null);
  const [adding, setAdding] = useState(false);
  const [notify, setNotify] = useState(state.notify);
  const [busy, start] = useTransition();

  const visible = state.gigs.filter((g) => !hidden.has(g.id));
  const inTab = visible.filter((g) => g.status === tab && (profileId === "all" || g.profileId === profileId));
  const bySource = (src: GigSource | "all") => inTab.filter((g) => src === "all" || g.source === src).length;
  const list = inTab
    .filter((g) => source === "all" || g.source === source)
    .filter((g) => filter === null || (filter === "hot" ? (g.score ?? 0) >= 70 : filter === "budget" ? !!g.budget : oneTime(g)));
  const counts = { new: 0, saved: 0, applied: 0 };
  for (const g of visible) if (g.status in counts) counts[g.status as keyof typeof counts]++;
  const fresh = visible.filter((g) => g.status === "new");
  const [dayAgo] = useState(() => Date.now() - 86_400_000); // fixed per render-session (render must stay pure)
  const stats = [
    { key: null, label: "New today", value: fresh.filter((g) => g.createdAt && new Date(g.createdAt).getTime() > dayAgo).length, icon: Sparkles, tone: "text-sky-600 dark:text-sky-400 bg-sky-500/10" },
    { key: "hot" as const, label: "Hot (70+)", value: fresh.filter((g) => (g.score ?? 0) >= 70).length, icon: Flame, tone: "text-orange-600 dark:text-orange-400 bg-orange-500/10" },
    { key: "budget" as const, label: "Budget shown", value: fresh.filter((g) => g.budget).length, icon: Banknote, tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" },
    { key: "onetime" as const, label: "One-time jobs", value: fresh.filter(oneTime).length, icon: Zap, tone: "text-amber-600 dark:text-amber-400 bg-amber-500/10" },
  ];

  function setStatus(g: Gig, status: string) {
    setHidden((h) => new Set(h).add(g.id));
    updateGigC(g.id, { status }).catch((e) => { setHidden((h) => { const n = new Set(h); n.delete(g.id); return n; }); toast.error(e.message); });
  }

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <span className="relative w-9 h-9 rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Radar className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
            </span>
            Gig radar
          </h1>
          <p className="text-sm text-muted-foreground mt-1" suppressHydrationWarning>
            People hiring right now — Reddit and job boards, scanned every hour{state.lastScan ? ` · last scan ${formatDistanceToNowStrict(new Date(state.lastScan.at))} ago` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => start(async () => {
              try { await setGigNotificationsC(!notify); setNotify(!notify); } catch (e) { toast.error((e as Error).message); }
            })}
            className={cn("inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs", notify ? "border-primary/40 bg-primary/10" : "border-border text-muted-foreground")}>
            {notify ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />} {notify ? "Notifying me" : "Muted"}
          </button>
          <button
            onClick={() => start(async () => {
              try {
                const r = await scanGigsNowC();
                toast.success(`${r.added} new gig${r.added === 1 ? "" : "s"} · ${r.matched} matched of ${r.fetched} posts${r.errors.length ? ` · ${r.errors.length} source issue(s)` : ""}`);
                if (r.errors.length) toast.message(r.errors.join(" · ").slice(0, 300));
              } catch (e) { toast.error((e as Error).message); }
            })}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-xs font-medium disabled:opacity-50 active:scale-95 transition-transform">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Scan now
          </button>
        </div>
      </header>

      {/* Stats — tap one to filter */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stats.map((st, i) => (
          <button key={st.label} onClick={() => st.key && setFilter(filter === st.key ? null : st.key)} disabled={!st.key}
            style={{ animationDelay: `${i * 50}ms` }}
            className={cn("rounded-xl border px-3 py-2.5 flex items-center gap-3 text-left transition-all animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both",
              filter === st.key && st.key ? "border-primary bg-primary/5" : "border-border hover:border-foreground/20", !st.key && "cursor-default")}>
            <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", st.tone)}><st.icon className="w-4 h-4" /></span>
            <span>
              <span className="block text-xl font-semibold tabular-nums leading-tight">{st.value}</span>
              <span className="block text-[11px] text-muted-foreground">{st.label}</span>
            </span>
          </button>
        ))}
      </div>

      <AutopilotPanel state={autopilot} />

      {!state.redditConnected && <RedditConnect />}

      {/* Gig types */}
      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        <Chip active={profileId === "all"} onClick={() => setProfileId("all")}>All types</Chip>
        {state.profiles.map((p) => (
          <span key={p.id} className="inline-flex items-center">
            <Chip active={profileId === p.id} onClick={() => setProfileId(p.id)} muted={!p.active}><span className="mr-1">{presetEmoji(p.name)}</span>{p.name}</Chip>
            <button onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`} className="ml-0.5 w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        <button onClick={() => setAdding(true)} className="h-8 px-3 rounded-full text-sm border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 inline-flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add gig type
        </button>
      </div>

      {/* Where it's from — Reddit first */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {(["all", ...GIG_SOURCES] as const).map((src) => {
          const n = bySource(src);
          if (src !== "all" && src !== "reddit" && n === 0) return null;
          return (
            <button key={src} onClick={() => setSource(src)}
              className={cn("h-8 pl-2 pr-2.5 rounded-lg border text-sm inline-flex items-center gap-1.5 transition-colors",
                source === src ? "border-foreground/30 bg-foreground/5 font-medium" : "border-border text-muted-foreground hover:text-foreground")}>
              {src === "all" ? <Layers className="w-3.5 h-3.5" /> : <SourceGlyph source={src} className="w-4 h-4" />}
              {src === "all" ? "All sources" : SOURCE_LABEL[src]}
              <span className="text-xs opacity-60 tabular-nums">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/50">
          {(["new", "saved", "applied"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-3 h-7 rounded-md text-sm capitalize transition-colors", tab === t ? "bg-background shadow-xs" : "text-muted-foreground")}>
              {t} {counts[t] > 0 && <span className="opacity-60 tabular-nums">{counts[t]}</span>}
            </button>
          ))}
        </div>
        {filter && (
          <button onClick={() => setFilter(null)} className="h-7 px-2.5 rounded-full text-xs bg-primary/10 border border-primary/30 inline-flex items-center gap-1">
            {stats.find((s) => s.key === filter)?.label} <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center">
          <Radar className="w-8 h-8 mx-auto text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            {tab === "new" ? "Nothing here right now. The radar checks every hour — or tap Scan now." : `Nothing ${tab} yet.`}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {list.slice(0, 150).map((g, i) => (
            <GigCard key={g.id} index={i} gig={g} profile={state.profiles.find((p) => p.id === g.profileId)} onStatus={(s) => setStatus(g, s)} />
          ))}
        </ul>
      )}

      <Sheet open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 gap-0 overflow-y-auto">
          {editing && <ProfileEditor key={editing.id} profile={editing} onSaved={() => setEditing(null)} />}
        </SheetContent>
      </Sheet>
      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 gap-0 overflow-y-auto">
          <PresetPicker have={new Set(state.profiles.map((p) => p.name.toLowerCase()))} onDone={() => setAdding(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Chip({ active, onClick, children, muted }: { active: boolean; onClick: () => void; children: React.ReactNode; muted?: boolean }) {
  return (
    <button onClick={onClick}
      className={cn("h-8 px-3 rounded-full text-sm border transition-colors", active ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground", muted && "opacity-50")}>
      {children}
    </button>
  );
}

const SOURCE_AVATAR: Record<string, string> = {
  reddit: "bg-[#FF4500]/12",
  hn: "bg-[#F0652F]/12",
  remotive: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  remoteok: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  wwr: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
};

/** Brand logo where one exists (Reddit, Hacker News/YC), otherwise a clean initial. */
function SourceGlyph({ source, className }: { source: string; className?: string }) {
  if (source === "reddit") return <BrandIcon name="reddit" className={className} />;
  if (source === "hn") return <BrandIcon name="ycombinator" className={className} />;
  const initials: Record<string, string> = { remotive: "R", remoteok: "OK", wwr: "W" };
  return <span className={cn("inline-flex items-center justify-center font-bold text-[10px] leading-none", className)}>{initials[source] ?? "•"}</span>;
}

const accent = (s: number | null) => ((s ?? 0) >= 70 ? "before:bg-emerald-500" : (s ?? 0) >= 45 ? "before:bg-amber-500" : "before:bg-border");

function GigCard({ gig: g, profile, onStatus, index }: { gig: Gig; profile?: GigProfile; onStatus: (s: string) => void; index: number }) {
  const [draft, setDraft] = useState(g.draft ?? "");
  const [open, setOpen] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const sub = g.source === "reddit" ? subredditOf(g.url) : null;
  async function copyAndOpen() {
    try { await navigator.clipboard.writeText(draft); toast.success("Reply copied — paste it in the post or DM."); } catch { /* blocked */ }
    window.open(g.url, "_blank", "noopener");
  }
  return (
    <li style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      className={cn("relative overflow-hidden rounded-2xl border border-border bg-card p-4 pl-5 transition-all hover:border-foreground/20 hover:shadow-md hover:-translate-y-0.5",
        "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1", accent(g.score))}>
      <div className="flex items-start gap-3">
        <span className={cn("shrink-0 w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden", SOURCE_AVATAR[g.source] ?? "bg-muted")}>
          {g.image ? <GigThumb src={g.image} fallback={<SourceGlyph source={g.source} className="w-5 h-5" />} /> : <SourceGlyph source={g.source} className="w-5 h-5" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <a href={g.url} target="_blank" rel="noreferrer" className="flex-1 font-medium leading-snug hover:underline underline-offset-4">{g.title.replace(/^\s*\[(hiring|task)\]\s*/i, "")}</a>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums inline-flex items-center gap-1", scoreTone(g.score))}
              title={g.scoredBy === "claude" ? "Scored by Claude" : "Keyword score"}>
              {(g.score ?? 0) >= 70 && <Flame className="w-3 h-3" />}{g.score ?? "–"}
            </span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground" suppressHydrationWarning>
            <span className={cn("rounded px-1.5 py-px font-medium", SOURCE_TONE[g.source])}>{sub ? `r/${sub}` : SOURCE_LABEL[g.source as GigSource] ?? g.source}</span>
            {g.budget && <span className="rounded px-1.5 py-px font-semibold bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-0.5"><Banknote className="w-3 h-3" />{g.budget}</span>}
            {oneTime(g) && <span className="rounded px-1.5 py-px font-medium bg-amber-500/12 text-amber-800 dark:text-amber-200 inline-flex items-center gap-0.5"><Zap className="w-3 h-3" /> One-time</span>}
            {g.contactEmail && <span className="rounded px-1.5 py-px bg-sky-500/10 text-sky-700 dark:text-sky-300 inline-flex items-center gap-0.5"><Mail className="w-3 h-3" /> email</span>}
            {g.postedAt && <span className="inline-flex items-center gap-0.5"><Clock className="w-3 h-3" />{formatDistanceToNowStrict(new Date(g.postedAt))} ago</span>}
            {profile && <span>{presetEmoji(profile.name)} {profile.name}</span>}
            {g.scoredBy === "claude" && <span className="inline-flex items-center gap-1"><BrandIcon name="claude" className="w-3 h-3" /> scored</span>}
          </p>
          {g.reason && <p className="mt-1.5 text-xs text-muted-foreground">{g.reason}</p>}
          {g.body && (
            <button onClick={() => setOpen((v) => !v)} className="mt-1.5 block text-left text-sm text-muted-foreground">
              <span className={cn(!open && "line-clamp-2")}>{g.body}</span>
            </button>
          )}
          <GigImage src={g.image} />
        </div>
      </div>
      {showReply && (
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus
          onBlur={() => { if (draft !== (g.draft ?? "")) updateGigC(g.id, { draft }).catch(() => toast.error("Couldn't save the draft.")); }}
          rows={5} className="mt-3 w-full rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed animate-in fade-in-0" aria-label="Your reply" />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={copyAndOpen} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium active:scale-95 transition-transform">
          <Copy className="w-4 h-4" /> Copy reply &amp; open
        </button>
        <button onClick={() => setShowReply((v) => !v)} className={cn("inline-flex items-center gap-1 h-9 px-3 rounded-lg border text-sm hover:bg-accent", showReply ? "border-foreground/30" : "border-border")}>
          <PenLine className="w-4 h-4" /> {showReply ? "Hide reply" : "Edit reply"}
        </button>
        {g.status !== "applied" && (
          <button onClick={() => onStatus("applied")} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-border text-sm hover:bg-emerald-500/10 hover:border-emerald-500/30">
            <Check className="w-4 h-4" /> Applied
          </button>
        )}
        {g.status === "new" && (
          <button onClick={() => onStatus("saved")} className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-sm text-muted-foreground hover:bg-accent">
            <Bookmark className="w-4 h-4" /> Save
          </button>
        )}
        <span className="flex-1" />
        <a href={g.url} target="_blank" rel="noreferrer" className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent" aria-label="Open post"><ExternalLink className="w-4 h-4" /></a>
        <button onClick={() => onStatus("dismissed")} className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Dismiss"><X className="w-4 h-4" /></button>
      </div>
    </li>
  );
}

/** Small square thumbnail (company logo / post preview) with a fallback if the host blocks it. */
function GigThumb({ src, fallback }: { src: string; fallback: React.ReactNode }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="w-full h-full object-cover" />;
}

function RedditConnect() {
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, start] = useTransition();
  return (
    <details className="mt-6 rounded-2xl border border-orange-500/30 bg-orange-500/[0.04] p-4">
      <summary className="cursor-pointer text-sm font-medium">Make Reddit reliable — connect a free Reddit app key (2 minutes)</summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Without a key, Galaxus reads Reddit&apos;s public feed, which Reddit often rate-limits. The official API is free for personal use and reliable.
      </p>
      <ol className="mt-2 text-xs text-muted-foreground list-decimal pl-4 space-y-0.5">
        <li>Open <a className="underline" href="https://www.reddit.com/prefs/apps" target="_blank" rel="noreferrer">reddit.com/prefs/apps</a> → <b>create another app…</b></li>
        <li>Pick <b>script</b>, name it &quot;galaxus radar&quot;, redirect uri <code>http://localhost:8080</code> → Create.</li>
        <li>Copy the ID under the app name and the <b>secret</b> here. Read-only; Galaxus never posts.</li>
      </ol>
      <div className="mt-3 grid sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="App ID" className="input-base" />
        <input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Secret" className="input-base" />
        <button
          onClick={() => start(async () => { try { await saveRedditKeyC({ clientId: id, clientSecret: secret }); toast.success("Reddit connected."); } catch (e) { toast.error((e as Error).message); } })}
          disabled={busy || !id || !secret} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          {busy ? "Checking…" : "Connect"}
        </button>
      </div>
    </details>
  );
}

function ProfileEditor({ profile: p, onSaved }: { profile: GigProfile; onSaved: () => void }) {
  const [f, setF] = useState({ name: p.name, keywords: p.keywords, exclude: p.exclude ?? "", subreddits: p.subreddits ?? "", pitch: p.pitch ?? "", sources: p.sources, active: p.active });
  const [busy, start] = useTransition();
  return (
    <div className="flex flex-col">
      <div className="p-6 pb-4 pr-12 border-b border-border">
        <SheetTitle className="text-lg">{p.name}</SheetTitle>
        <SheetDescription>What this radar looks for and how Claude pitches you.</SheetDescription>
      </div>
      <div className="p-6 space-y-4">
        <label className="flex items-center justify-between text-sm"><span>Active</span>
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="w-4 h-4" />
        </label>
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="input-base" /></Field>
        <Field label="Keywords (comma-separated — a post must contain one)"><textarea value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} rows={3} className="input-base h-auto py-2" /></Field>
        <Field label="Exclude (comma-separated)"><input value={f.exclude} onChange={(e) => setF({ ...f, exclude: e.target.value })} className="input-base" /></Field>
        <Field label="Subreddits (comma-separated, no r/)"><textarea value={f.subreddits} onChange={(e) => setF({ ...f, subreddits: e.target.value })} rows={2} className="input-base h-auto py-2" /></Field>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Sources</p>
          <div className="flex flex-wrap gap-1.5">
            {GIG_SOURCES.map((s) => {
              const on = f.sources.includes(s);
              return (
                <button key={s} onClick={() => setF({ ...f, sources: on ? f.sources.filter((x) => x !== s) : [...f.sources, s] })}
                  className={cn("h-7 px-2.5 rounded-full text-xs border", on ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
                  {SOURCE_LABEL[s]}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Your pitch (Claude writes replies from this)"><textarea value={f.pitch} onChange={(e) => setF({ ...f, pitch: e.target.value })} rows={5} className="input-base h-auto py-2" /></Field>
        <button
          onClick={() => start(async () => { try { await saveGigProfileC(p.id, f); toast.success("Saved — next scan uses it."); onSaved(); } catch (e) { toast.error((e as Error).message); } })}
          disabled={busy} className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
          Save profile
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-medium text-muted-foreground">{label}</span><div className="mt-1.5">{children}</div></label>;
}

/** Post preview or company logo; disappears quietly if the host blocks it. */
function GigImage({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false);
  // Company logos are shown as the avatar; only real post previews (Reddit) get the big image.
  if (!src || broken || !/redd\.it|redditmedia|reddit\.com/.test(src)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)}
      className="mt-2 max-h-48 max-w-full rounded-lg border border-border object-cover bg-muted" />
  );
}

/** One tap = a ready-made profile the radar starts scanning for on the next pass. */
function PresetPicker({ have, onDone }: { have: Set<string>; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function add(p: (typeof GIG_PRESETS)[number] | null) {
    setBusy(p?.name ?? "custom");
    try {
      await saveGigProfileC(null, p
        ? { name: p.name, keywords: p.keywords, exclude: p.exclude, subreddits: p.subreddits, pitch: p.pitch, sources: p.sources }
        : { name: "My gigs", keywords: "looking for someone, need someone", active: false, sources: ["reddit", "remotive", "remoteok", "wwr"] });
      toast.success(p ? `Scanning for ${p.name.toLowerCase()} from the next pass.` : "Added (paused) — tap its gear, set your keywords and switch it on.");
      onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }
  return (
    <div className="p-6">
      <SheetTitle>What gigs do you want?</SheetTitle>
      <SheetDescription className="mt-1">Pick any — the radar scans Reddit and job boards for each, every hour. You can tweak keywords later.</SheetDescription>
      <ul className="mt-5 space-y-2">
        {GIG_PRESETS.map((p) => {
          const added = have.has(p.name.toLowerCase());
          return (
            <li key={p.name}>
              <button disabled={added || busy !== null} onClick={() => add(p)}
                className="w-full text-left rounded-xl border border-border p-3 hover:bg-accent/40 disabled:opacity-50 flex items-start gap-3">
                <span className="text-xl leading-none mt-0.5">{p.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-sm flex items-center gap-2">{p.name} {added && <span className="text-[11px] text-muted-foreground">added</span>}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.keywords.split(", ").slice(0, 7).join(" · ")}</span>
                </span>
                {busy === p.name ? <Loader2 className="w-4 h-4 animate-spin mt-0.5" /> : !added && <Plus className="w-4 h-4 mt-0.5 text-muted-foreground" />}
              </button>
            </li>
          );
        })}
        <li>
          <button disabled={busy !== null} onClick={() => add(null)} className="w-full text-left rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground hover:text-foreground">
            + Something else (write your own keywords)
          </button>
        </li>
      </ul>
    </div>
  );
}
