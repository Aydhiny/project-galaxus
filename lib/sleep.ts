// Sleep Guardian timing — pure, tested in sleep.test.ts.

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Is `now` inside bedtime → wake time? Handles windows that cross midnight (23:00 → 07:00). */
export function inSleepWindow(now: Date, bedTime: string, wakeTime: string): boolean {
  const n = now.getHours() * 60 + now.getMinutes();
  const b = toMin(bedTime);
  const w = toMin(wakeTime);
  return b < w ? n >= b && n < w : n >= b || n < w;
}

/** The 15 minutes before bedtime — time to wind down. */
export function inWindDown(now: Date, bedTime: string, minutes = 15): boolean {
  const n = now.getHours() * 60 + now.getMinutes();
  const b = toMin(bedTime);
  const start = (b - minutes + 1440) % 1440;
  return start < b ? n >= start && n < b : n >= start || n < b;
}

/** "Night key" so a once-per-night thing (snooze, chime) resets each evening, not at midnight. */
export function nightKey(now: Date, wakeTime: string): string {
  const d = new Date(now);
  if (now.getHours() * 60 + now.getMinutes() < toMin(wakeTime)) d.setDate(d.getDate() - 1);
  // Local calendar date (toISOString would shift it by the time zone).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── From your check-ins ──────────────────────────────────────────────────────

/** Bedtimes after midnight count as "late", not "early": 00:40 → 24:40 for averaging. */
const bedMinutes = (hhmm: string) => { const m = toMin(hhmm); return m < 12 * 60 ? m + 1440 : m; };
const fmt = (m: number) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };

export type CheckinSleep = { date: string; bedTime: string | null; wakeTime: string | null; sleepHours: number | null };

/** Your real average bedtime / wake time over recent check-ins (null if too few). */
export function averageSleep(rows: CheckinSleep[]): { bedTime: string; wakeTime: string; nights: number } | null {
  const beds = rows.map((r) => r.bedTime).filter((t): t is string => !!t && /^\d{2}:\d{2}$/.test(t));
  const wakes = rows.map((r) => r.wakeTime).filter((t): t is string => !!t && /^\d{2}:\d{2}$/.test(t));
  if (beds.length < 3 || wakes.length < 3) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { bedTime: fmt(avg(beds.map(bedMinutes))), wakeTime: fmt(avg(wakes.map(toMin))), nights: Math.min(beds.length, wakes.length) };
}

/**
 * A "good night": 7+ hours, or in bed within 15 minutes of your Sleep Guardian
 * bedtime. Counted per check-in — you can't lose more than one night at a time.
 */
export function isGoodNight(r: CheckinSleep, targetBed: string | null): boolean {
  if ((r.sleepHours ?? 0) >= 7) return true;
  if (targetBed && r.bedTime && /^\d{2}:\d{2}$/.test(r.bedTime)) return bedMinutes(r.bedTime) <= bedMinutes(targetBed) + 15;
  return false;
}
