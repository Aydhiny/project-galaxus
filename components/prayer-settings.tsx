"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Moon, Play, Square, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { VAKAT } from "@/lib/vaktija";
import { getPrayerStateC, getVaktijaLocationsC, savePrayerSettingsC } from "@/lib/client/prayer";
import { PRAYER_SETTINGS_EVENT, playAzan, stopAzan, usePrayerStore } from "@/components/azan-player";

type State = Awaited<ReturnType<typeof getPrayerStateC>>;

/** City (vaktija.ba), azan on/off, sabah azan, and your azan recording. */
export function PrayerSettings({ className }: { className?: string }) {
  const [s, setS] = useState<State | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [busy, start] = useTransition();
  const [playing, setPlaying] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const current = usePrayerStore((x) => x.current);

  const load = () => getPrayerStateC().then(setS).catch(() => {});
  useEffect(() => { load(); getVaktijaLocationsC().then(setCities).catch(() => {}); }, []);

  const save = (patch: { location?: number; azanEnabled?: boolean; azanFajr?: boolean }) => start(async () => {
    try { await savePrayerSettingsC(patch); await load(); window.dispatchEvent(new Event(PRAYER_SETTINGS_EVENT)); }
    catch (e) { toast.error((e as Error).message); }
  });

  async function upload(f: File | undefined) {
    if (!f) return;
    const body = new FormData();
    body.append("file", f);
    const res = await fetch("/api/azan", { method: "POST", body });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(j.error ?? "Upload failed."); return; }
    toast.success("Azan saved — it plays at each prayer time.");
    await load();
    window.dispatchEvent(new Event(PRAYER_SETTINGS_EVENT));
  }

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"><Moon className="w-5 h-5" /></span>
        <div className="flex-1">
          <p className="font-hud uppercase tracking-wide text-xl leading-none">Vaktija & azan</p>
          <p className="text-xs text-muted-foreground mt-1">Times from vaktija.ba for your city. The azan plays on any page, and the mosque in your empire lights up.</p>
        </div>
        {current && <span className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 text-xs font-medium animate-pulse">{current} now</span>}
      </div>

      {s?.vaktija && (
        <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {VAKAT.map((v, i) => (
            <div key={v.key} className={cn("rounded-xl border p-2 text-center", current === v.bs ? "border-emerald-500/50 bg-emerald-500/10" : "border-border")}>
              <p className="text-[11px] text-muted-foreground">{v.bs}</p>
              <p className="font-hud text-lg leading-none mt-1 tabular-nums">{s.vaktija!.times[i]}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">City
          <select value={s?.location ?? 77} onChange={(e) => save({ location: Number(e.target.value) })} className="input-base block mt-1 w-48">
            {(cities.length ? cities : ["Sarajevo"]).map((c, i) => <option key={c} value={cities.length ? i : 77}>{c}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-sm h-9">
          <input type="checkbox" checked={!!s?.azanEnabled} onChange={(e) => save({ azanEnabled: e.target.checked })} /> Play azan
        </label>
        <label className="inline-flex items-center gap-2 text-sm h-9 text-muted-foreground">
          <input type="checkbox" checked={!!s?.azanFajr} onChange={(e) => save({ azanFajr: e.target.checked })} disabled={!s?.azanEnabled} /> Include zora (sabah)
        </label>
        {busy && <Loader2 className="w-4 h-4 animate-spin mb-2.5" />}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 p-3">
        <p className="text-sm flex-1 min-w-48">{s?.azanFile ? <>Azan: <b>{s.azanFile.name}</b> <span className="text-muted-foreground text-xs">({Math.round(s.azanFile.bytes / 1024)} KB)</span></> : "No azan recording yet — upload your favourite (MP3, max 4 MB)."}</p>
        {s?.azanFile && (
          <button onClick={() => { if (playing) { stopAzan(); setPlaying(false); } else { void playAzan().then(() => setPlaying(true)).catch(() => toast.error("Couldn't play — tap again.")); } }}
            className="h-9 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-1.5">{playing ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />} {playing ? "Stop" : "Test"}</button>
        )}
        <button onClick={() => file.current?.click()} className="h-9 px-3 rounded-lg bg-foreground text-background text-sm inline-flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> {s?.azanFile ? "Replace" : "Upload azan"}</button>
        {s?.azanFile && (
          <button onClick={async () => { await fetch("/api/azan", { method: "DELETE" }); await load(); window.dispatchEvent(new Event(PRAYER_SETTINGS_EVENT)); }}
            className="w-9 h-9 rounded-lg text-muted-foreground hover:text-destructive inline-flex items-center justify-center" aria-label="Remove azan"><Trash2 className="w-4 h-4" /></button>
        )}
        <input ref={file} type="file" accept="audio/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      </div>
    </section>
  );
}
