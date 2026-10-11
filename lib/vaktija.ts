// Prayer times for Bosnia from vaktija.ba (free, no key) — pure helpers,
// tested in vaktija.test.ts. vakat = [zora, izlazak sunca, podne, ikindija, akšam, jacija].

export const VAKAT = [
  { key: "fajr", bs: "Zora", azan: true },
  { key: "sunrise", bs: "Izlazak sunca", azan: false },
  { key: "dhuhr", bs: "Podne", azan: true },
  { key: "asr", bs: "Ikindija", azan: true },
  { key: "maghrib", bs: "Akšam", azan: true },
  { key: "isha", bs: "Jacija", azan: true },
] as const;
export type VakatKey = (typeof VAKAT)[number]["key"];
export type Vaktija = { location: string; times: string[] }; // "HH:MM" × 6

const pad = (t: string) => t.split(":").map((x) => x.padStart(2, "0")).join(":");

export function parseVaktija(json: unknown): Vaktija | null {
  const j = json as { lokacija?: string; vakat?: string[] } | null;
  if (!j?.vakat || j.vakat.length !== 6 || !j.vakat.every((t) => /^\d{1,2}:\d{2}$/.test(t))) return null;
  return { location: j.lokacija ?? "", times: j.vakat.map(pad) };
}

const minutesOf = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** The next prayer (skips sunrise), with minutes left; after jacija it's tomorrow's zora. */
export function nextVakat(v: Vaktija, now = new Date()): { key: VakatKey; bs: string; time: string; minutesLeft: number } {
  const n = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < 6; i++) {
    const meta = VAKAT[i];
    if (!meta.azan) continue;
    const m = minutesOf(v.times[i]);
    if (m > n) return { key: meta.key, bs: meta.bs, time: v.times[i], minutesLeft: m - n };
  }
  return { key: "fajr", bs: "Zora", time: v.times[0], minutesLeft: minutesOf(v.times[0]) + 1440 - n };
}

/** A prayer whose time started within the last `windowMin` minutes (for the azan / mosque glow). */
export function currentVakat(v: Vaktija, now = new Date(), windowMin = 15): { key: VakatKey; bs: string; time: string } | null {
  const n = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < 6; i++) {
    const meta = VAKAT[i];
    if (!meta.azan) continue;
    const m = minutesOf(v.times[i]);
    if (n >= m && n < m + windowMin) return { key: meta.key, bs: meta.bs, time: v.times[i] };
  }
  return null;
}
