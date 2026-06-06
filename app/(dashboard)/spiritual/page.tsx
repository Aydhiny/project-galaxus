"use client";

import { useState, useEffect, useTransition } from "react";
import { getRecentCheckins, upsertCheckin } from "@/lib/actions/checkin";
import type { DailyCheckin } from "@/lib/db/schema";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
const PRAYER_LABELS: Record<string, string> = {
  fajr: "الفجر",
  dhuhr: "الظهر",
  asr: "العصر",
  maghrib: "المغرب",
  isha: "العشاء",
};

function getPrayerCount(checkin: DailyCheckin) {
  return PRAYERS.filter((p) => checkin[p]).length;
}

export default function SpiritualPage() {
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const data = await getRecentCheckins(30);
      setCheckins(data);
    });
  }

  useEffect(() => { reload(); }, []);

  const today = format(new Date(), "yyyy-MM-dd");
  const todayCheckin = checkins.find((c) => c.date === today);

  const last30Days = eachDayOfInterval({
    start: subDays(new Date(), 29),
    end: new Date(),
  });

  const checkinMap = new Map(checkins.map((c) => [c.date, c]));

  let prayerStreak = 0;
  for (let i = 0; i < last30Days.length; i++) {
    const d = format(last30Days[last30Days.length - 1 - i], "yyyy-MM-dd");
    const c = checkinMap.get(d);
    if (c && getPrayerCount(c) === 5) prayerStreak++;
    else break;
  }

  const totalPrayers = checkins.reduce((sum, c) => sum + getPrayerCount(c), 0);
  const totalPossible = checkins.length * 5;
  const prayerRate = totalPossible > 0 ? Math.round((totalPrayers / totalPossible) * 100) : 0;

  const totalQuranPages = checkins.reduce((sum, c) => sum + (c.quranPages ?? 0), 0);

  function togglePrayer(prayer: typeof PRAYERS[number]) {
    startTransition(async () => {
      const current = todayCheckin?.[prayer] ?? false;
      await upsertCheckin(today, { [prayer]: !current });
      toast.success(!current ? `${PRAYER_LABELS[prayer]} logged ✓` : `${PRAYER_LABELS[prayer]} unmarked`);
      reload();
    });
  }

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Spiritual</p>
        <h1 className="text-xl font-bold mt-0.5">
          بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          In the name of Allah, the Most Gracious, the Most Merciful
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[var(--emerald)]/20 bg-card p-4 text-center">
          <p className="text-3xl font-bold text-[var(--emerald)]">{prayerStreak}</p>
          <p className="text-xs text-muted-foreground mt-1">Full-prayer streak (days)</p>
        </div>
        <div className="rounded-2xl border border-white/6 bg-card p-4 text-center">
          <p className="text-3xl font-bold text-[var(--gold)]">{prayerRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">Prayer consistency</p>
        </div>
        <div className="rounded-2xl border border-white/6 bg-card p-4 text-center">
          <p className="text-3xl font-bold">{totalQuranPages}</p>
          <p className="text-xs text-muted-foreground mt-1">Quran pages read</p>
        </div>
      </div>

      {/* Today's prayers */}
      <div className="rounded-2xl border border-[var(--emerald)]/20 bg-card p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold flex items-center gap-2">
            <span className="text-lg">🕌</span> Today&apos;s Prayers
          </h2>
          {pending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="grid grid-cols-5 gap-3">
          {PRAYERS.map((prayer) => {
            const done = todayCheckin?.[prayer] ?? false;
            return (
              <button
                key={prayer}
                onClick={() => togglePrayer(prayer)}
                disabled={pending}
                className={`flex flex-col items-center gap-2 py-5 px-2 rounded-xl border transition-all ${
                  done
                    ? "prayer-done"
                    : "prayer-undone hover:border-[var(--emerald)]/30"
                }`}
              >
                <span className="text-2xl">
                  {prayer === "fajr" ? "🌙" : prayer === "dhuhr" ? "☀️" : prayer === "asr" ? "🌤️" : prayer === "maghrib" ? "🌅" : "🌃"}
                </span>
                <div className="text-center">
                  <p className="text-xs font-medium capitalize">{prayer}</p>
                  <p className="text-[10px] text-muted-foreground font-arabic">
                    {PRAYER_LABELS[prayer]}
                  </p>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    done ? "border-[var(--emerald)] bg-[var(--emerald)]" : "border-white/20"
                  }`}
                >
                  {done && <span className="text-[8px] text-white font-bold">✓</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 30-day prayer grid */}
      <div className="rounded-2xl border border-white/6 bg-card p-6">
        <h2 className="font-semibold mb-4">30-Day Prayer History</h2>
        <div className="grid grid-cols-10 gap-1.5">
          {last30Days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const c = checkinMap.get(dateStr);
            const count = c ? getPrayerCount(c) : 0;
            const isToday = dateStr === today;

            const opacity =
              count === 0 ? 0.08 : count === 1 ? 0.2 : count === 2 ? 0.35 : count === 3 ? 0.55 : count === 4 ? 0.75 : 1;

            return (
              <div
                key={dateStr}
                title={`${format(day, "MMM d")}: ${count}/5 prayers`}
                className={`aspect-square rounded-md transition-all ${
                  isToday ? "ring-1 ring-[var(--gold)] ring-offset-1 ring-offset-background" : ""
                }`}
                style={{
                  background: `oklch(0.70 0.17 162 / ${opacity})`,
                }}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
          <span>Less</span>
          {[0.08, 0.35, 0.75, 1].map((o, i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-sm"
              style={{ background: `oklch(0.70 0.17 162 / ${o})` }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Quran tracker */}
      <div className="rounded-2xl border border-white/6 bg-card p-6">
        <h2 className="font-semibold mb-4">📖 Quran Reading</h2>
        <div className="space-y-2">
          {last30Days.slice(-14).map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const c = checkinMap.get(dateStr);
            const pages = c?.quranPages ?? 0;
            const maxPages = 20;
            return (
              <div key={dateStr} className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground w-10 shrink-0">
                  {format(day, "d MMM")}
                </span>
                <div className="flex-1 h-2 rounded-full bg-white/6 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min((pages / maxPages) * 100, 100)}%`,
                      background: "oklch(0.70 0.17 162)",
                    }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground w-10 text-right shrink-0">
                  {pages > 0 ? `${pages}p` : "—"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Total: <span className="text-foreground font-medium">{totalQuranPages} pages</span> in the last 30 days
        </p>
      </div>

      {/* Dua */}
      <div className="rounded-2xl border border-[var(--gold)]/15 bg-[var(--gold-muted)] p-5 text-center space-y-2">
        <p className="text-[var(--gold)] font-arabic text-lg">
          رَبِّ زِدۡنِي عِلۡمٗا
        </p>
        <p className="text-sm text-muted-foreground">
          &quot;My Lord, increase me in knowledge.&quot; — Quran 20:114
        </p>
      </div>
    </div>
  );
}
