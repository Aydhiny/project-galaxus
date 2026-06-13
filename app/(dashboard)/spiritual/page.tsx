"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { getRecentCheckins, upsertCheckin } from "@/lib/actions/checkin";
import type { DailyCheckin } from "@/lib/db/schema";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { toast } from "sonner";
import { Loader2, RotateCcw, Star } from "lucide-react";
import { toHijri, HIJRI_MONTHS } from "@/lib/hijri";
import { fetchPrayerTimes, getUserLocation, getNextPrayer, formatCountdown, type PrayerTimes } from "@/lib/prayer-times";

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

// ── Quran Surah Progress ───────────────────────────────────────────────────
const SURAHS = [
  "Al-Fatiha","Al-Baqarah","Al-Imran","An-Nisa","Al-Maidah","Al-Anam","Al-Araf","Al-Anfal","At-Tawbah","Yunus",
  "Hud","Yusuf","Ar-Rad","Ibrahim","Al-Hijr","An-Nahl","Al-Isra","Al-Kahf","Maryam","Ta-Ha",
  "Al-Anbiya","Al-Hajj","Al-Muminun","An-Nur","Al-Furqan","Ash-Shuara","An-Naml","Al-Qasas","Al-Ankabut","Ar-Rum",
  "Luqman","As-Sajdah","Al-Ahzab","Saba","Fatir","Ya-Sin","As-Saffat","Sad","Az-Zumar","Ghafir",
  "Fussilat","Ash-Shura","Az-Zukhruf","Ad-Dukhan","Al-Jathiyah","Al-Ahqaf","Muhammad","Al-Fath","Al-Hujurat","Qaf",
  "Adh-Dhariyat","At-Tur","An-Najm","Al-Qamar","Ar-Rahman","Al-Waqiah","Al-Hadid","Al-Mujadila","Al-Hashr","Al-Mumtahina",
  "As-Saf","Al-Jumuah","Al-Munafiqun","At-Taghabun","At-Talaq","At-Tahrim","Al-Mulk","Al-Qalam","Al-Haqqah","Al-Maarij",
  "Nuh","Al-Jinn","Al-Muzzammil","Al-Muddaththir","Al-Qiyamah","Al-Insan","Al-Mursalat","An-Naba","An-Naziat","Abasa",
  "At-Takwir","Al-Infitar","Al-Mutaffifin","Al-Inshiqaq","Al-Buruj","At-Tariq","Al-Ala","Al-Ghashiyah","Al-Fajr","Al-Balad",
  "Ash-Shams","Al-Layl","Ad-Duha","Al-Inshirah","At-Tin","Al-Alaq","Al-Qadr","Al-Bayyinah","Az-Zalzalah","Al-Adiyat",
  "Al-Qariah","At-Takathur","Al-Asr","Al-Humazah","Al-Fil","Quraysh","Al-Maun","Al-Kawthar","Al-Kafirun","An-Nasr",
  "Al-Masad","Al-Ikhlas","Al-Falaq","An-Nas",
];
const JUZ_SIZE = Math.ceil(114 / 30);
type SurahStatus = "none" | "reading" | "memorized" | "reviewed";
const STATUS_COLORS: Record<SurahStatus, string> = {
  none: "oklch(1 0 0 / 8%)",
  reading: "oklch(0.65 0.15 55 / 70%)",
  memorized: "var(--emerald)",
  reviewed: "oklch(0.65 0.20 290)",
};
function loadQuranProgress(): Record<number, SurahStatus> {
  try { return JSON.parse(localStorage.getItem("galaxus-quran-progress") ?? "{}"); } catch { return {}; }
}
function saveQuranProgress(p: Record<number, SurahStatus>) {
  try { localStorage.setItem("galaxus-quran-progress", JSON.stringify(p)); } catch { /* ignore */ }
}

// ── Tasbih ─────────────────────────────────────────────────────────────────
const DHIKR = [
  { key: "subhanallah",  arabic: "سُبْحَانَ اللَّهِ",  latin: "SubhanAllah",   meaning: "Glory be to Allah",       target: 33 },
  { key: "alhamdulillah",arabic: "الْحَمْدُ لِلَّهِ", latin: "Alhamdulillah",  meaning: "All praise to Allah",     target: 33 },
  { key: "allahuakbar",  arabic: "اللَّهُ أَكْبَرُ",  latin: "Allahu Akbar",   meaning: "Allah is the Greatest",   target: 34 },
] as const;
type DhikrKey = typeof DHIKR[number]["key"];
type TasbihState = Record<DhikrKey, number>;

function loadTasbih(date: string): TasbihState {
  try {
    return JSON.parse(localStorage.getItem(`galaxus-tasbih-${date}`) ?? "{}");
  } catch { return {} as TasbihState; }
}
function saveTasbih(date: string, state: TasbihState) {
  try { localStorage.setItem(`galaxus-tasbih-${date}`, JSON.stringify(state)); } catch { /* ignore */ }
}

