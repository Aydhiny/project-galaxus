"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Clapperboard, Copy, Film, Loader2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PILLAR_LABEL, scriptText, spokenWords, type Beat } from "@/lib/youtube-longform";
import { writeLongScript, type StudioState } from "@/lib/client/youtube";
import type { BrainPref } from "@/lib/youtube-longform";

type Idea = StudioState["ideas"][number];

const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied.`), () => toast.error("Couldn't copy."));

/** The pitch, the full script as Say / Show beats, and the recording checklist. */
export function LongPlanView({ idea, prefer, canWrite, onRecord }: { idea: Idea; prefer: BrainPref; canWrite: boolean; onRecord: () => void }) {
  const [busy, start] = useTransition();
  const [shot, setShot] = useState<Set<number>>(new Set());
  const pitch = idea.plan?.pitch;
  const script = idea.plan?.script ?? null;

  const write = () => start(async () => {
    try {
      const r = await writeLongScript(idea.id, prefer);
      toast.success(`Script written by ${r.brain}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't write the script.");
    }
  });

  return (
    <div className="p-6 space-y-6 border-b border-border">
      {pitch && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">{PILLAR_LABEL[pitch.pillar]}</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">~{pitch.minutes} min</span>
            {idea.brain && <span className="text-muted-foreground">by {idea.brain}</span>}
          </div>
          {pitch.angle && <p className="font-medium">{pitch.angle}</p>}
          {pitch.why && <p className="text-muted-foreground">{pitch.why}</p>}
          {pitch.viewer && <p className="text-xs text-muted-foreground">For: {pitch.viewer}</p>}
          {!script && pitch.outline.length > 0 && (
            <ol className="list-decimal pl-5 text-muted-foreground space-y-0.5">{pitch.outline.map((o, i) => <li key={i}>{o}</li>)}</ol>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={write} disabled={busy || !canWrite} title={canWrite ? undefined : "Add an Anthropic key or a free model key in Setup"}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          {busy ? "Writing — about a minute…" : script ? "Rewrite full script" : "Write full script + shot list"}
        </button>
        {script && (
          <>
            <button onClick={() => copy(scriptText(script), "Script")} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent">
              <Copy className="w-4 h-4" /> Copy script
            </button>
            <button onClick={onRecord} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent">
              <Film className="w-4 h-4" /> I recorded it — edit
            </button>
          </>
        )}
      </div>

      {script && (
        <>
          <p className="text-xs text-muted-foreground">
            {spokenWords(script).toLocaleString()} spoken words ≈ {Math.round(spokenWords(script) / 140)} min at a relaxed pace.
          </p>

          <Section title="Hook — first 30 seconds"><Beats beats={script.hook} /></Section>
          {script.sections.map((s, i) => (
            <Section key={i} title={`${i + 1}. ${s.heading}`} meta={`~${s.minutes} min`}><Beats beats={s.beats} /></Section>
          ))}
          {script.outro.length > 0 && <Section title="Outro"><Beats beats={script.outro} /></Section>}

          {script.shots.length > 0 && (
            <Section title="Record checklist" meta={`${shot.size}/${script.shots.length}`}>
              <ul className="space-y-1.5">
                {script.shots.map((s, i) => (
                  <li key={i}>
                    <button onClick={() => setShot((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                      className="w-full flex gap-2.5 text-left text-sm rounded-lg px-2 py-1.5 hover:bg-accent/50">
                      <span className={cn("mt-0.5 w-4 h-4 rounded border shrink-0 inline-flex items-center justify-center", shot.has(i) ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                        {shot.has(i) && <Check className="w-3 h-3" />}
                      </span>
                      <span className={cn(shot.has(i) && "line-through text-muted-foreground")}>
                        <span className="font-medium">{s.shot}</span>
                        {s.how && <span className="block text-muted-foreground text-xs mt-0.5">{s.how}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Titles">
            <ul className="space-y-1">
              {script.titles.map((t, i) => (
                <li key={i}><button onClick={() => copy(t, "Title")} className="w-full text-left text-sm rounded-lg border border-border px-3 py-2 hover:bg-accent/60">{t}</button></li>
              ))}
            </ul>
          </Section>
          {script.thumbnail && <Section title="Thumbnail"><p className="text-sm">{script.thumbnail}</p></Section>}
          {script.description && (
            <Section title="Description">
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{script.description}</p>
              <button onClick={() => copy(script.description, "Description")} className="mt-2 text-xs underline underline-offset-4">Copy</button>
            </Section>
          )}
        </>
      )}
      {!script && !busy && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Clapperboard className="w-3.5 h-3.5" /> The script comes with what to show on screen for every line, and a checklist of what to record.</p>
      )}
    </div>
  );
}

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground mb-2 flex justify-between gap-2">
        <span>{title}</span>{meta && <span className="font-normal tabular-nums">{meta}</span>}
      </h3>
      {children}
    </section>
  );
}

function Beats({ beats }: { beats: Beat[] }) {
  return (
    <ul className="rounded-xl border border-border divide-y divide-border">
      {beats.map((b, i) => (
        <li key={i} className="grid sm:grid-cols-[1fr_11rem] gap-x-4 gap-y-1 px-3 py-2.5 text-sm">
          <p className="leading-relaxed">{b.say}</p>
          {b.show && <p className="text-xs text-muted-foreground sm:border-l sm:border-border sm:pl-3"><span className="font-medium text-foreground/70">Show:</span> {b.show}</p>}
        </li>
      ))}
    </ul>
  );
}
