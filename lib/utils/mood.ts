/**
 * Shared mood utilities — used by Dashboard, Metrics, Overview, Journal.
 * Scale: 1 (awful) → 10 (perfect). No emojis — icon-based system.
 */

export const MOOD_LABELS: Record<number, string> = {
  1: "Awful", 2: "Very Bad", 3: "Bad", 4: "Meh", 5: "Okay",
  6: "Alright", 7: "Good", 8: "Great", 9: "Amazing", 10: "Perfect",
};

/**
 * Returns an oklch colour string that grades from deep red (1) → amber (5) → gold (10).
 * Uses oklch for perceptually uniform lightness across the full hue range.
 */
export function moodColor(n: number): string {
  // Hue: 7 (red) at n=1 → 50 (gold) at n=10, lightness stays around 0.66
  const hue = Math.round(7 + (n - 1) * 4.8);
  return `oklch(0.66 0.22 ${hue})`;
}

/** The 5-point journal mood icon map — maps 1-5 to Lucide icon names */
export const JOURNAL_MOOD_COLORS = ["", "#e34040", "#e07a30", "#c9a84c", "#5dbd8c", "#4a9edd"] as const;

export const MOOD_STORAGE_KEY = "galaxus-moods";

export interface MoodEntry {
  date: string; // yyyy-MM-dd
  mood: number; // 1-10
}

export function loadMoods(): MoodEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(MOOD_STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}

export function saveMood(date: string, mood: number): void {
  try {
    const arr = loadMoods();
    const idx = arr.findIndex(e => e.date === date);
    if (idx >= 0) arr[idx].mood = mood;
    else arr.push({ date, mood });
    localStorage.setItem(MOOD_STORAGE_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

export function todaysMood(): number {
  const today = new Date().toISOString().slice(0, 10);
  return loadMoods().find(e => e.date === today)?.mood ?? 0;
}
