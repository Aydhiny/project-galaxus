"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, Copy, Download, FileAudio, Film, Lightbulb, Loader2, RotateCcw, Scissors, Sparkles, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import type { YoutubeEdit } from "@/lib/db/schema";
import {
  FILTER_FILE, PILLAR_LABEL, chapterLines, clock, edl, ffmpegCommand, ffmpegFilter, findSilences, keepRanges, keptSeconds,
  parseSubtitles, planChunks, segmentOutTime, srtForEdit, type BrainPref, type Segment, type Span,
} from "@/lib/youtube-longform";
import { RATE, decodeToMono16k, download, transcribeChunk } from "@/lib/client/audio-prep";
import { createEdit, deleteEdit, loadEdit, pitchLongform, planEdit, toggleCut, writeLongScript, type StudioState } from "@/lib/client/youtube";

const err = (e: unknown, fallback: string) => toast.error(e instanceof Error ? e.message : fallback);
const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied.`), () => toast.error("Couldn't copy."));

export function LongformTab({ state, channelRowId, prefer, setPrefer, onOpenIdea, recordIdeaId }: {
  state: StudioState;
  channelRowId: number | null;
  prefer: BrainPref;
  setPrefer: (p: BrainPref) => void;
  onOpenIdea: (id: number) => void;
  recordIdeaId: number | null;
}) {
  const [openEdit, setOpenEdit] = useState<number | null>(null);
  const canThink = state.brain.claude || state.brain.freeModels > 0;
  const longIdeas = state.ideas.filter((i) => i.format === "long" && i.stage !== "published");

  if (openEdit !== null) return <EditView key={openEdit} id={openEdit} prefer={prefer} onBack={() => setOpenEdit(null)} />;

  return (
    <div className="space-y-8">
      <BrainBar brain={state.brain} prefer={prefer} setPrefer={setPrefer} />
      <PitchPanel channelRowId={channelRowId} prefer={prefer} disabled={!canThink} />

      <section>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Lightbulb className="w-4 h-4" /> Long-form ideas</h2>
        {longIdeas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No long-form ideas yet. Pitch some above — each one can become a full script with a shot list.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {longIdeas.map((i) => <IdeaCard key={i.id} idea={i} prefer={prefer} canThink={canThink} onOpen={() => onOpenIdea(i.id)} />)}
          </ul>
        )}
      </section>

      <RecordingEditor key={recordIdeaId ?? "none"} state={state} prefer={prefer} canThink={canThink} initialIdeaId={recordIdeaId} onDone={setOpenEdit} />

      {state.edits.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Scissors className="w-4 h-4" /> Your edits</h2>
          <ul className="rounded-xl border border-border divide-y divide-border">
            {state.edits.map((e) => (
              <li key={e.id}>
                <button onClick={() => setOpenEdit(e.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50">
                  <Film className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{e.title}</span>
                    <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
                      {clock(e.durationSec)} raw · {e.planned ? `${e.cuts} lines cut${e.brain ? ` by ${e.brain}` : ""}` : "not planned yet"}
                      {e.createdAt && ` · ${formatDistanceToNowStrict(new Date(e.createdAt))} ago`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ─── Brain ────────────────────────────────────────────────────────────────────

function BrainBar({ brain, prefer, setPrefer }: { brain: StudioState["brain"]; prefer: BrainPref; setPrefer: (p: BrainPref) => void }) {
  const free = `${brain.freeModels} free model${brain.freeModels === 1 ? "" : "s"}`;
  const line = prefer === "free"
    ? brain.freeModels ? `Free models only (${free}) — costs nothing, scripts are a bit weaker.` : "No free model keys yet — add one in Ops → Free models (Groq or Gemini, no card)."
    : brain.claude ? `Claude writes first${brain.freeModels ? `; ${free} take over if it fails` : ""}.` : brain.freeModels ? `No Anthropic key — your ${free} do the work.` : "No model connected — add an Anthropic key or a free Groq key in Setup.";
  return (
    <div className="rounded-xl border border-border p-3 flex flex-wrap items-center gap-3">
      <Sparkles className="w-4 h-4 text-muted-foreground" />
      <p className="flex-1 min-w-48 text-sm">{line}{!brain.whisper && <span className="text-muted-foreground"> Transcription needs a free Groq key (Setup).</span>}</p>
      <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/50">
        {(["auto", "free"] as const).map((p) => (
          <button key={p} onClick={() => setPrefer(p)} className={cn("px-2.5 h-7 rounded-md text-xs", prefer === p ? "bg-background shadow-xs" : "text-muted-foreground")}>
            {p === "auto" ? "Claude first" : "Free only"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Pitches ──────────────────────────────────────────────────────────────────

function PitchPanel({ channelRowId, prefer, disabled }: { channelRowId: number | null; prefer: BrainPref; disabled: boolean }) {
  const [steer, setSteer] = useState("");
  const [count, setCount] = useState(5);
  const [busy, start] = useTransition();
  return (
    <section className="rounded-xl border border-border p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Pitch long-form videos</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Reads your channel&apos;s numbers, the last review and your game&apos;s recent commits, then pitches 8–25 minute videos across game dev, development, tutorials and your game.</p>
      </div>
      <textarea value={steer} onChange={(e) => setSteer(e.target.value)} rows={2}
        placeholder="Optional steer: “a Unity tutorial series”, “how I use Claude Code for game dev”, “the story of Hunter Mouse 2 so far”…"
        className="w-full rounded-lg border border-border bg-transparent p-3 text-sm" />
      <div className="flex flex-wrap items-center gap-2">
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="input-base w-auto h-9" aria-label="How many ideas">
          {[3, 5, 8].map((n) => <option key={n} value={n}>{n} ideas</option>)}
        </select>
        <button disabled={busy || disabled}
          onClick={() => start(async () => {
            try {
              const r = await pitchLongform({ channelRowId, steer, count, prefer });
              toast.success(`${r.added} ideas from ${r.by}.`);
              setSteer("");
            } catch (e) { err(e, "Couldn't pitch."); }
          })}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />} {busy ? "Reading your channel…" : "Pitch ideas"}
        </button>
      </div>
    </section>
  );
}

function IdeaCard({ idea, prefer, canThink, onOpen }: { idea: StudioState["ideas"][number]; prefer: BrainPref; canThink: boolean; onOpen: () => void }) {
  const [busy, start] = useTransition();
  const pitch = idea.plan?.pitch;
  const hasScript = !!idea.plan?.script;
  return (
    <li className="rounded-xl border border-border p-4 flex flex-col gap-2">
      <button onClick={onOpen} className="text-left">
        <p className="text-sm font-semibold leading-snug hover:underline">{idea.title}</p>
        {pitch?.angle && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pitch.angle}</p>}
      </button>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] mt-auto">
        {pitch && <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">{PILLAR_LABEL[pitch.pillar]}</span>}
        {pitch && <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">~{pitch.minutes} min</span>}
        <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground capitalize">{idea.stage}</span>
      </div>
      <div className="flex gap-2">
        {hasScript ? (
          <button onClick={onOpen} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-accent">Open script</button>
        ) : (
          <button disabled={busy || !canThink}
            onClick={() => start(async () => {
              try { const r = await writeLongScript(idea.id, prefer); toast.success(`Script written by ${r.brain}.`); onOpen(); } catch (e) { err(e, "Couldn't write."); }
            })}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {busy ? "Writing…" : "Write full script"}
          </button>
        )}
      </div>
    </li>
  );
}

// ─── Recording → transcript → cut ─────────────────────────────────────────────

type Prep = { file: File | null; name: string; samples: Float32Array | null; duration: number; silences: Span[]; chunks: Span[]; done: number; segments: Segment[] };
type Phase = "idle" | "decoding" | "transcribing" | "saving" | "planning" | "stopped";

const AUDIO_EXT = /\.(ogg|opus|wav|mp3|m4a|aac|flac)$/i;

function RecordingEditor({ state, prefer, canThink, initialIdeaId, onDone }: {
  state: StudioState; prefer: BrainPref; canThink: boolean; initialIdeaId: number | null; onDone: (editId: number) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [ideaId, setIdeaId] = useState<number | null>(initialIdeaId);
  const [subs, setSubs] = useState("");
  const [showSubs, setShowSubs] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [problem, setProblem] = useState<string | null>(null);
  const prep = useRef<Prep | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null); // transcription paused/failed part-way for this file
  const abort = useRef<AbortController | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const ideas = state.ideas.filter((i) => i.format === "long");

  useEffect(() => {
    if (initialIdeaId) sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initialIdeaId]);

  const busy = phase !== "idle" && phase !== "stopped";
  const pasted = subs.trim() ? parseSubtitles(subs) : [];

  async function run() {
    setProblem(null);
    abort.current = new AbortController();
    try {
      // 1. Audio: decode once per file (silences power the jump cuts even when you paste captions).
      if (!prep.current || prep.current.file !== file) {
        if (file) {
          setPhase("decoding");
          const { samples, duration } = await decodeToMono16k(file);
          const silences = findSilences(samples, RATE);
          prep.current = { file, name: file.name, samples, duration, silences, chunks: planChunks(duration, silences), done: 0, segments: [] };
        } else {
          if (!pasted.length) throw new Error("Drop your recording, or paste its captions (SRT/VTT).");
          const duration = pasted[pasted.length - 1].end + 1;
          prep.current = { file: null, name: "recording.mp4", samples: null, duration, silences: [], chunks: [], done: 0, segments: [] };
        }
      }
      const p = prep.current;

      // 2. Transcript: pasted captions win; otherwise Whisper, chunk by chunk (Continue resumes here).
      if (pasted.length) {
        p.segments = pasted;
        p.done = p.chunks.length;
      } else if (p.samples) {
        setPhase("transcribing");
        const idea = ideas.find((i) => i.id === ideaId);
        const vocabulary = [idea?.title, state.channels[0]?.title, "Unity, C#, Claude Code, devlog, Hunter Mouse 2"].filter(Boolean).join(", ");
        while (p.done < p.chunks.length) {
          setProgress({ done: p.done, total: p.chunks.length });
          p.segments.push(...(await transcribeChunk(p.samples, p.chunks[p.done], vocabulary, abort.current.signal)));
          p.done++;
        }
        setProgress({ done: p.done, total: p.chunks.length });
      }

      // 3. Save, then let the model decide the cut.
      setPhase("saving");
      const title = ideas.find((i) => i.id === ideaId)?.title ?? p.name.replace(/\.[^.]+$/, "");
      const { id } = await createEdit({ title, fileName: p.name, durationSec: p.duration, ideaId, segments: p.segments, silences: p.silences });
      setPhase("planning");
      try {
        const r = await planEdit(id, prefer);
        toast.success(`${r.by} cut ${r.cuts} lines.`);
      } catch (e) {
        err(e, "Planning failed — open the edit and try again.");
      }
      prep.current = null;
      setResumeFile(null);
      setPhase("idle");
      setFile(null);
      setSubs("");
      onDone(id);
    } catch (e) {
      const p = prep.current;
      setResumeFile(p && p.file && p.done > 0 && p.done < p.chunks.length ? p.file : null);
      setPhase("stopped");
      if ((e as Error)?.name !== "AbortError") setProblem(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  const label = phase === "decoding" ? "Reading the audio in your browser…"
    : phase === "transcribing" ? `Transcribing ${progress.done}/${progress.total} (≈${Math.round((progress.total - progress.done) * 0.15)} min left)…`
    : phase === "saving" ? "Saving the transcript…"
    : phase === "planning" ? "Deciding the cut — reading every line…" : "";
  const resumable = phase === "stopped" && !!file && resumeFile === file;

  return (
    <section ref={sectionRef} className="rounded-xl border border-border p-4 space-y-4 scroll-mt-24">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-1.5"><Scissors className="w-4 h-4" /> Edit a recording</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Drop the raw recording. Your browser pulls the audio out (the video never uploads), Whisper writes a timed transcript, and the model cuts retakes, flubs and dead air.
          You get a cut file for ffmpeg, an EDL for DaVinci Resolve / Premiere, captions and chapters.
        </p>
      </div>

      <div className="grid sm:grid-cols-[1fr_14rem] gap-3">
        <label className={cn("flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-5 cursor-pointer hover:bg-accent/40", busy && "pointer-events-none opacity-60")}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}>
          {file ? <FileAudio className="w-5 h-5 shrink-0" /> : <Upload className="w-5 h-5 shrink-0 text-muted-foreground" />}
          <span className="text-sm min-w-0">
            {file ? <><span className="font-medium block truncate">{file.name}</span><span className="text-xs text-muted-foreground">{(file.size / 1024 ** 2).toFixed(0)} MB</span></>
              : <>Drop the recording or click to choose <span className="block text-xs text-muted-foreground">mp4 / webm / mov, or extracted audio (ogg, wav, mp3)</span></>}
          </span>
          <input type="file" accept="video/*,audio/*,.mkv,.ogg,.opus" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">For which idea</span>
          <select value={ideaId ?? ""} onChange={(e) => setIdeaId(e.target.value ? Number(e.target.value) : null)} className="input-base mt-1.5" disabled={busy}>
            <option value="">No script (judge the talk)</option>
            {ideas.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
          </select>
          <span className="text-[11px] text-muted-foreground">With a script, B-roll notes land on the right lines.</span>
        </label>
      </div>

      <div>
        <button onClick={() => setShowSubs((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4">
          {showSubs ? "Hide" : "Already have captions? Paste SRT/VTT instead of transcribing"}
        </button>
        {showSubs && (
          <textarea value={subs} onChange={(e) => setSubs(e.target.value)} rows={4} disabled={busy}
            placeholder={"1\n00:00:01,000 --> 00:00:03,200\nSo today I'm fixing the worst bug in my game…"}
            className="mt-2 w-full rounded-lg border border-border bg-transparent p-3 text-xs font-mono" />
        )}
        {showSubs && subs.trim() && <p className="text-[11px] text-muted-foreground mt-1">{pasted.length} caption lines read.</p>}
      </div>

      {problem && <p className="rounded-lg bg-destructive/10 text-destructive px-3 py-2 text-sm break-words">{problem}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={busy || !canThink || (!file && !pasted.length) || (!!file && !pasted.length && !state.brain.whisper)}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : resumable ? <RotateCcw className="w-4 h-4" /> : <Scissors className="w-4 h-4" />}
          {resumable ? "Continue" : "Make the cut"}
        </button>
        {phase === "transcribing" && <button onClick={() => abort.current?.abort()} className="h-9 px-3 rounded-lg border border-border text-sm hover:bg-accent">Pause</button>}
        {busy && <span className="text-sm text-muted-foreground">{label}</span>}
        {!busy && file && !pasted.length && !state.brain.whisper && <span className="text-xs text-muted-foreground">Add a free Groq key in Setup to transcribe.</span>}
      </div>
      {phase === "transcribing" && progress.total > 0 && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
      )}
    </section>
  );
}

// ─── One edit ─────────────────────────────────────────────────────────────────

const PAUSES = [{ v: 0.3, label: "Tight (0.3s)" }, { v: 0.5, label: "Natural (0.5s)" }, { v: 0.8, label: "Relaxed (0.8s)" }, { v: Infinity, label: "Keep all pauses" }];

function EditView({ id, prefer, onBack }: { id: number; prefer: BrainPref; onBack: () => void }) {
  const [edit, setEdit] = useState<YoutubeEdit | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [maxPause, setMaxPause] = useState(0.5);
  const [fps, setFps] = useState(30);
  const [videoName, setVideoName] = useState("");
  const [busy, start] = useTransition();

  useEffect(() => {
    loadEdit(id).then((e) => { setEdit(e); setVideoName(AUDIO_EXT.test(e.fileName) ? e.fileName.replace(AUDIO_EXT, ".mp4") : e.fileName); }, (e) => setFailed(e instanceof Error ? e.message : "Couldn't load."));
  }, [id]);

  const cutIds = useMemo(() => edit?.decision?.cut.map((c) => c.seg) ?? [], [edit]);
  const ranges = useMemo(() => (edit ? keepRanges(edit.segments, cutIds, edit.silences, edit.durationSec, { maxPause }) : []), [edit, cutIds, maxPause]);

  if (failed) return <div className="space-y-4"><BackButton onBack={onBack} /><p className="text-sm text-destructive">{failed}</p></div>;
  if (!edit) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading the edit…</div>;

  const d = edit.decision;
  const total = keptSeconds(ranges);
  const why = new Map(d?.cut.map((c) => [c.seg, c.why]) ?? []);
  const chapters = d ? chapterLines(d.chapters, edit.segments, ranges, total) : [];
  const description = [d?.description, chapters.length ? chapters.join("\n") : ""].filter(Boolean).join("\n\n");
  const base = videoName.replace(/\.[^.]+$/, "") || "recording";
  const inserts = (d?.show ?? []).flatMap((s) => {
    const t = edit.segments[s.seg] ? segmentOutTime(edit.segments[s.seg], ranges) : null;
    return t == null ? [] : [{ t, what: s.what }];
  });

  const replan = () => start(async () => {
    try {
      const r = await planEdit(edit.id, prefer);
      toast.success(`${r.by} cut ${r.cuts} lines.`);
      setEdit(await loadEdit(edit.id));
    } catch (e) { err(e, "Couldn't plan."); }
  });

  const toggle = (seg: number) => {
    if (!d) return;
    const has = d.cut.some((c) => c.seg === seg);
    const cut = has ? d.cut.filter((c) => c.seg !== seg) : [...d.cut, { seg, why: "cut by you" }].sort((a, b) => a.seg - b.seg);
    setEdit({ ...edit, decision: { ...d, cut } });
    toggleCut(edit.id, seg).catch((e) => err(e, "Couldn't save."));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackButton onBack={onBack} />
        <div className="flex gap-2">
          <button onClick={replan} disabled={busy} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {d ? "Re-plan the cut" : "Plan the cut"}
          </button>
          <button onClick={() => start(async () => { await deleteEdit(edit.id); onBack(); })} aria-label="Delete edit"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      <section className="rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold">{edit.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {clock(edit.durationSec)} raw → <b className="text-foreground">{clock(total)}</b> edited
          {edit.durationSec > 0 && ` (−${Math.round((1 - total / edit.durationSec) * 100)}%)`} · {cutIds.length} lines cut · {Math.max(0, ranges.length - 1)} jump cuts
          {edit.brain && ` · decided by ${edit.brain}`}
        </p>
        {!d && <p className="text-sm mt-3">The transcript is saved but no cut was decided yet — press <b>Plan the cut</b>.</p>}
        {d?.notes && <p className="text-sm mt-3 rounded-lg bg-muted/50 px-3 py-2"><span className="font-medium">Editor&apos;s notes: </span>{d.notes}</p>}
      </section>

      {d && (
        <section className="rounded-xl border border-border p-4 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5"><Download className="w-4 h-4" /> Render it</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Your video file</span>
              <input value={videoName} onChange={(e) => setVideoName(e.target.value)} className="input-base mt-1.5" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Pauses</span>
              <select value={maxPause} onChange={(e) => setMaxPause(Number(e.target.value))} className="input-base mt-1.5">
                {PAUSES.map((p) => <option key={p.label} value={p.v}>{p.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Frame rate (EDL)</span>
              <select value={fps} onChange={(e) => setFps(Number(e.target.value))} className="input-base mt-1.5">
                {[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
              </select>
            </label>
          </div>
          <ol className="text-sm space-y-2 list-decimal pl-5">
            <li>
              <button onClick={() => download(FILTER_FILE, ffmpegFilter(ranges))} className="underline underline-offset-4 font-medium">Download {FILTER_FILE}</button>{" "}
              into the folder with <code className="text-xs">{videoName}</code>.
            </li>
            <li>
              Run this there (ffmpeg 7 or newer):
              <div className="mt-1.5 flex gap-2 items-start">
                <code className="flex-1 rounded-lg bg-muted/60 px-3 py-2 text-xs break-all">{ffmpegCommand(videoName)}</code>
                <button onClick={() => copy(ffmpegCommand(videoName), "Command")} aria-label="Copy command" className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-lg border border-border hover:bg-accent"><Copy className="w-3.5 h-3.5" /></button>
              </div>
            </li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => download(`${base}.edl`, edl(ranges, fps, videoName, edit.title))} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-accent">EDL for Resolve / Premiere</button>
            <button onClick={() => download(`${base}-edit.srt`, srtForEdit(edit.segments, cutIds, ranges))} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-accent">Captions (.srt)</button>
            <button onClick={() => download(`${base}-youtube.txt`, [d.titles.join("\n"), description].filter(Boolean).join("\n\n"))} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-accent">Titles + description</button>
          </div>
          <p className="text-[11px] text-muted-foreground">Prefer to finish in an editor? Import the EDL with the original clip in the media pool, then lay B-roll on the timeline using the list below.</p>
        </section>
      )}

      {inserts.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">B-roll and screen inserts</h3>
          <ul className="rounded-xl border border-border divide-y divide-border">
            {inserts.map((s, i) => (
              <li key={i} className="flex gap-3 px-4 py-2 text-sm"><span className="tabular-nums text-muted-foreground w-12 shrink-0">{clock(s.t)}</span><span>{s.what}</span></li>
            ))}
          </ul>
        </section>
      )}

      {d && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Titles, description & chapters</h3>
          <ul className="space-y-1">
            {d.titles.map((t, i) => <li key={i}><button onClick={() => copy(t, "Title")} className="w-full text-left text-sm rounded-lg border border-border px-3 py-2 hover:bg-accent/60">{t}</button></li>)}
          </ul>
          {description && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm whitespace-pre-wrap">{description}</p>
              <button onClick={() => copy(description, "Description")} className="mt-2 text-xs underline underline-offset-4">Copy</button>
              {!chapters.length && d.chapters.length > 0 && <p className="text-[11px] text-muted-foreground mt-2">Chapters left out: YouTube needs at least 3, each 10 seconds or longer.</p>}
            </div>
          )}
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold mb-1">Transcript</h3>
        <p className="text-xs text-muted-foreground mb-2">Struck-through lines are cut. Click any line to cut it or bring it back.</p>
        <ul className="rounded-xl border border-border divide-y divide-border max-h-[32rem] overflow-y-auto">
          {edit.segments.map((s, i) => {
            const isCut = why.has(i);
            return (
              <li key={i}>
                <button onClick={() => toggle(i)} disabled={!d} className="w-full flex gap-3 px-3 py-1.5 text-left text-sm hover:bg-accent/40 disabled:cursor-default">
                  <span className="tabular-nums text-xs text-muted-foreground w-11 shrink-0 pt-0.5">{clock(s.start)}</span>
                  <span className={cn("flex-1", isCut && "line-through text-muted-foreground/70")}>{s.text}</span>
                  {isCut && <span className="text-[11px] text-muted-foreground shrink-0 max-w-40 text-right">{why.get(i)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} className="inline-flex items-center gap-1.5 h-8 px-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent">
      <ArrowLeft className="w-4 h-4" /> Long-form
    </button>
  );
}
