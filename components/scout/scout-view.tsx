"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Binoculars, Bookmark, ExternalLink, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { claimScore } from "@/lib/scout";
import { saveScoutSettingsC, scanScoutNowC, setScoutMarkC, type ScoutOverview } from "@/lib/client/scout";

type Thread = ScoutOverview["threads"][number];
type Mark = "new" | "saved" | "hidden";
type Tab = "ideas" | "saved";

const EVIDENCE_TINT: Record<string, string> = {
  vague: "bg-muted text-muted-foreground",
  specific: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  verifiable: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
};
const EVIDENCE_LABEL: Record<string, string> = { vague: "no numbers", specific: "numbers, unproven", verifiable: "checkable" };

export function ScoutView({ data }: { data: ScoutOverview }) {
  const [tab, setTab] = useState<Tab>("ideas");
  const [local, setLocal] = useState<Record<number, Mark>>({});
  const [busy, start] = useTransition();

  const mark = (t: Thread) => local[t.id] ?? (t.mark as Mark);
  const analyzed = data.threads.filter((t) => t.status === "analyzed");
  const withClaims = analyzed.filter((t) => t.claims.length > 0 && mark(t) !== "hidden");
  const list = tab === "saved" ? withClaims.filter((t) => mark(t) === "saved") : withClaims;
  const empty = analyzed.length - analyzed.filter((t) => t.claims.length > 0).length;

  function setMark(id: number, m: Mark) {
    setLocal((s) => ({ ...s, [id]: m }));
    setScoutMarkC(id, m).catch((e) => toast.error((e as Error).message));
  }

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center"><Binoculars className="w-5 h-5" /></span>
            Scout
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            What people say they earn on Reddit, with the claims pulled out and ranked for you. Everything is self-reported, so the evidence label matters more than the number.
          </p>
        </div>
        <button
          onClick={() => start(async () => {
            try {
              const r = await scanScoutNowC();
              toast.success(r.added ? `${r.added} new thread${r.added === 1 ? "" : "s"} found. Comments are read one every ~10 min.` : "Nothing new this time.");
            } catch (e) { toast.error((e as Error).message); }
          })}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-xs font-medium disabled:opacity-50 active:scale-95 transition-transform">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Scan now
        </button>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        {([["ideas", "Ideas", withClaims.length], ["saved", "Saved", withClaims.filter((t) => mark(t) === "saved").length]] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn("h-8 px-3 rounded-full text-sm border transition-colors", tab === k ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground")}>
            {label} <span className="text-xs opacity-60 tabular-nums">{n}</span>
          </button>
        ))}
        {data.pending > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{data.pending} thread{data.pending === 1 ? "" : "s"} still being read</span>
        )}
      </div>

      {list.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border">
          <EmptyState icon={tab === "saved" ? Bookmark : Binoculars} title={tab === "saved" ? "Nothing saved yet" : "Nothing analysed yet"}>
            {tab === "saved" ? "Save a thread to keep it here." : "Tap Scan now; results arrive over the next hour or two (Reddit allows about one request a minute)."}
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-6 space-y-3 stagger">
          {list.map((t) => <Card key={t.id} t={t} saved={mark(t) === "saved"} onMark={(m) => setMark(t.id, m)} />)}
        </ul>
      )}
      {empty > 0 && <p className="mt-4 text-xs text-muted-foreground">{empty} other thread{empty === 1 ? "" : "s"} had no real earning claims.</p>}

      <Settings settings={data.settings} />
    </div>
  );
}

function Card({ t, saved, onMark }: { t: Thread; saved: boolean; onMark: (m: Mark) => void }) {
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{t.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">r/{t.subreddit ?? "?"}{t.author ? ` · u/${t.author}` : ""}</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums" title="Best claim: repeatability, discounted for weak evidence and self-promotion">{t.score}</span>
      </div>

      <ul className="mt-3 space-y-2.5">
        {t.claims.map((c, i) => (
          <li key={i} className="border-l-2 border-border pl-3">
            <p className="text-sm">{c.claim}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {c.amount && <span className="rounded-full px-2 py-0.5 text-[11px] bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">{c.amount}</span>}
              <span className={cn("rounded-full px-2 py-0.5 text-[11px]", EVIDENCE_TINT[c.evidence])}>{EVIDENCE_LABEL[c.evidence]}</span>
              {c.selfPromo && <span className="rounded-full px-2 py-0.5 text-[11px] bg-amber-500/12 text-amber-700 dark:text-amber-300">selling it</span>}
              <span className="rounded-full px-2 py-0.5 text-[11px] bg-muted text-muted-foreground tabular-nums">fit {claimScore(c)}</span>
            </div>
            {c.method && <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground/70">How:</span> {c.method}</p>}
            {c.why && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground/70">For you:</span> {c.why}</p>}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-1.5">
        <button onClick={() => onMark(saved ? "new" : "saved")}
          className={cn("inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors", saved ? "bg-foreground text-background" : "border border-border hover:bg-muted")}>
          <Bookmark className="w-3.5 h-3.5" /> {saved ? "Saved" : "Save"}
        </button>
        <a href={t.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-border text-xs hover:bg-muted">
          Open thread <ExternalLink className="w-3 h-3" />
        </a>
        <button onClick={() => onMark("hidden")} title="Not for me" className="ml-auto h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted inline-flex items-center justify-center">
          <EyeOff className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}

function Settings({ settings }: { settings: ScoutOverview["settings"] }) {
  const [profile, setProfile] = useState(settings.profile);
  const [subs, setSubs] = useState(settings.subs.join(" "));
  const [busy, start] = useTransition();
  return (
    <details className="mt-10 rounded-2xl border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium">Settings: who it ranks for, and where it reads</summary>
      <label className="mt-4 block text-xs font-medium text-muted-foreground">About you (the ranking is judged against this)</label>
      <textarea value={profile} onChange={(e) => setProfile(e.target.value)} rows={4}
        className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
      <label className="mt-3 block text-xs font-medium text-muted-foreground">Subreddits (space or comma separated, max 15)</label>
      <input value={subs} onChange={(e) => setSubs(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
      <button
        disabled={busy}
        onClick={() => start(async () => {
          try { await saveScoutSettingsC({ profile, subs }); toast.success("Saved. Applies from the next scan."); }
          catch (e) { toast.error((e as Error).message); }
        })}
        className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-xs font-medium disabled:opacity-50">
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
      </button>
    </details>
  );
}
