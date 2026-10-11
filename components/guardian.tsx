"use client";

// Always mounted in the dashboard layout:
//  • Hold the line — an emergency screen with your own album (childhood → today)
//  • Sleep Guardian — chimes at wind-down, then a dark, locked "sleep time" screen
//  • Daily focus — a once-a-day invitation, then a distraction-free timer with your music

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Headphones, Moon, Shield, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { playChime } from "@/lib/chime";
import { inSleepWindow, inWindDown, nightKey } from "@/lib/sleep";
import { SLEEP_SETTINGS_EVENT, useGuardianStore } from "@/lib/store/guardian";
import { FOCUS_TRACK_ID, useMusicStore } from "@/lib/store/music";
import { getGuardianStateC, logFocusC, logUrgeC } from "@/lib/client/wellbeing";
import { getUpcomingMeetings } from "@/lib/client/calendar";
import type { Meeting } from "@/lib/calendar";
import { useRouter } from "next/navigation";

type Album = { id: number; year: number | null; caption: string | null }[];
type Sleep = { enabled: boolean; bedTime: string; wakeTime: string; windDownMinutes?: number };

/** A meeting that's live now or starts within `withinMin` minutes. */
const meetingSoon = (ms: Meeting[], withinMin: number, now = Date.now()) =>
  ms.find((m) => !m.allDay && new Date(m.end).getTime() > now && new Date(m.start).getTime() - now < withinMin * 60_000) ?? null;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function Guardian() {
  const [album, setAlbum] = useState<Album>([]);
  const [sleep, setSleep] = useState<Sleep | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const load = useCallback(() => {
    // Rough weeks (2+ late-night moments) start the wind-down 30 minutes earlier.
    getGuardianStateC().then((s) => { setAlbum(s.album); setSleep({ ...s.sleep, windDownMinutes: s.lateNights >= 2 ? 45 : 15 }); }).catch(() => {});
    getUpcomingMeetings().then((r) => setMeetings(r.connected ? r.meetings : [])).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 10 * 60_000);
    window.addEventListener(SLEEP_SETTINGS_EVENT, load);
    return () => { clearInterval(t); window.removeEventListener(SLEEP_SETTINGS_EVENT, load); };
  }, [load]);

  const sleeping = useSleepState(sleep, meetings);
  return (
    <>
      <HoldTheLine album={album} />
      {sleeping === "sleep" && sleep && <SleepScreen sleep={sleep} />}
      {sleeping === "winddown" && sleep && <WindDownBanner bedTime={sleep.bedTime} early={(sleep.windDownMinutes ?? 15) > 15} />}
      {sleeping === "awake" && <DailyFocus meetings={meetings} />}
      <FocusOverlay />
    </>
  );
}

// ─── Sleep Guardian ───────────────────────────────────────────────────────────

function useSleepState(sleep: Sleep | null, meetings: Meeting[]): "awake" | "winddown" | "sleep" {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 20_000); return () => clearInterval(t); }, []);
  const stopMusic = useMusicStore((s) => s.stop);
  // A meeting that's on (or about to start) always wins over the sleep screen.
  const busy = !!meetingSoon(meetings, 10, now.getTime());
  const state = !sleep?.enabled ? "awake"
    : !busy && inSleepWindow(now, sleep.bedTime, sleep.wakeTime) && Number(store.get(`sleep-snooze:${nightKey(now, sleep.wakeTime)}`) ?? 0) < now.getTime() ? "sleep"
    : inWindDown(now, sleep.bedTime, sleep.windDownMinutes ?? 15) ? "winddown" : "awake";

  // One chime per night for each phase.
  useEffect(() => {
    if (!sleep || state === "awake") return;
    const key = `sleep-chime:${state}:${nightKey(new Date(), sleep.wakeTime)}`;
    if (store.get(key)) return;
    store.set(key, "1");
    playChime(state === "sleep" ? "sleep" : "gentle");
    if (state === "sleep") stopMusic();
  }, [state, sleep, stopMusic]);
  return state;
}

