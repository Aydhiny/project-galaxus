"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, Gamepad2, GitCommitHorizontal, Loader2, Plus, Star, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlaytestTheme } from "@/lib/db/schema";
import { addFeedbackC, deleteFeedbackC, draftDevlogC, groupFeedbackC, saveGameRepoC, themeToTaskC, type GameState } from "@/lib/client/game";
import { BrandIcon } from "@/components/brand-icon";
import { ClaudeJob } from "@/components/claude-job";

type Job = { id: number; dispatched: boolean; label: string };

const SEVERITY: Record<PlaytestTheme["severity"], string> = {
  high: "bg-red-500/12 text-red-700 dark:text-red-300",
  medium: "bg-amber-500/12 text-amber-800 dark:text-amber-200",
  low: "bg-muted text-muted-foreground",
};

export function GameView({ state }: { state: GameState }) {
  const s = state.settings;
  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-violet-500/12 text-violet-600 dark:text-violet-400 flex items-center justify-center"><Gamepad2 className="w-5 h-5" /></span>
          Game dev
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{s.repo?.split("/")[1]?.replace(/[-_]/g, " ") ?? "Your game"} — devlogs from your commits, and what playtesters really think.</p>
      </header>
      <DevlogCard state={state} />
      <PlaytestCard state={state} />
    </div>
  );
}

// ─── Devlog from commits ──────────────────────────────────────────────────────

function DevlogCard({ state }: { state: GameState }) {
  const s = state.settings;
  const [repo, setRepo] = useState(s.repo ?? "");
  const [token, setToken] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [busy, start] = useTransition();

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl border border-border flex items-center justify-center shrink-0"><BrandIcon name="github" className="w-5 h-5" /></span>
        <div className="flex-1">
          <h2 className="font-semibold">Devlog from your commits</h2>
          <p className="text-sm text-muted-foreground">Claude reads what you pushed since the last devlog and writes a Short: the hook, a 20–35s script and the shots to record. It lands in <Link href="/youtube" className="underline underline-offset-4">YouTube → Work</Link>.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => start(async () => {
            try {
              const r = await draftDevlogC();
              setJob({ ...r, label: "Writing your devlog Short" });
            } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't start."); }
          })}
          disabled={busy}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCommitHorizontal className="w-4 h-4" />} Draft devlog from new commits
        </button>
        <span className="text-xs text-muted-foreground" suppressHydrationWarning>
          {s.lastDevlogAt ? `Last devlog ${format(new Date(s.lastDevlogAt), "d MMM")}` : "First run looks at the last 2 weeks"}
        </span>
      </div>
      {job && <div className="mt-3"><ClaudeJob jobId={job.id} dispatched={job.dispatched} label={job.label} /></div>}

      <details className="mt-5 group">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Repo settings {state.hasRepoToken ? "· token saved" : s.repo ? `· ${s.repo}` : ""}</summary>
        <div className="mt-3 grid sm:grid-cols-[1fr_1fr_auto] gap-2">
          <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" className="input-base" />
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)}
            placeholder={state.hasRepoToken ? "Token saved · paste to replace" : "Read-only token (private repo)"} className="input-base" />
          <button
            onClick={() => start(async () => {
              try { await saveGameRepoC(repo, token || undefined); setToken(""); toast.success("Saved."); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save."); }
            })}
            className="h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent">Save</button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Private repo? Create a <a className="underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">fine-grained token</a> for only this repo with <b>Contents: Read-only</b>. It can read commits, nothing else, and is stored encrypted.
        </p>
      </details>
    </section>
  );
}

// ─── Playtest log ─────────────────────────────────────────────────────────────

function PlaytestCard({ state }: { state: GameState }) {
  const s = state.settings;
  const [text, setText] = useState("");
  const [tester, setTester] = useState("");
  const [build, setBuild] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [made, setMade] = useState<Set<number>>(() => new Set());
  const [busy, start] = useTransition();

  function add() {
    if (!text.trim()) return;
    start(async () => {
      try {
        await addFeedbackC({ text, tester, build, rating });
        setText(""); setRating(null);
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add."); }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0"><Users className="w-5 h-5" /></span>
        <div className="flex-1">
          <h2 className="font-semibold">Playtest log</h2>
          <p className="text-sm text-muted-foreground">Write down what players say. Claude groups it into themes (“level 3 too hard” ×6) and each theme becomes a task in one tap.</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="“Couldn't find the key in the lava world, gave up after 10 minutes.”"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) add(); }}
          className="input-base h-auto py-2" />
        <div className="flex flex-wrap items-center gap-2">
          <input value={tester} onChange={(e) => setTester(e.target.value)} placeholder="Tester (optional)" className="input-base w-40" />
          <input value={build} onChange={(e) => setBuild(e.target.value)} placeholder="Build, e.g. 0.9.2" className="input-base w-36" />
          <div className="flex items-center" role="group" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(rating === n ? null : n)} aria-label={`${n} stars`} className="p-1">
                <Star className={cn("w-4 h-4", rating && n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <button onClick={add} disabled={busy || !text.trim()} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      {/* Themes */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">What to fix first</h3>
        <button
          onClick={() => start(async () => {
            try { const r = await groupFeedbackC(); setJob({ ...r, label: `Grouping ${state.feedback.length} notes into themes` }); setMade(new Set()); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't start."); }
          })}
          disabled={busy || state.feedback.length < 2}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50">
          <BrandIcon name="claude" className="w-3.5 h-3.5" /> {s.playtestThemes?.length ? "Regroup" : "Group with Claude"}
        </button>
      </div>
      {job && <div className="mt-3"><ClaudeJob jobId={job.id} dispatched={job.dispatched} label={job.label} /></div>}
      {s.playtestThemes?.length ? (
        <ul className="mt-3 space-y-2">
          {s.playtestThemes.map((t, i) => (
            <li key={`${i}-${t.theme}`} className="rounded-xl border border-border p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t.theme} <span className="text-muted-foreground font-normal">×{t.count}</span></p>
                  {t.examples[0] && <p className="text-xs text-muted-foreground mt-0.5 italic truncate">“{t.examples[0]}”</p>}
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize shrink-0", SEVERITY[t.severity])}>{t.severity}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex-1 truncate">Task: {t.task}</span>
                <button
                  onClick={() => start(async () => {
                    try { await themeToTaskC(i); setMade((m) => new Set(m).add(i)); toast.success("Added to your tasks."); }
                    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add."); }
                  })}
                  disabled={made.has(i)}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-xs hover:bg-accent disabled:opacity-60">
                  {made.has(i) ? <><Check className="w-3 h-3" /> Added</> : <><Plus className="w-3 h-3" /> Make task</>}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{state.feedback.length < 2 ? "Add a couple of notes, then let Claude find the patterns." : "Ready — tap “Group with Claude”."}</p>
      )}

      {/* Log */}
      {state.feedback.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">All notes · {state.feedback.length}</summary>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {state.feedback.map((f) => (
              <li key={f.id} className="flex items-start gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{f.text}</p>
                  <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                    {[f.tester, f.build && `build ${f.build}`, f.rating && `${f.rating}/5`, f.createdAt && format(new Date(f.createdAt), "d MMM")].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button onClick={() => start(async () => { await deleteFeedbackC(f.id); })} aria-label="Delete note"
                  className="w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
