"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandIcon } from "@/components/brand-icon";
import type { VoiceCommand } from "@/lib/db/schema";
import { saveVoiceGithubKey } from "@/lib/client/voice";
import { VoicePanel } from "./voice-panel";

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  running: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/10 text-destructive",
};

export function VoicePage({ history, setup }: { history: VoiceCommand[]; setup: { hasGithubKey: boolean; repo: string } }) {
  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <header className="mb-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5"><BrandIcon name="claude" className="w-7 h-7" /> Voice</h1>
        <p className="text-sm text-muted-foreground mt-1">Say it — Claude plans it. Tasks, routines and goals, made by Claude on your own subscription.</p>
      </header>

      <section className="rounded-2xl border border-border">
        <VoicePanel />
      </section>

      {history.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold mb-3">Recent</h2>
          <ul className="rounded-xl border border-border divide-y divide-border">
            {history.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <p className="flex-1 text-sm">{c.transcript}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize shrink-0", STATUS_STYLE[c.status])}>{c.status}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1" suppressHydrationWarning>
                  {c.createdAt ? format(new Date(c.createdAt), "d MMM, HH:mm") : ""}
                  {c.actions.length > 0 && ` · ${c.actions.length} change${c.actions.length === 1 ? "" : "s"}: ${c.actions.slice(0, 3).map((a) => a.title).join(", ")}${c.actions.length > 3 ? "…" : ""}`}
                  {c.status === "failed" && c.error && ` · ${c.error}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SetupCard setup={setup} />
    </div>
  );
}

function SetupCard({ setup }: { setup: { hasGithubKey: boolean; repo: string } }) {
  const [key, setKey] = useState("");
  const [busy, start] = useTransition();
  return (
    <section className="mt-10 rounded-xl border border-border p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> How it stays safe</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-disc pl-5">
          <li>Your Claude subscription token lives only in GitHub&apos;s encrypted secrets — never in the code, in Galaxus, or in logs.</li>
          <li>The runner checks out no code and installs only a pinned Claude Code version. Claude gets no shell, files or web — only your Galaxus tools.</li>
          <li>Voice commands can&apos;t delete goals or routines (blocked by the Galaxus server, not just by Claude&apos;s settings).</li>
          <li>What you say goes Galaxus → runner over HTTPS. It is never a workflow input or a log line (the repo is public).</li>
        </ul>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium flex items-center gap-2"><BrandIcon name="github" className="w-4 h-4" /> GitHub key — makes Claude start instantly</span>
          {setup.hasGithubKey
            ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" /> Saved</span>
            : <span className="text-xs text-muted-foreground">Optional · without it, ~10 min</span>}
        </div>
        <ol className="mt-2 text-xs text-muted-foreground list-decimal pl-4 space-y-0.5">
          <li>GitHub → Settings → Developer settings → <a className="underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Fine-grained tokens → Generate</a>.</li>
          <li>Repository access: <b>Only select repositories</b> → <b>{setup.repo}</b>.</li>
          <li>Permissions → Repository → <b>Actions: Read and write</b>. Nothing else. Expiration: 1 year.</li>
          <li>Paste it below — it can only start workflow runs, not touch your code.</li>
        </ol>
        <div className="flex gap-2 mt-3">
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)}
            placeholder={setup.hasGithubKey ? "Paste a new token to replace" : "github_pat_…"} className="input-base flex-1" />
          <button
            onClick={() => start(async () => {
              try { await saveVoiceGithubKey(key); setKey(""); toast.success("GitHub key saved — Claude now starts right away."); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save."); }
            })}
            disabled={busy || !key.trim()}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
          {setup.hasGithubKey && (
            <button onClick={() => start(async () => { await saveVoiceGithubKey(""); toast.success("Removed."); })}
              className="h-9 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-destructive">Remove</button>
          )}
        </div>
      </div>
    </section>
  );
}