function WindDownBanner({ bedTime, early }: { bedTime: string; early: boolean }) {
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[900] rounded-2xl border border-indigo-500/30 bg-indigo-950/90 text-indigo-100 px-5 py-3 shadow-xl flex items-center gap-3 animate-in fade-in-0 slide-in-from-bottom-2">
      <Moon className="w-5 h-5 text-indigo-300" />
      <p className="text-sm">Wind down — sleep time at <b>{bedTime}</b>. Phone out of the bedroom, lights low.{early && " (Earlier this week — the nights have been late.)"}</p>
    </div>
  );
}

function SleepScreen({ sleep }: { sleep: Sleep }) {
  const [now, setNow] = useState(() => new Date());
  const [holding, setHolding] = useState(0);
  const hold = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  const night = nightKey(now, sleep.wakeTime);
  const snoozed = !!store.get(`sleep-snooze-used:${night}`);

  // The only way past it: hold for 5 seconds, once per night, for 10 minutes. Real needs only.
  function startHold() {
    if (snoozed) return;
    const t0 = Date.now();
    hold.current = setInterval(() => {
      const p = Math.min(100, ((Date.now() - t0) / 5000) * 100);
      setHolding(p);
      if (p >= 100) {
        clearInterval(hold.current!);
        store.set(`sleep-snooze-used:${night}`, "1");
        store.set(`sleep-snooze:${night}`, String(Date.now() + 10 * 60_000));
        window.location.reload();
      }
    }, 50);
  }
  function stopHold() { if (hold.current) clearInterval(hold.current); setHolding(0); }

  return (
    <div className="fixed inset-0 z-[1000] bg-black text-white flex flex-col items-center justify-center select-none animate-in fade-in-0 duration-1000">
      <Moon className="w-14 h-14 text-indigo-300/80 animate-pulse" />
      <p className="mt-6 font-hud uppercase tracking-[0.3em] text-sm text-white/50">Sleep time</p>
      <p className="mt-2 font-hud text-7xl tabular-nums" suppressHydrationWarning>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
      <p className="mt-4 text-white/60 text-center max-w-sm px-6">Galaxus opens again at <b className="text-white/90">{sleep.wakeTime}</b>.<br />Rest is part of the work. Laku noć, Ajdine.</p>
      <p className="mt-10 text-white/30 text-xs">Bismillah — &quot;Bismike Allahumme emutu ve ahja&quot;</p>
      {!snoozed && (
        <button onPointerDown={startHold} onPointerUp={stopHold} onPointerLeave={stopHold}
          className="absolute bottom-8 text-[11px] text-white/25 hover:text-white/50 px-3 py-2 rounded-lg border border-white/10 overflow-hidden">
          <span className="absolute inset-y-0 left-0 bg-white/10" style={{ width: `${holding}%` }} />
          <span className="relative">Hold 5s · I really need 10 minutes (once a night)</span>
        </button>
      )}
    </div>
  );
}

// ─── Hold the line ────────────────────────────────────────────────────────────

const TRIGGERS = [
  { key: "tired", label: "Tired" }, { key: "alone", label: "Alone" }, { key: "late", label: "Late night" },
  { key: "stressed", label: "Stressed" }, { key: "bored", label: "Bored" }, { key: "phone", label: "Scrolling" }, { key: "sad", label: "Down" },
];
const ACTIONS = ["20 push-ups, right now", "Step outside for 5 minutes", "Cold water on your face", "Text a friend or your brother", "Make wudu"];

function HoldTheLine({ album }: { album: Album }) {
  const open = useGuardianStore((s) => s.emergency);
  const close = useGuardianStore((s) => s.closeEmergency);
  // Mounted fresh each time it opens, so the timer and album always start over.
  return open ? <EmergencyScreen album={album} close={close} /> : null;
}

