// Automatic activity — pure rules (no DB): what an app counts as, when a
// scroll session is too long, and when you went to bed / woke up.

export const DEEP_CATEGORIES = ["code", "gamedev", "music", "editing", "design"] as const;
export type DeepCategory = (typeof DEEP_CATEGORIES)[number];
export type Category = DeepCategory | "scroll" | "presence";

const RULES: [RegExp, DeepCategory][] = [
  [/unity|godot|unreal|blender/i, "gamedev"],
  [/\bcode\b|visual studio|cursor|windsurf|rider|webstorm|intellij|pycharm|zed|android studio|xcode|sublime|neovim|vim/i, "code"],
  [/fl studio|fl64|ableton|logic pro|reaper|bitwig|studio one|pro tools|cubase|reason/i, "music"],
  [/premiere|after effects|davinci|resolve|capcut|final cut|vegas/i, "editing"],
  [/photoshop|illustrator|figma|affinity|krita|aseprite/i, "design"],
];

/** A desktop sample → category, or null (browsers, chat, everything else isn't counted). */
export function classify(app: string, site: string | null | undefined): Category | null {
  if (site && ["youtube", "instagram", "tiktok", "facebook", "x", "netflix", "twitch"].includes(site)) return "scroll";
  for (const [re, cat] of RULES) if (re.test(app)) return cat;
  return null;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  code: "Coding", gamedev: "Game dev", music: "Music", editing: "Editing", design: "Design", scroll: "Scrolling", presence: "Online",
};

/** Doomscroll guard: 20+ scroll minutes in the last 30. */
export const SCROLL_LIMIT_MIN = 20;
export const isDoomscrolling = (scrollMinutesLast30: number) => scrollMinutesLast30 >= SCROLL_LIMIT_MIN;

/**
 * Last night's sleep from activity minutes (local times, minutes since the
 * local midnight of the *wake* day; evening minutes are negative). The longest
 * quiet gap of 3h+ that starts between 19:00 and 05:00 is the night.
 */
export function detectNight(activeLocalMinutes: number[]): { bed: number; wake: number } | null {
  const xs = [...new Set(activeLocalMinutes)].sort((a, b) => a - b);
  let best: { bed: number; wake: number } | null = null;
  for (let i = 0; i < xs.length - 1; i++) {
    const gap = xs[i + 1] - xs[i];
    if (gap < 180) continue;
    const bed = xs[i];
    if (bed < -5 * 60 || bed > 5 * 60) continue; // must start between 19:00 and 05:00
    if (!best || gap > best.wake - best.bed) best = { bed, wake: xs[i + 1] };
  }
  return best;
}

/** −45 → "23:15", 30 → "00:30". */
export function hhmm(localMinutes: number) {
  const m = ((localMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
