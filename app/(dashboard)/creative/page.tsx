"use client";

import { useEffect, useTransition, useState, useRef, useCallback } from "react";
import { getRecentCheckins } from "@/lib/actions/checkin";
import type { DailyCheckin } from "@/lib/db/schema";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { Music, Palette, Tv, Flame, Play, Square, Clock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Production session types + localStorage ────────────────────────────────

interface ProductionSession {
  id: string;
  project: string;
  genre: string;
  daw: string;
  durationMs: number;
  notes: string;
  startedAt: string;
}

const SESSIONS_KEY = "galaxus-production-sessions";

function loadSessions(): ProductionSession[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]"); } catch { return []; }
}
function saveSessions(s: ProductionSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(s));
}
function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function SessionLogger() {
  const [sessions, setSessions] = useState<ProductionSession[]>([]);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [form, setForm] = useState({ project: "", genre: "", daw: "", notes: "" });
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  useEffect(() => { setSessions(loadSessions()); }, []);

  const tick = useCallback(() => {
    setElapsed(Date.now() - startRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  function startSession() {
    startRef.current = Date.now();
    setElapsed(0);
    setRunning(true);
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopSession() {
    cancelAnimationFrame(rafRef.current);
    setRunning(false);
    const durationMs = Date.now() - startRef.current;
    if (durationMs < 5000) { setElapsed(0); return; } // ignore accidental taps < 5s
    const session: ProductionSession = {
      id: crypto.randomUUID(),
      project: form.project || "Untitled",
      genre: form.genre,
      daw: form.daw,
      notes: form.notes,
      durationMs,
      startedAt: new Date(startRef.current).toISOString(),
    };
    const updated = [session, ...sessions];
    setSessions(updated);
    saveSessions(updated);
    setElapsed(0);
  }

  function deleteSession(id: string) {
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    saveSessions(updated);
  }

  const totalMs = sessions.reduce((acc, s) => acc + s.durationMs, 0);
  const thisWeekMs = sessions
    .filter(s => new Date(s.startedAt) > subDays(new Date(), 7))
    .reduce((acc, s) => acc + s.durationMs, 0);

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-5" style={{ borderColor: "oklch(0.65 0.20 290 / 20%)" }}>
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" style={{ color: "oklch(0.65 0.20 290)" }} />
        <h2 className="font-semibold">Production Session Logger</h2>
      </div>

      {/* Session stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/40 p-3 space-y-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">This Week</p>
          <p className="text-xl font-bold" style={{ color: "oklch(0.65 0.20 290)" }}>{formatDuration(thisWeekMs)}</p>
        </div>
        <div className="rounded-xl bg-muted/40 p-3 space-y-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">All Time</p>
          <p className="text-xl font-bold" style={{ color: "oklch(0.65 0.20 290)" }}>{formatDuration(totalMs)}</p>
        </div>
      </div>

      {/* Session form */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Input placeholder="Project / track name" value={form.project}
          onChange={e => setForm(f => ({ ...f, project: e.target.value }))}
          className="col-span-2 sm:col-span-1 bg-foreground/[0.05] border-border text-sm" />
        <Input placeholder="Genre (trap, afro...)" value={form.genre}
          onChange={e => setForm(f => ({ ...f, genre: e.target.value }))}
          className="bg-foreground/[0.05] border-border text-sm" />
        <Input placeholder="DAW (FL, Ableton...)" value={form.daw}
          onChange={e => setForm(f => ({ ...f, daw: e.target.value }))}
          className="bg-foreground/[0.05] border-border text-sm" />
      </div>

      {/* Timer */}
      <div className="flex items-center gap-4">
        <div className={cn(
          "text-3xl font-mono font-bold tabular-nums transition-colors",
          running ? "text-[var(--gold)]" : "text-muted-foreground"
        )}>
          {formatDuration(elapsed || 0)}
        </div>
        {!running ? (
          <Button onClick={startSession}
            className="] font-semibold rounded-xl gap-2">
            <Play className="w-4 h-4" /> Start Session
          </Button>
        ) : (
          <Button onClick={stopSession} variant="outline"
            className="border-red-400/40 text-red-400 hover:bg-red-400/10 rounded-xl gap-2">
            <Square className="w-4 h-4" /> Stop & Save
          </Button>
        )}
      </div>

      {/* Session history */}
      {sessions.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-widest pt-1">Recent Sessions</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sessions.slice(0, 20).map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-foreground/[0.04] px-3 py-2.5 group">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold truncate">{s.project}</p>
                    {s.genre && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-foreground/[0.08] text-muted-foreground">{s.genre}</span>}
                    {s.daw && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-foreground/[0.08] text-muted-foreground">{s.daw}</span>}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {format(new Date(s.startedAt), "MMM d, HH:mm")} · {formatDuration(s.durationMs)}
                  </p>
                </div>
                <button onClick={() => deleteSession(s.id)}
                  className="text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreativePage() {
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const data = await getRecentCheckins(30);
      setCheckins(data);
    });
  }, []);

  const checkinMap = new Map(checkins.map((c) => [c.date, c]));
  const last30 = eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() });

  function calcStreak(field: "music" | "design" | "youtube") {
    let s = 0;
    for (let i = 0; i < 30; i++) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd");
      const c = checkinMap.get(d);
      if (c?.[field]) s++;
      else break;
    }
    return s;
  }

  const musicStreak = calcStreak("music");
  const designStreak = calcStreak("design");
  const ytStreak = calcStreak("youtube");

  const musicDays = checkins.filter((c) => c.music).length;
  const designDays = checkins.filter((c) => c.design).length;
  const ytDays = checkins.filter((c) => c.youtube).length;
  const totalMusicMins = checkins.reduce((s, c) => s + (c.musicMinutes ?? 0), 0);

  function ActivityGrid({ field }: { field: "music" | "design" | "youtube" }) {
    return (
      <div className="grid grid-cols-10 gap-1">
        {last30.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const c = checkinMap.get(dateStr);
          const active = c?.[field] ?? false;
          const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
          return (
            <div
              key={dateStr}
              title={`${format(day, "MMM d")}: ${active ? "✓" : "—"}`}
              className={`aspect-square rounded-sm ${isToday ? "ring-1 ring-[var(--gold)] ring-offset-1 ring-offset-background" : ""}`}
              style={{
                background: active
                  ? field === "music"
                    ? "oklch(0.65 0.20 290 / 80%)"
                    : field === "design"
                    ? "oklch(0.72 0.12 85 / 80%)"
                    : "oklch(0.60 0.22 25 / 80%)"
                  : "oklch(1 0 0 / 5%)",
              }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="page max-w-4xl">
      {/* Header */}
      <div>
        <p className="section-label mb-1">Creative</p>
        <h1 className="text-2xl font-bold heading-gradient" style={{ fontFamily: "var(--font-heading)" }}>Creative Studio</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Music · Design · YouTube — your art, tracked.
        </p>
      </div>

      {/* Production session logger */}
      <SessionLogger />

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border bg-card p-4 text-center" style={{ borderColor: "oklch(0.65 0.20 290 / 30%)" }}>
          <Music className="w-5 h-5 mx-auto mb-2" style={{ color: "oklch(0.65 0.20 290)" }} />
          <p className="text-2xl font-bold" style={{ color: "oklch(0.65 0.20 290)" }}>{musicStreak}</p>
          <p className="text-xs text-muted-foreground mt-1">Music streak (days)</p>
        </div>
        <div className="rounded-2xl border border-[var(--gold)]/30 bg-card p-4 text-center">
          <Palette className="w-5 h-5 mx-auto mb-2 text-[var(--gold)]" />
          <p className="text-2xl font-bold text-[var(--gold)]">{designStreak}</p>
          <p className="text-xs text-muted-foreground mt-1">Design streak (days)</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 text-center" style={{ borderColor: "oklch(0.60 0.22 25 / 30%)" }}>
          <Tv className="w-5 h-5 mx-auto mb-2" style={{ color: "oklch(0.60 0.22 25)" }} />
          <p className="text-2xl font-bold" style={{ color: "oklch(0.60 0.22 25)" }}>{ytStreak}</p>
          <p className="text-xs text-muted-foreground mt-1">YouTube streak (days)</p>
        </div>
      </div>

      {/* Music section */}
      <div className="rounded-2xl border bg-card p-6 space-y-4" style={{ borderColor: "oklch(0.65 0.20 290 / 20%)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4" style={{ color: "oklch(0.65 0.20 290)" }} />
            <h2 className="font-semibold">Music & Production</h2>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold" style={{ color: "oklch(0.65 0.20 290)" }}>
              {Math.round(totalMusicMins / 60)}h {totalMusicMins % 60}m
            </p>
            <p className="text-[10px] text-muted-foreground">total (30d)</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-foreground/[0.03] rounded-xl p-3">
            <p className="text-muted-foreground text-xs">Days active</p>
            <p className="font-bold text-lg mt-0.5" style={{ color: "oklch(0.65 0.20 290)" }}>{musicDays}</p>
          </div>
          <div className="bg-foreground/[0.03] rounded-xl p-3">
            <p className="text-muted-foreground text-xs">Avg per session</p>
            <p className="font-bold text-lg mt-0.5" style={{ color: "oklch(0.65 0.20 290)" }}>
              {musicDays > 0 ? Math.round(totalMusicMins / musicDays) : 0}m
            </p>
          </div>
        </div>

        <ActivityGrid field="music" />

        <div className="pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Music className="w-3.5 h-3.5 inline shrink-0" /> <strong className="text-foreground">Aydhiny</strong> — 5M+ streams, 5000+ beats. Keep creating.
          </p>
        </div>
      </div>

      {/* Design section */}
      <div className="glass p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-[var(--gold)]" />
            <h2 className="font-semibold">Design</h2>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-[var(--gold)]">{designDays}</p>
            <p className="text-[10px] text-muted-foreground">days active (30d)</p>
          </div>
        </div>
        <ActivityGrid field="design" />
      </div>

      {/* YouTube section */}
      <div className="rounded-2xl border bg-card p-6 space-y-4" style={{ borderColor: "oklch(0.60 0.22 25 / 20%)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tv className="w-4 h-4" style={{ color: "oklch(0.60 0.22 25)" }} />
            <h2 className="font-semibold">YouTube</h2>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold" style={{ color: "oklch(0.60 0.22 25)" }}>{ytDays}</p>
            <p className="text-[10px] text-muted-foreground">content days (30d)</p>
          </div>
        </div>
        <ActivityGrid field="youtube" />
        <div className="pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Tv className="w-3.5 h-3.5 inline shrink-0" /> Building your channel one video at a time. Consistency is the only strategy.
          </p>
        </div>
      </div>

      {/* Motivation */}
      <div className="rounded-2xl border border-[var(--gold)]/15 bg-[var(--gold-muted)] p-5 flex items-center gap-4">
        <Flame className="w-5 h-5 text-[var(--gold)] shrink-0" />
        <div>
          <p className="text-sm font-semibold text-[var(--gold)]">
            You operate across disciplines — code, sound, and visuals.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cross-domain creativity is your superpower. Never stop making.
          </p>
        </div>
      </div>
    </div>
  );
}