function EmergencyScreen({ album, close }: { album: Album; close: () => void }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(600);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [triggers, setTriggers] = useState<string[]>([]);
  const [done, setDone] = useState<Set<number>>(() => new Set());

  // The album plays from childhood to today; a 10-minute timer; slow breathing.
  useEffect(() => {
    const slides = setInterval(() => setI((x) => x + 1), 5000);
    const tick = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    const breathe = setInterval(() => setPhase((p) => (p === "in" ? "out" : "in")), 4000);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") e.preventDefault(); };
    window.addEventListener("keydown", onKey);
    return () => { clearInterval(slides); clearInterval(tick); clearInterval(breathe); window.removeEventListener("keydown", onKey); };
  }, []);

  const photo = album.length ? album[i % album.length] : null;

  function held() {
    logUrgeC("held", triggers).catch(() => {});
    playChime("done");
    toast.success("You held the line. That's a win — it counts.", {
      duration: 10_000,
      action: { label: "Write 2 lines", onClick: () => router.push("/diary?reflect=held") },
    });
    close();
  }

  return (
    <div className="fixed inset-0 z-[1100] bg-black text-white overflow-hidden animate-in fade-in-0 duration-500">
      {photo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={photo.id} src={`/api/memories/${photo.id}`} alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-70 animate-in fade-in-0 zoom-in-105 duration-[2000ms]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/60" />
          <div className="absolute top-6 left-6 right-6 flex items-start justify-between">
            <div>
              {photo.year && <p className="font-hud text-5xl leading-none text-white/90">{photo.year}</p>}
              {photo.caption && <p className="mt-1 text-white/70">{photo.caption}</p>}
            </div>
            <p className="text-xs text-white/40">{(i % album.length) + 1} / {album.length}</p>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex items-start justify-center pt-24 text-white/50 text-sm text-center px-6">
          Add your family photos — childhood to today — in <Link href="/hold" onClick={close} className="underline ml-1">Hold the line</Link>. They play here.
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-6 md:p-10 flex flex-col items-center text-center">
        <div className="relative w-28 h-28 flex items-center justify-center">
          <span className={cn("absolute inset-0 rounded-full border-2 border-teal-300/60 transition-transform duration-[4000ms] ease-in-out", phase === "in" ? "scale-100" : "scale-50")} />
          <span className="font-hud uppercase tracking-widest text-sm">{phase === "in" ? "Breathe in" : "Breathe out"}</span>
        </div>
        <p className="mt-4 font-hud text-4xl tabular-nums">{mmss(left)}</p>
        <p className="mt-1 text-white/70 max-w-md">The urge peaks and passes in about 10 minutes. You only have to win <i>these</i> ten.</p>
        <p className="mt-2 text-teal-200/80 text-sm">E&apos;uzu billahi mineš-šejtanir-radžim · &quot;Mali Ajdin bi bio ponosan.&quot;</p>

        <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-2xl">
          {ACTIONS.map((a, k) => (
            <button key={a} onClick={() => setDone((d) => new Set(d).add(k))}
              className={cn("h-9 px-3 rounded-full text-sm border transition-colors", done.has(k) ? "bg-teal-400/20 border-teal-300/60" : "border-white/20 hover:bg-white/10")}>
              {done.has(k) && <Check className="w-3.5 h-3.5 inline mr-1" />}{a}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          <span className="text-xs text-white/40 self-center mr-1">What&apos;s going on? (private)</span>
          {TRIGGERS.map((t) => (
            <button key={t.key} onClick={() => setTriggers((x) => (x.includes(t.key) ? x.filter((y) => y !== t.key) : [...x, t.key]))}
              className={cn("h-7 px-2.5 rounded-full text-xs border", triggers.includes(t.key) ? "bg-white/20 border-white/50" : "border-white/15 text-white/60")}>{t.label}</button>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button onClick={held} className="h-11 px-6 rounded-xl bg-teal-400 text-black font-semibold inline-flex items-center gap-2">
            <Shield className="w-4 h-4" /> I held the line
          </button>
          <button onClick={close} className="h-11 px-4 rounded-xl border border-white/20 text-white/70 text-sm" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Daily focus ──────────────────────────────────────────────────────────────

function DailyFocus({ meetings }: { meetings: Meeting[] }) {
  const prompt = useGuardianStore((s) => s.focusPrompt);
  const openPrompt = useGuardianStore((s) => s.openFocusPrompt);
  const closePrompt = useGuardianStore((s) => s.closeFocusPrompt);
  const start = useGuardianStore((s) => s.startFocus);
  const play = useMusicStore((s) => s.play);
  const [minutes, setMinutes] = useState(50);
  const [label, setLabel] = useState("");
  const [music, setMusic] = useState(true);
  // A clock that ticks only while the prompt is open (render must stay pure).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!prompt) return;
    const sync = () => setNow(Date.now());
    const first = setTimeout(sync, 0);
    const t = setInterval(sync, 30_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [prompt]);

  // Once a day, a few seconds after you open Galaxus.
  useEffect(() => {
    if (store.get("focus-offered") === today()) return;
    const t = setTimeout(() => { store.set("focus-offered", today()); openPrompt(); }, 2500);
    return () => clearTimeout(t);
  }, [openPrompt]);

  if (!prompt) return null;
  // Don't plan a 90-minute block straight into a call.
  const next = meetingSoon(meetings, 120, now);
  const minsToMeeting = next ? Math.max(0, Math.round((new Date(next.start).getTime() - now) / 60_000)) : null;
  return (
    <div className="fixed inset-0 z-[950] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-0">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center"><Target className="w-5 h-5" /></span>
          <div>
            <p className="font-hud uppercase tracking-wide text-xl leading-none">Focus mode</p>
            <p className="text-xs text-muted-foreground mt-1">One thing. No distractions. Your music.</p>
          </div>
        </div>
        <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="The one thing I'll finish…"
          className="mt-5 w-full h-11 rounded-xl border border-border bg-transparent px-3 text-sm" />
        {next && minsToMeeting !== null && (
          <p className="mt-3 text-xs rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-200 p-2">
            📅 &quot;{next.title}&quot; {minsToMeeting === 0 ? "is on now" : `starts in ${minsToMeeting} min`} — sessions longer than that are disabled.
          </p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[25, 50, 90].map((m) => (
            <button key={m} onClick={() => setMinutes(m)} disabled={minsToMeeting !== null && m > minsToMeeting}
              className={cn("h-11 rounded-xl border font-hud text-lg disabled:opacity-30 disabled:line-through", minutes === m ? "border-teal-500 bg-teal-500/10" : "border-border text-muted-foreground")}>{m} min</button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={music} onChange={(e) => setMusic(e.target.checked)} /> <Headphones className="w-4 h-4" /> Play my focus music
        </label>
        <div className="mt-5 flex gap-2">
          <button onClick={() => { if (music) play(FOCUS_TRACK_ID); start({ minutes: minsToMeeting !== null ? Math.max(5, Math.min(minutes, minsToMeeting - 2)) : minutes, label: label.trim() || "Deep work", startedAt: Date.now() }); }}
            className="flex-1 h-11 rounded-xl bg-foreground text-background font-medium">Start focus</button>
          <button onClick={closePrompt} className="h-11 px-4 rounded-xl border border-border text-sm text-muted-foreground">Not now</button>
        </div>
      </div>
    </div>
  );
}

function FocusOverlay() {
  const run = useGuardianStore((s) => s.focus);
  const end = useGuardianStore((s) => s.endFocus);
  const stopMusic = useMusicStore((s) => s.stop);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run]);

  const finish = useCallback((completed: boolean) => {
    if (!run) return;
    const mins = Math.round((Date.now() - run.startedAt) / 60_000);
    if (mins >= 1) logFocusC(completed ? run.minutes : mins, run.label, completed).catch(() => {});
    if (completed) { playChime("done"); toast.success(`Focus done — ${run.minutes} minutes on "${run.label}". +Discipline XP`); }
    stopMusic();
    end();
  }, [run, end, stopMusic]);

  const total = run ? run.minutes * 60 : 0;
  const elapsed = run ? Math.floor((now - run.startedAt) / 1000) : 0;
  const remaining = Math.max(0, total - elapsed);
  useEffect(() => { if (run && remaining === 0) finish(true); }, [run, remaining, finish]);

  if (!run) return null;
  const pct = total ? (elapsed / total) * 100 : 0;
  return (
    <div className="fixed inset-0 z-[940] bg-background flex flex-col items-center justify-center animate-in fade-in-0">
      <p className="font-hud uppercase tracking-[0.3em] text-xs text-muted-foreground">Focus mode</p>
      <p className="mt-3 text-xl font-medium text-center px-6 max-w-xl">{run.label}</p>
      <p className="mt-6 font-hud text-8xl tabular-nums">{mmss(remaining)}</p>
      <div className="mt-6 w-72 h-1.5 bg-muted overflow-hidden -skew-x-12">
        <div className="h-full bg-teal-400 transition-[width] duration-1000" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Phone face down. Everything else can wait {Math.ceil(remaining / 60)} minutes.</p>
      <button onClick={() => finish(false)} className="mt-10 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4">End early</button>
    </div>
  );
}