// ── Ramadan fasting grid ───────────────────────────────────────────────────
const QADR_NIGHTS = new Set([21, 23, 25, 27, 29]);
function loadRamadanFasts(year: number): boolean[] {
  try {
    return JSON.parse(localStorage.getItem(`galaxus-ramadan-${year}`) ?? "[]");
  } catch { return []; }
}
function saveRamadanFasts(year: number, fasts: boolean[]) {
  try { localStorage.setItem(`galaxus-ramadan-${year}`, JSON.stringify(fasts)); } catch { /* ignore */ }
}

export default function SpiritualPage() {
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [pending, startTransition] = useTransition();

  // Quran progress
  const [quranProgress, setQuranProgress] = useState<Record<number, SurahStatus>>({});
  useEffect(() => { setQuranProgress(loadQuranProgress()); }, []);

  function cycleSurahStatus(idx: number) {
    const cycle: SurahStatus[] = ["none", "reading", "reviewed", "memorized"];
    const current = quranProgress[idx] ?? "none";
    const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
    const updated = { ...quranProgress, [idx]: next };
    setQuranProgress(updated);
    saveQuranProgress(updated);
  }

  const memorizedCount = Object.values(quranProgress).filter(s => s === "memorized").length;
  const reviewedCount = Object.values(quranProgress).filter(s => s === "reviewed").length;

  // Tasbih state
  const today = format(new Date(), "yyyy-MM-dd");
  const [tasbih, setTasbih] = useState<TasbihState>({} as TasbihState);
  useEffect(() => { setTasbih(loadTasbih(today)); }, [today]);

  function incrementDhikr(key: DhikrKey) {
    const dhikr = DHIKR.find(d => d.key === key)!;
    const current = tasbih[key] ?? 0;
    if (current >= dhikr.target) return;
    const next = { ...tasbih, [key]: current + 1 };
    setTasbih(next);
    saveTasbih(today, next);
    if (current + 1 === dhikr.target) {
      toast.success(`${dhikr.latin} complete — ${dhikr.target}/${dhikr.target} ✓`, { duration: 2000 });
    }
  }

  function resetTasbih() {
    const empty = {} as TasbihState;
    setTasbih(empty);
    saveTasbih(today, empty);
  }

  const tasbihComplete = DHIKR.every(d => (tasbih[d.key] ?? 0) >= d.target);

  // Ramadan state
  const hijri = toHijri(new Date());
  const isRamadan = hijri.isRamadan;
  const [ramadanFasts, setRamadanFasts] = useState<boolean[]>([]);
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [countdown, setCountdown] = useState<string>("");
  const [countdownLabel, setCountdownLabel] = useState<string>("");
  const [nextPrayerName, setNextPrayerName] = useState<string>("");
  const [qiblaAngle, setQiblaAngle] = useState<number | null>(null);
  const [compassHeading, setCompassHeading] = useState<number>(0);
  const [qiblaError, setQiblaError] = useState<string>("");

  useEffect(() => {
    if (isRamadan) setRamadanFasts(loadRamadanFasts(new Date().getFullYear()));
    // Always load prayer times
    getUserLocation().then(async coords => {
      if (!coords) return;
      try {
        const t = await fetchPrayerTimes(coords.latitude, coords.longitude);
        setPrayerTimes(t);
        // Qibla bearing: great-circle bearing from user to Kaaba (21.3891°N, 39.8579°E)
        const lat1 = coords.latitude * Math.PI / 180;
        const lon1 = coords.longitude * Math.PI / 180;
        const lat2 = 21.3891 * Math.PI / 180;
        const lon2 = 39.8579 * Math.PI / 180;
        const dLon = lon2 - lon1;
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        setQiblaAngle(bearing);
      } catch { /* ignore */ }
    }).catch(() => setQiblaError("Location unavailable"));

    // Compass via DeviceOrientationEvent
    function handleOrientation(e: DeviceOrientationEvent) {
      const heading = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
        ?? (e.alpha != null ? (360 - e.alpha) : 0);
      setCompassHeading(heading);
    }
    window.addEventListener("deviceorientationabsolute" as "deviceorientation", handleOrientation, true);
    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute" as "deviceorientation", handleOrientation, true);
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, [isRamadan]);

  useEffect(() => {
    if (!prayerTimes) return;
    const tick = () => {
      const next = getNextPrayer(prayerTimes);
      if (!next) return;
      setNextPrayerName(next.name);
      if (isRamadan) {
        if (next.name === "Maghrib") {
          setCountdownLabel("Iftar in");
          setCountdown(formatCountdown(next.msLeft));
        } else if (next.name === "Fajr") {
          setCountdownLabel("Suhoor ends in");
          setCountdown(formatCountdown(next.msLeft));
        } else {
          const [h, m] = prayerTimes.Maghrib.split(":").map(Number);
          const maghribDate = new Date(); maghribDate.setHours(h, m, 0, 0);
          const msLeft = maghribDate.getTime() - Date.now();
          if (msLeft > 0) { setCountdownLabel("Iftar in"); setCountdown(formatCountdown(msLeft)); }
        }
      } else {
        setCountdownLabel(`${next.name} in`);
        setCountdown(formatCountdown(next.msLeft));
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [prayerTimes, isRamadan]);

  function toggleRamadanFast(day: number) {
    const fasts = [...ramadanFasts];
    fasts[day] = !fasts[day];
    setRamadanFasts(fasts);
    saveRamadanFasts(new Date().getFullYear(), fasts);
  }

  function reload() {
    startTransition(async () => {
      const data = await getRecentCheckins(30);
      setCheckins(data);
    });
  }

  useEffect(() => { reload(); }, []);

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
    <div className="page max-w-4xl">
      {/* Header */}
      <div>
        <p className="section-label mb-1">Spiritual</p>
        <h1 className="text-2xl font-bold heading-gradient" style={{ fontFamily: "var(--font-heading)" }}>
          بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          In the name of Allah, the Most Gracious, the Most Merciful
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass p-4 text-center">
          <p className="text-3xl font-bold text-[var(--emerald)]">{prayerStreak}</p>
          <p className="text-xs text-muted-foreground mt-1">Full-prayer streak (days)</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-3xl font-bold text-[var(--gold)]">{prayerRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">Prayer consistency</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-3xl font-bold">{totalQuranPages}</p>
          <p className="text-xs text-muted-foreground mt-1">Quran pages read</p>
        </div>
      </div>

      {/* ── Prayer Countdown + Qibla ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Prayer Countdown */}
        <div className="glass p-5 flex flex-col items-center justify-center text-center gap-2">
          <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/60">
            {countdown ? countdownLabel : "Next prayer"}
          </p>
          {countdown ? (
            <>
              <p className="text-4xl font-bold tabular-nums text-[var(--emerald)]">{countdown}</p>
              <p className="text-xs text-muted-foreground">{nextPrayerName} {prayerTimes?.[nextPrayerName as keyof typeof prayerTimes] ?? ""}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Allow location to see prayer times</p>
          )}
        </div>

        {/* Qibla Compass */}
        <div className="glass p-5 flex flex-col items-center justify-center gap-3">
          <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/60">Qibla Direction</p>
          {qiblaAngle != null ? (
            <>
              <div className="relative w-24 h-24">
                {/* Compass ring */}
                <div className="absolute inset-0 rounded-full border-2 border-border" />
                <div className="absolute inset-2 rounded-full border border-border/40" />
                {/* N marker */}
                <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-muted-foreground">N</span>
                {/* Qibla needle */}
                <div className="absolute inset-0 flex items-center justify-center"
                  style={{ transform: `rotate(${qiblaAngle - compassHeading}deg)` }}>
                  <div className="w-0.5 h-10 rounded-full relative -mt-4"
                    style={{ background: "linear-gradient(to top, transparent 0%, var(--emerald) 100%)" }}>
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[var(--emerald)]">
                      <span style={{ fontSize: 8 }}>🕋</span>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{Math.round(qiblaAngle)}° from North</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{qiblaError || "Allow location access for Qibla"}</p>
          )}
        </div>
      </div>

      {/* Today's prayers */}
      <div className="glass p-6">
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
                    done ? "border-[var(--emerald)] bg-[var(--emerald)]" : "border-muted-foreground/30"
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
      <div className="glass p-6">
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
      <div className="glass p-6">
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
                <div className="flex-1 h-2 rounded-full bg-foreground/[0.06] overflow-hidden">
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

      {/* ── Quran Surah Progress ─────────────────────────────────────── */}
      <div className="glass p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <span className="text-lg">📖</span> Quran Progress
          </h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: "var(--emerald)" }} /> {memorizedCount} memorized</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: "oklch(0.65 0.20 290)" }} /> {reviewedCount} reviewed</span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">Tap a surah to cycle: unread → reading → reviewed → memorized</p>

        {/* 30-Juz progress bars */}
        <div className="space-y-1.5">
          {Array.from({ length: 30 }, (_, juz) => {
            const start = juz * 4;
            const end = Math.min(start + 4, 114);
            const juzSurahs = SURAHS.slice(start, end);
            const memorizedInJuz = juzSurahs.filter((_, i) => (quranProgress[start + i] ?? "none") === "memorized").length;
            const reviewedInJuz = juzSurahs.filter((_, i) => ["reviewed", "memorized"].includes(quranProgress[start + i] ?? "none")).length;
            return (
              <div key={juz} className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground w-7 shrink-0 text-right">J{juz + 1}</span>
                <div className="flex-1 flex gap-0.5">
                  {juzSurahs.map((name, i) => {
                    const status = quranProgress[start + i] ?? "none";
                    return (
                      <button key={i} onClick={() => cycleSurahStatus(start + i)}
                        title={`${name} — ${status}`}
                        className="flex-1 h-4 rounded-sm transition-all hover:scale-110"
                        style={{ background: STATUS_COLORS[status] }} />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
          {(["none", "reading", "reviewed", "memorized"] as SurahStatus[]).map(s => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: STATUS_COLORS[s] }} />
              {s === "none" ? "Unread" : s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
          ))}
        </div>
      </div>

      {/* ── Tasbih counter ─────────────────────────────────────────────── */}
      <div className="glass p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <span className="text-lg">📿</span> Tasbih
          </h2>
          <div className="flex items-center gap-2">
            {tasbihComplete && (
              <span className="text-xs text-[var(--emerald)] font-semibold animate-pulse">MashaAllah! ✓</span>
            )}
            <button onClick={resetTasbih} title="Reset"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DHIKR.map((d) => {
            const count = tasbih[d.key] ?? 0;
            const done = count >= d.target;
            const pct = Math.min(count / d.target, 1);
            return (
              <button key={d.key} onClick={() => incrementDhikr(d.key)}
                disabled={done}
                className="flex flex-col items-center gap-2 p-5 rounded-2xl border transition-all active:scale-95"
                style={done
                  ? { borderColor: "var(--emerald)", background: "oklch(0.70 0.17 162 / 12%)" }
                  : { borderColor: "oklch(1 0 0 / 8%)", background: "oklch(1 0 0 / 3%)" }}>
                <p className="font-arabic text-xl leading-relaxed" style={{ color: done ? "var(--emerald)" : "var(--gold)" }}>
                  {d.arabic}
                </p>
                <p className="text-xs text-muted-foreground">{d.latin}</p>
                <div className="w-full h-1.5 rounded-full bg-foreground/[0.08] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${pct * 100}%`, background: done ? "var(--emerald)" : "var(--gold)" }} />
                </div>
                <p className="text-sm font-bold tabular-nums" style={{ color: done ? "var(--emerald)" : "inherit" }}>
                  {count}/{d.target}
                </p>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground text-center">Tap to count · resets at midnight</p>
      </div>

      {/* ── Ramadan mode (auto-shows when Hijri month = Ramadan) ─────────── */}
      {isRamadan && (
        <div className="glass p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold flex items-center gap-2 text-[var(--emerald)]">
              <span className="text-lg">🌙</span> Ramadan {hijri.year}
            </h2>
            {countdown && (
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{countdownLabel}</p>
                <p className="text-xl font-bold text-[var(--emerald)] tabular-nums">{countdown}</p>
              </div>
            )}
          </div>

          {/* 30-day fasting grid */}
          <div>
            <p className="text-xs text-muted-foreground mb-3">Fasting tracker — tap a day to mark it</p>
            <div className="grid grid-cols-10 gap-1.5">
              {Array.from({ length: 30 }, (_, i) => {
                const day = i + 1;
                const fasted = ramadanFasts[i] ?? false;
                const isQadr = QADR_NIGHTS.has(day);
                const isCurrent = day === hijri.day;
                return (
                  <button key={day} onClick={() => toggleRamadanFast(i)}
                    title={`Day ${day}${isQadr ? " — Laylat al-Qadr candidate" : ""}`}
                    className="relative aspect-square rounded-lg border flex items-center justify-center text-[10px] font-semibold transition-all hover:scale-110"
                    style={{
                      borderColor: isCurrent ? "var(--gold)" : isQadr ? "oklch(0.70 0.17 162 / 50%)" : "oklch(1 0 0 / 10%)",
                      background: fasted
                        ? "oklch(0.70 0.17 162 / 30%)"
                        : isQadr ? "oklch(0.70 0.17 162 / 8%)" : "transparent",
                      color: fasted ? "var(--emerald)" : "oklch(1 0 0 / 40%)",
                    }}>
                    {day}
                    {isQadr && (
                      <Star className="absolute -top-1 -right-1 w-2.5 h-2.5 text-[var(--gold)]" fill="currentColor" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
              <span>⭐ = Odd nights (Laylat al-Qadr candidates)</span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "oklch(0.70 0.17 162 / 30%)" }} />
                Fasted
              </span>
              <span className="ml-auto text-[var(--emerald)] font-semibold">
                {ramadanFasts.filter(Boolean).length}/30 days
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Dua */}
      <div className="glass p-5 text-center space-y-2">
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
