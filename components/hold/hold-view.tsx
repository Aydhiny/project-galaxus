"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Moon, Shield, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGuardianStore, SLEEP_SETTINGS_EVENT } from "@/lib/store/guardian";
import { addMemoryC, deleteMemoryC, logUrgeC, saveSleepSettingsC, updateMemoryC, type HoldState } from "@/lib/client/wellbeing";

const hud = "font-hud uppercase tracking-wide";

/** Shrink a photo in the browser before upload: ≤1400px, JPEG — usually 100–250 KB. */
async function compress(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const q of [0.82, 0.7, 0.55]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length < 1_100_000) return url;
  }
  throw new Error(`${file.name} is too large.`);
}

/** Best guess at the year from the photo's own date (you can fix it after). */
const yearOf = (f: File) => new Date(f.lastModified).getFullYear();

export function HoldView({ state }: { state: HoldState }) {
  const openEmergency = useGuardianStore((s) => s.openEmergency);
  const { stats, album } = state;
  return (
    <div className="max-w-4xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-rose-500/12 text-rose-600 dark:text-rose-400 flex items-center justify-center"><Shield className="w-5 h-5" /></span>
            Hold the line
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Your emergency button, your people, and your sleep. Private to you.</p>
        </div>
      </header>

      <button onClick={openEmergency}
        className="mt-6 w-full rounded-3xl border border-rose-500/40 bg-gradient-to-br from-rose-500/15 to-transparent p-8 text-left hover:border-rose-500/70 transition-colors group">
        <Shield className="w-8 h-8 text-rose-500 group-hover:scale-110 transition-transform" />
        <p className={cn("mt-3 text-3xl", hud)}>Hold the line</p>
        <p className="text-sm text-muted-foreground mt-1">Tap when an urge hits. Your album plays, a 10-minute timer runs, you breathe. Also in the top bar (shield icon), on every page.</p>
      </button>

      <section className="mt-6 grid sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className={cn("text-4xl tabular-nums leading-none", hud)}>{stats.wonThisMonth}<span className="text-lg text-muted-foreground">/{stats.daysSoFar}</span></p>
          <p className="text-xs text-muted-foreground mt-1">days won this month</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className={cn("text-4xl tabular-nums leading-none", hud)}>{stats.heldLast90}</p>
          <p className="text-xs text-muted-foreground mt-1">times you held the line (90 days)</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-medium">{stats.topTriggers.length ? stats.topTriggers.join(" · ") : "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">your most common moments — plan for them</p>
        </div>
      </section>
      <SlipLogger />

      <AlbumManager album={album} />
      <SleepSettings sleep={state.sleep} />
    </div>
  );
}

function SlipLogger() {
  const [pending, start] = useTransition();
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      Slipped? It costs one day, not everything.{" "}
      <button disabled={pending} onClick={() => start(async () => { await logUrgeC("slipped").catch(() => {}); toast("Logged. Tomorrow is a new day won — keep going.", { duration: 5000 }); })}
        className="underline underline-offset-4 hover:text-foreground">Log it honestly</button>
    </p>
  );
}

function AlbumManager({ album }: { album: HoldState["album"] }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    let ok = 0;
    for (const [k, f] of [...files].entries()) {
      setBusy(`${k + 1}/${files.length}`);
      try {
        await addMemoryC({ dataUrl: await compress(f), year: yearOf(f) });
        ok++;
      } catch (e) { toast.error((e as Error).message); }
    }
    setBusy(null);
    if (ok) toast.success(`${ok} photo${ok === 1 ? "" : "s"} added. Set the right year so they play in order.`);
    if (input.current) input.current.value = "";
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
        <div>
          <h2 className={cn("text-xl", hud)}>Your album</h2>
          <p className="text-xs text-muted-foreground">Childhood to today — family, brother, dedo, the people you do this for. Plays in year order. Stored privately in your database.</p>
        </div>
        <button onClick={() => input.current?.click()} disabled={!!busy}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} {busy ? `Uploading ${busy}` : "Add photos"}
        </button>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {album.length === 0 ? (
        <button onClick={() => input.current?.click()} className="w-full rounded-2xl border border-dashed border-border p-10 text-sm text-muted-foreground hover:text-foreground">
          No photos yet — add a few from when you were a kid up to today.
        </button>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {album.map((m) => <AlbumTile key={m.id} m={m} />)}
        </ul>
      )}
    </section>
  );
}

function AlbumTile({ m }: { m: HoldState["album"][number] }) {
  const [year, setYear] = useState(m.year?.toString() ?? "");
  const [caption, setCaption] = useState(m.caption ?? "");
  const save = (patch: { year?: number | null; caption?: string | null }) => updateMemoryC(m.id, patch).catch((e) => toast.error((e as Error).message));
  return (
    <li className="rounded-xl border border-border bg-card overflow-hidden group">
      <div className="relative aspect-square bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/memories/${m.id}`} alt="" loading="lazy" className="w-full h-full object-cover" />
        <button onClick={() => { if (confirm("Remove this photo?")) deleteMemoryC(m.id).catch((e) => toast.error((e as Error).message)); }}
          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center" aria-label="Remove">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2 flex gap-1.5">
        <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} onBlur={() => save({ year: year ? Number(year) : null })}
          placeholder="Year" inputMode="numeric" className={cn("w-14 bg-transparent text-sm tabular-nums outline-none", hud)} />
        <input value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={() => save({ caption })}
          placeholder="Caption" className="flex-1 min-w-0 bg-transparent text-xs outline-none" />
      </div>
    </li>
  );
}

function SleepSettings({ sleep }: { sleep: HoldState["sleep"] }) {
  const [f, setF] = useState(sleep);
  const [pending, start] = useTransition();
  return (
    <section className="mt-10 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"><Moon className="w-4 h-4" /></span>
        <div className="flex-1">
          <h2 className={cn("text-xl leading-none", hud)}>Sleep Guardian</h2>
          <p className="text-xs text-muted-foreground mt-1">15 minutes before bedtime: a chime and a wind-down note. At bedtime: a chime, music stops, and Galaxus goes dark until you wake — on every device.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> On
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">Bedtime
          <input type="time" value={f.bedTime} onChange={(e) => setF({ ...f, bedTime: e.target.value })} className="input-base block mt-1 w-32" />
        </label>
        <label className="text-xs text-muted-foreground">Wake time
          <input type="time" value={f.wakeTime} onChange={(e) => setF({ ...f, wakeTime: e.target.value })} className="input-base block mt-1 w-32" />
        </label>
        <button disabled={pending}
          onClick={() => start(async () => {
            try { await saveSleepSettingsC(f); window.dispatchEvent(new Event(SLEEP_SETTINGS_EVENT)); toast.success(f.enabled ? `Sleep Guardian on — ${f.bedTime} to ${f.wakeTime}.` : "Sleep Guardian off."); }
            catch (e) { toast.error((e as Error).message); }
          })}
          className="h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium disabled:opacity-60">Save</button>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">The only way past the sleep screen: hold a button for 5 seconds — once a night, for 10 minutes. For real needs.</p>
    </section>
  );
}
