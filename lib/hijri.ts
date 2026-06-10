/**
 * Hijri (Islamic) calendar conversion — pure math, no API needed.
 * Algorithm: Fliegel-Van Flandern via Calendrical Calculations.
 */

export const HIJRI_MONTHS = [
  "Muharram", "Safar", "Rabi' al-Awwal", "Rabi' al-Thani",
  "Jumada al-Ula", "Jumada al-Akhirah", "Rajab", "Sha'ban",
  "Ramadan", "Shawwal", "Dhu al-Qi'dah", "Dhu al-Hijjah",
] as const;

export interface HijriDate {
  day: number;
  month: number;
  year: number;
  monthName: string;
  formatted: string;     // "15 Ramadan 1446"
  short: string;         // "15 Ram 1446"
  isRamadan: boolean;
  isFriday: boolean;
}

/** Convert a Gregorian Date to Hijri date */
export function toHijri(date: Date = new Date()): HijriDate {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();

  // Gregorian → Julian Day Number
  const jdn =
    Math.floor((1461 * (y + 4800 + Math.floor((m - 14) / 12))) / 4) +
    Math.floor((367 * (m - 2 - 12 * Math.floor((m - 14) / 12))) / 12) -
    Math.floor((3 * Math.floor((y + 4900 + Math.floor((m - 14) / 12)) / 100)) / 4) +
    d - 32075;

  // Julian Day Number → Hijri
  const l = jdn - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) +
    Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  const l3 =
    l2 -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;

  const hMonth = Math.floor((24 * l3) / 709);
  const hDay   = l3 - Math.floor((709 * hMonth) / 24);
  const hYear  = 30 * n + j - 30;

  const monthName = HIJRI_MONTHS[hMonth - 1] ?? "Unknown";
  const SHORT_MONTHS = ["Muh","Saf","Rab I","Rab II","Jum I","Jum II","Raj","Sha","Ram","Shaw","Qi'","Hij"];

  return {
    day:      hDay,
    month:    hMonth,
    year:     hYear,
    monthName,
    formatted: `${hDay} ${monthName} ${hYear}`,
    short:     `${hDay} ${SHORT_MONTHS[hMonth - 1]} ${hYear}`,
    isRamadan: hMonth === 9,
    isFriday:  date.getDay() === 5,
  };
}
