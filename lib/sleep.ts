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
