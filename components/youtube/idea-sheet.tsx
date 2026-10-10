"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarCheck, Loader2, Trash2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { YoutubeIdea } from "@/lib/db/schema";
import { IDEA_STAGES, STAGE_LABEL } from "@/lib/youtube";
import { deleteIdea, runHookLab, updateIdea, writeScript, type StudioState } from "@/lib/client/youtube";
import { BrandIcon } from "@/components/brand-icon";
import { ClaudeJob } from "@/components/claude-job";
import { format } from "date-fns";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";

type Idea = StudioState["ideas"][number] | YoutubeIdea;

type IdeaTask = StudioState["ideaTasks"][number];

export function IdeaDetail({ idea, canAsk, onDeleted, calendar = [] }: { idea: Idea; canAsk: boolean; onDeleted: () => void; calendar?: IdeaTask[] }) {
  const [hookJob, setHookJob] = useState<{ id: number; dispatched: boolean } | null>(null);
  const [title, setTitle] = useState(idea.title);
  const [hook, setHook] = useState(idea.hook ?? "");
  const [script, setScript] = useState(idea.script ?? "");
  const [notes, setNotes] = useState(idea.notes ?? "");
  const [videoLink, setVideoLink] = useState(idea.videoId ?? "");
  // Re-sync text fields when Claude writes a new script (server data changes).
  const [syncedHook, setSyncedHook] = useState(idea.hook);
  if (syncedHook !== idea.hook) {
    setSyncedHook(idea.hook);
    setHook(idea.hook ?? "");
  }
  const [syncedScript, setSyncedScript] = useState(idea.script);
  if (syncedScript !== idea.script) {
    setSyncedScript(idea.script);
    setScript(idea.script ?? "");
    setHook(idea.hook ?? "");
  }
  const [busy, startBusy] = useTransition();

  const save = (patch: Parameters<typeof updateIdea>[1]) => updateIdea(idea.id, patch).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't save."));

  return (
    <div className="flex flex-col">
      <div className="p-6 pb-4 pr-12 border-b border-border">
        <SheetTitle className="sr-only">{idea.title}</SheetTitle>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => { if (title.trim() && title !== idea.title) save({ title }); }}
          className="w-full bg-transparent text-lg font-semibold outline-none" aria-label="Title" />
        <SheetDescription className="mt-1 capitalize">{idea.format} video</SheetDescription>
      </div>

      <div className="p-6 space-y-6">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Stage</p>
          <div className="flex flex-wrap gap-1">
            {IDEA_STAGES.map((s) => (
              <button key={s} onClick={() => save({ stage: s })} aria-pressed={idea.stage === s}
                className={cn("h-7 px-2.5 rounded-full text-xs", idea.stage === s ? "bg-primary text-primary-foreground font-medium" : "border border-border text-muted-foreground hover:text-foreground")}>
                {STAGE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Publish by</span>
            <input type="date" defaultValue={idea.dueDate ?? ""} onChange={(e) => save({ dueDate: e.target.value || null })} className="input-base mt-1.5" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Format</span>
            <select defaultValue={idea.format} onChange={(e) => save({ format: e.target.value as "short" | "long" })} className="input-base mt-1.5">
              <option value="short">Short</option>
              <option value="long">Long-form</option>
            </select>
          </label>
        </div>

        {calendar.length > 0 && (
          <div className="rounded-xl bg-muted/40 px-3 py-2.5">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">On your Tasks</p>
            <ul className="space-y-1">
              {[...calendar].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")).map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <CalendarCheck className={cn("w-3.5 h-3.5", t.status === "done" ? "text-emerald-600" : "text-muted-foreground")} />
                  <span className={cn("flex-1", t.status === "done" && "line-through text-muted-foreground")}>{t.phase}</span>
                  <span className="text-xs tabular-nums text-muted-foreground" suppressHydrationWarning>{t.dueDate ? format(new Date(t.dueDate + "T12:00:00"), "EEE d MMM") : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Hook — the first line people hear</span>
            <button
              onClick={() => startBusy(async () => {
                try { setHookJob(await runHookLab(idea.id)); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't start."); }
              })}
              disabled={busy}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border text-xs hover:bg-accent disabled:opacity-50">
              <BrandIcon name="claude" className="w-3.5 h-3.5" /> Hook lab
            </button>
          </div>
          <input value={hook} onChange={(e) => setHook(e.target.value)} onBlur={() => { if (hook !== (idea.hook ?? "")) save({ hook }); }}
            placeholder="If you're using Unity and not doing this yet…" className="input-base mt-1.5" />
          {hookJob && <div className="mt-2"><ClaudeJob jobId={hookJob.id} dispatched={hookJob.dispatched} label="Writing 10 hooks" onDone={() => setHookJob(null)} /></div>}
          {idea.hooks.length > 0 && (
            <ul className="mt-2 space-y-1">
              {idea.hooks.map((h, i) => (
                <li key={i}>
                  <button onClick={() => { setHook(h); save({ hook: h }); }}
                    className={cn("w-full text-left rounded-lg px-3 py-2 text-sm border transition-colors",
                      h === (idea.hook ?? "") ? "border-primary bg-primary/10" : "border-border hover:bg-accent/60")}>
                    <span className="text-muted-foreground tabular-nums mr-2">{i + 1}.</span>{h}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Script</span>
            <button
              onClick={() => startBusy(async () => { try { await writeScript(idea.id); toast.success("Script written."); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); } })}
              disabled={busy || !canAsk} title={canAsk ? undefined : "Add an Anthropic key in Setup"}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border text-xs hover:bg-accent disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} {script ? "Rewrite with Claude" : "Write with Claude"}
            </button>
          </div>
          <textarea value={script} onChange={(e) => setScript(e.target.value)} onBlur={() => { if (script !== (idea.script ?? "")) save({ script }); }}
            rows={10} placeholder="Hook, beats, ending that loops back…" className="mt-1.5 w-full rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed" />
        </div>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (notes !== (idea.notes ?? "")) save({ notes }); }}
            rows={3} placeholder="Shots to record, music, edit ideas…" className="mt-1.5 w-full rounded-lg border border-border bg-transparent p-3 text-sm" />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Published video (link)</span>
          <input value={videoLink} onChange={(e) => setVideoLink(e.target.value)}
            onBlur={() => { if (videoLink !== (idea.videoId ?? "")) save({ videoId: videoLink || null, ...(videoLink ? { stage: "published" } : {}) }); }}
            placeholder="youtube.com/shorts/…" className="input-base mt-1.5" />
          <span className="text-[11px] text-muted-foreground">Linking it copies the script onto the video, so Claude&apos;s review can judge the hook.</span>
        </label>

        <button onClick={() => startBusy(async () => { await deleteIdea(idea.id); onDeleted(); })}
          className="inline-flex items-center gap-1.5 h-9 px-2 rounded-md text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10">
          <Trash2 className="w-4 h-4" /> Delete idea
        </button>
      </div>
    </div>
  );
}
