"use client";

import { useEffect, useTransition, useState } from "react";
import { getRecentCheckins } from "@/lib/actions/checkin";
import type { DailyCheckin } from "@/lib/db/schema";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { Music, Palette, Tv, Flame } from "lucide-react";

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
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Creative</p>
        <h1 className="text-xl font-bold mt-0.5">Creative Studio</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Music · Design · YouTube — your art, tracked.
        </p>
      </div>

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
          <div className="bg-white/3 rounded-xl p-3">
            <p className="text-muted-foreground text-xs">Days active</p>
            <p className="font-bold text-lg mt-0.5" style={{ color: "oklch(0.65 0.20 290)" }}>{musicDays}</p>
          </div>
          <div className="bg-white/3 rounded-xl p-3">
            <p className="text-muted-foreground text-xs">Avg per session</p>
            <p className="font-bold text-lg mt-0.5" style={{ color: "oklch(0.65 0.20 290)" }}>
              {musicDays > 0 ? Math.round(totalMusicMins / musicDays) : 0}m
            </p>
          </div>
        </div>

        <ActivityGrid field="music" />

        <div className="pt-3 border-t border-white/6">
          <p className="text-xs text-muted-foreground">
            🎵 <strong className="text-foreground">Aydhiny</strong> — 5M+ streams, 5000+ beats. Keep creating.
          </p>
        </div>
      </div>

      {/* Design section */}
      <div className="rounded-2xl border border-[var(--gold)]/20 bg-card p-6 space-y-4">
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
        <div className="pt-3 border-t border-white/6">
          <p className="text-xs text-muted-foreground">
            📹 Building your channel one video at a time. Consistency is the only strategy.
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
