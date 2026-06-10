/**
 * Prayer times via the free Aladhan API — no key required.
 * https://aladhan.com/prayer-times-api
 */

export const PRAYER_NAMES = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] as const;
export type PrayerName = typeof PRAYER_NAMES[number];

export interface PrayerTimes {
  Fajr: string;    // "05:23"
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Sunset: string;
  Maghrib: string;
  Isha: string;
  Midnight: string;
}

export interface NextPrayer {
  name: PrayerName;
  time: string;         // "HH:MM"
  msLeft: number;       // milliseconds until prayer
  minutesLeft: number;
}

const CACHE_KEY = "galaxus-prayer-times";
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

interface CacheEntry {
  times: PrayerTimes;
  date: string;  // yyyy-MM-dd
  lat: number;
  lon: number;
  ts: number;    // Date.now()
}

function getCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL) return null;
    return entry;
  } catch { return null; }
}

function setCache(entry: CacheEntry) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(entry)); } catch { /* ignore */ }
}

/** Fetch today's prayer times for a lat/lon. Caches for 12 hours. */
export async function fetchPrayerTimes(
  lat: number,
  lon: number,
): Promise<PrayerTimes> {
  const today = new Date().toISOString().slice(0, 10);

  // Check cache
  const cached = getCache();
  if (cached && cached.date === today && Math.abs(cached.lat - lat) < 0.1 && Math.abs(cached.lon - lon) < 0.1) {
    return cached.times;
  }

  const d = new Date();
  const dateStr = `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
  // Method 2 = ISNA (North America), 3 = MWL, 5 = Egyptian — using MWL as default
  const url = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${lat}&longitude=${lon}&method=3`;

  const res = await fetch(url, { next: { revalidate: 43200 } });
  if (!res.ok) throw new Error("Failed to fetch prayer times");

  const json = await res.json();
  const times: PrayerTimes = json.data.timings;

  setCache({ times, date: today, lat, lon, ts: Date.now() });
  return times;
}

/** Get user's geolocation — returns null if denied or unavailable */
export function getUserLocation(): Promise<GeolocationCoordinates | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60 * 60 * 1000 },
    );
  });
}

/** Parse "HH:MM" string into today's Date */
function parseTime(timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/** Calculate the next upcoming prayer from a PrayerTimes object */
export function getNextPrayer(times: PrayerTimes): NextPrayer | null {
  const now = new Date();
  const prayers: { name: PrayerName; time: string }[] = PRAYER_NAMES.map((name) => ({
    name,
    time: times[name],
  }));

  for (const { name, time } of prayers) {
    const prayerDate = parseTime(time);
    const msLeft = prayerDate.getTime() - now.getTime();
    if (msLeft > 0) {
      return { name, time, msLeft, minutesLeft: Math.floor(msLeft / 60000) };
    }
  }

  // All prayers passed — next is tomorrow's Fajr
  const fajr = parseTime(times.Fajr);
  fajr.setDate(fajr.getDate() + 1);
  const msLeft = fajr.getTime() - now.getTime();
  return {
    name: "Fajr",
    time: times.Fajr,
    msLeft,
    minutesLeft: Math.floor(msLeft / 60000),
  };
}

/** Format milliseconds as "Xh Ym" or "Ym Zs" */
export function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
