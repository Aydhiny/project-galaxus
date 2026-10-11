"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { Bell, BellOff, Bookmark, Check, Copy, ExternalLink, Loader2, Radar, RefreshCw, Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Gig, GigProfile } from "@/lib/db/schema";
import { GIG_SOURCES, SOURCE_LABEL, type GigSource } from "@/lib/gigs";
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

export function GigsView({ state, autopilot }: { state: RadarState; autopilot: AutopilotState }) {
  const [profileId, setProfileId] = useState<number | "all">("all");
  const [tab, setTab] = useState<"new" | "saved" | "applied">("new");
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [editing, setEditing] = useState<GigProfile | null>(null);
  const [notify, setNotify] = useState(state.notify);
  const [busy, start] = useTransition();

  const list = state.gigs.filter((g) => !hidden.has(g.id) && g.status === tab && (profileId === "all" || g.profileId === profileId));
  const counts = { new: 0, saved: 0, applied: 0 };
  for (const g of state.gigs) if (!hidden.has(g.id) && g.status in counts) counts[g.status as keyof typeof counts]++;

  function setStatus(g: Gig, status: string) {
    setHidden((h) => new Set(h).add(g.id));
    updateGigC(g.id, { status }).catch((e) => { setHidden((h) => { const n = new Set(h); n.delete(g.id); return n; }); toast.error(e.message); });
  }

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"><Radar className="w-5 h-5" /></span>
            Gig radar
          </h1>
          <p className="text-sm text-muted-foreground mt-1" suppressHydrationWarning>
            People hiring right now — scanned every hour{state.lastScan ? ` · last scan ${formatDistanceToNowStrict(new Date(state.lastScan.at))} ago` : ""}.
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
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-xs font-medium disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Scan now
          </button>
        </div>
      </header>

      <AutopilotPanel state={autopilot} />

      {!state.redditConnected && <RedditConnect />}

      {/* Profiles */}
      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        <Chip active={profileId === "all"} onClick={() => setProfileId("all")}>All</Chip>
        {state.profiles.map((p) => (
          <span key={p.id} className="inline-flex items-center">
            <Chip active={profileId === p.id} onClick={() => setProfileId(p.id)} muted={!p.active}>{p.name}</Chip>
            <button onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`} className="ml-0.5 w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
      </div>

      <div className="mt-4 inline-flex rounded-lg border border-border p-0.5 bg-muted/50">
        {(["new", "saved", "applied"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-3 h-7 rounded-md text-sm capitalize", tab === t ? "bg-background shadow-xs" : "text-muted-foreground")}>
            {t} {counts[t] > 0 && <span className="opacity-60 tabular-nums">{counts[t]}</span>}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {tab === "new" ? "No new gigs right now. The radar checks every hour — or tap Scan now." : `Nothing ${tab} yet.`}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {list.map((g) => (
            <GigCard key={g.id} gig={g} profile={state.profiles.find((p) => p.id === g.profileId)} onStatus={(s) => setStatus(g, s)} />
          ))}
        </ul>
      )}

      <Sheet open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 gap-0 overflow-y-auto">
          {editing && <ProfileEditor key={editing.id} profile={editing} onSaved={() => setEditing(null)} />}
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

function GigCard({ gig: g, profile, onStatus }: { gig: Gig; profile?: GigProfile; onStatus: (s: string) => void }) {
  const [draft, setDraft] = useState(g.draft ?? "");
  const [open, setOpen] = useState(false);
  async function copyAndOpen() {
    try { await navigator.clipboard.writeText(draft); toast.success("Reply copied — paste it in the post or DM."); } catch { /* blocked */ }
    window.open(g.url, "_blank", "noopener");
  }
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className={cn("shrink-0 rounded-lg px-2 py-1 text-xs font-semibold tabular-nums", scoreTone(g.score))} title={g.scoredBy === "claude" ? "Scored by Claude" : "Keyword score — Claude will refine it"}>
          {g.score ?? "–"}
        </span>
        <div className="flex-1 min-w-0">
          <a href={g.url} target="_blank" rel="noreferrer" className="font-medium leading-snug hover:underline underline-offset-4">{g.title}</a>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground" suppressHydrationWarning>
            <span className={cn("rounded px-1.5 py-px font-medium", SOURCE_TONE[g.source])}>{SOURCE_LABEL[g.source as GigSource] ?? g.source}</span>
            {g.budget && <span className="rounded px-1.5 py-px font-semibold bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">{g.budget}</span>}
            {g.postedAt && <span>{formatDistanceToNowStrict(new Date(g.postedAt))} ago</span>}
            {profile && <span>· {profile.name}</span>}
            {g.scoredBy === "claude" && <span className="inline-flex items-center gap-1"><BrandIcon name="claude" className="w-3 h-3" /> scored</span>}
          </p>
          {g.reason && <p className="mt-1.5 text-xs text-muted-foreground">{g.reason}</p>}
          {g.body && (
            <button onClick={() => setOpen((v) => !v)} className="mt-1.5 block text-left text-sm text-muted-foreground">
              <span className={cn(!open && "line-clamp-2")}>{g.body}</span>
            </button>
          )}
        </div>
      </div>
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (g.draft ?? "")) updateGigC(g.id, { draft }).catch(() => toast.error("Couldn't save the draft.")); }}
        rows={4} className="mt-3 w-full rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed" aria-label="Your reply" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={copyAndOpen} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium">
          <Copy className="w-4 h-4" /> Copy reply &amp; open
        </button>
        {g.status !== "applied" && (
          <button onClick={() => onStatus("applied")} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent">
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
        <button onClick={() => onStatus("dismissed")} className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent" aria-label="Dismiss"><X className="w-4 h-4" /></button>
      </div>
    </li>
  );
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
