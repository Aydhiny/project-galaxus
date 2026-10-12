"use client";

// Shorts studio: drop a voice recording → a worker on your PC turns it into
// one or more short-form videos with your game footage (Claude Code + your
// own pipeline in C:\tmp\hm2_short). Galaxus queues and shows results; the
// rendering happens locally, where the footage is.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Clapperboard, Copy, Loader2, Mic, MonitorDown, RotateCw, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { createShortsWorkerTokenC, deleteShortJobC, getShortJobsC, retryShortJobC, type ShortJobsState } from "@/lib/client/shorts";

const CHUNK = 3 * 1024 * 1024; // must match lib/services/shorts.ts (a multiple of 3 so base64 joins cleanly)
const STATUS: Record<string, { label: string; tone: string }> = {
  uploading: { label: "Uploading", tone: "bg-muted text-muted-foreground" },
  queued: { label: "Waiting for your PC", tone: "bg-amber-500/12 text-amber-700 dark:text-amber-300" },
  working: { label: "Editing…", tone: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  done: { label: "Ready", tone: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  failed: { label: "Failed", tone: "bg-rose-500/12 text-rose-700 dark:text-rose-300" },
};

export function ShortsStudio() {
  const [state, setState] = useState<ShortJobsState | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [count, setCount] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => getShortJobsC().then(setState).catch(() => {}), []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 20_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  async function upload() {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error("Over 20 MB — export the recording at a lower bitrate."); return; }
    setProgress(0);
    try {
      let jobId = 0;
      for (let off = 0, i = 0; off < Math.max(1, file.size); off += CHUNK, i++) {
        const fd = new FormData();
        fd.set("chunk", file.slice(off, off + CHUNK));
        fd.set("final", off + CHUNK >= file.size ? "1" : "0");
        if (jobId) fd.set("jobId", String(jobId));
        else { fd.set("name", file.name); fd.set("mime", file.type || "audio/mpeg"); fd.set("notes", notes); fd.set("count", String(count)); }
        const res = await fetch("/api/shorts/upload", { method: "POST", body: fd });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Upload failed.");
        jobId = body.id;
        setProgress(Math.min(1, (off + CHUNK) / file.size));
        if (off + CHUNK >= file.size) break;
      }
      toast.success("Recording queued — your PC picks it up next.");
      setFile(null); setNotes(""); if (input.current) input.current.value = "";
      void load();
    } catch (e) { toast.error((e as Error).message); }
    setProgress(null);
  }

  const online = state?.workerSeenAt && Date.now() - new Date(state.workerSeenAt).getTime() < 3 * 60_000;
  const command = token ? `node scripts/shorts-worker.mjs --token ${token}` : "";

  return (
    <section data-room-spot="prop" className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-lg bg-violet-500/12 text-violet-600 dark:text-violet-400 flex items-center justify-center"><Clapperboard className="w-4 h-4" /></span>
          <div>
            <h2 className="font-semibold">Shorts studio</h2>
            <p className="text-xs text-muted-foreground">Drop a voice recording. Claude edits it into Shorts with your game footage, on your own PC.</p>
          </div>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", online ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
          <span className={cn("w-1.5 h-1.5 rounded-full", online ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50")} />
          {online ? "Your PC is ready" : state?.workerSeenAt ? "PC worker offline" : "PC worker not connected"}
        </span>
      </div>

      {/* Upload */}
      <div className="mt-4 grid gap-2">
        <button type="button" onClick={() => input.current?.click()}
          className="rounded-xl border-2 border-dashed border-border hover:border-foreground/30 px-4 py-6 text-center transition-colors"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}>
          <Mic className="w-6 h-6 mx-auto text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">{file ? file.name : "Drop your voice recording here"}</p>
          <p className="text-xs text-muted-foreground">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "mp3 · wav · m4a · ogg, up to 20 MB"}</p>
        </button>
        <input ref={input} type="file" accept="audio/*,video/mp4" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes for the editor (optional): topic, footage you want, title ideas…"
          className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">How many Shorts:</span>
          {[0, 1, 2, 3].map((n) => (
            <button key={n} onClick={() => setCount(n)} className={cn("h-8 px-3 rounded-full text-xs border", count === n ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>{n === 0 ? "Let Claude decide" : n}</button>
          ))}
          <button onClick={() => void upload()} disabled={!file || progress != null}
            className="ml-auto h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
            {progress != null ? <><Loader2 className="w-4 h-4 animate-spin" /> {Math.round(progress * 100)}%</> : <><Upload className="w-4 h-4" /> Send to the editor</>}
          </button>
        </div>
      </div>

      {/* Connect the PC worker */}
      {!online && (
        <div className="mt-4 rounded-xl bg-muted/50 p-3 text-xs space-y-2">
          <p className="font-medium flex items-center gap-1.5"><MonitorDown className="w-3.5 h-3.5" /> Connect your PC (once)</p>
          <p className="text-muted-foreground">The worker runs on the computer with your footage and the video pipeline. It uses your Claude Code login and renders at low priority. In the Galaxus project folder, run:</p>
          {token ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-background border border-border px-2 py-1.5 font-mono text-[11px] break-all">{command}</code>
              <button onClick={() => { void navigator.clipboard.writeText(command); toast.success("Copied — the token is shown only once."); }} className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center"><Copy className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => createShortsWorkerTokenC().then(setToken).catch((e) => toast.error((e as Error).message))} className="h-8 px-3 rounded-lg bg-foreground text-background font-medium">Create worker token</button>
          )}
          <p className="text-muted-foreground">The token only works for Shorts jobs — it can&apos;t read your tasks or anything else. After the first run it&apos;s remembered, so next time just <code className="font-mono">node scripts/shorts-worker.mjs</code>.</p>
        </div>
      )}

      {/* Jobs */}
      {state && state.jobs.length > 0 && (
        <ul className="mt-5 space-y-3">
          {state.jobs.map((j) => {
            const st = STATUS[j.status] ?? STATUS.queued;
            return (
              <li key={j.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium truncate flex-1">{j.audioName ?? `Recording #${j.id}`}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium inline-flex items-center gap-1", st.tone)}>
                    {j.status === "working" && <Loader2 className="w-3 h-3 animate-spin" />}{j.status === "done" && <Check className="w-3 h-3" />}{st.label}
                  </span>
                  {j.status === "failed" && <button onClick={() => retryShortJobC(j.id).then(load).catch((e) => toast.error((e as Error).message))} title="Try again" className="h-7 w-7 rounded-md hover:bg-muted inline-flex items-center justify-center"><RotateCw className="w-3.5 h-3.5" /></button>}
                  {j.status !== "working" && <button onClick={() => { if (confirm("Remove this job? (Rendered videos on your PC stay.)")) deleteShortJobC(j.id).then(load).catch(() => {}); }} title="Remove" className="h-7 w-7 rounded-md hover:bg-muted inline-flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
                {j.notes && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{j.notes}</p>}
                {j.results && j.results.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {j.results.map((r) => (
                      <div key={r.file} className="rounded-lg border border-border overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {r.thumb ? <img src={r.thumb} alt="" className="w-full aspect-[9/16] object-cover bg-muted" /> : <div className="w-full aspect-[9/16] bg-muted" />}
                        <div className="p-2">
                          <p className="text-xs font-medium leading-snug line-clamp-2">{r.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{r.seconds ? `${Math.round(r.seconds)}s · ` : ""}<button onClick={() => { void navigator.clipboard.writeText(r.file); toast.success("Path copied."); }} className="underline-offset-2 hover:underline">copy path</button></p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {j.status === "failed" && j.log && <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-muted p-2 text-[10px] whitespace-pre-wrap">{j.log.slice(-800)}</pre>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
