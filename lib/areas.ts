// Areas of life — a light, secondary way to categorise tasks. The main view
// stays time-based (Today / Next 7 days); areas only add a small tag + filter.

export const AREAS = ["training", "faith", "reading", "youtube", "mind", "sleep", "study"] as const;
export type Area = (typeof AREAS)[number];

export const AREA_META: Record<Area, { label: string; emoji: string }> = {
  training: { label: "Training", emoji: "💪" },
  faith: { label: "Faith", emoji: "🕌" },
  reading: { label: "Reading", emoji: "📚" },
  youtube: { label: "YouTube", emoji: "🎬" },
  mind: { label: "Mind", emoji: "🧠" },
  sleep: { label: "Sleep", emoji: "😴" },
  study: { label: "Study", emoji: "🎓" },
};

export function isArea(v: unknown): v is Area {
  return typeof v === "string" && (AREAS as readonly string[]).includes(v);
}

/** Quick-add aliases: "#gym" → training, "#islam" → faith, … */
const ALIASES: Record<string, Area> = {
  training: "training", gym: "training", workout: "training", fit: "training",
  faith: "faith", deen: "faith", islam: "faith", religion: "faith", prayer: "faith",
  reading: "reading", read: "reading", books: "reading", book: "reading",
  youtube: "youtube", yt: "youtube", devlog: "youtube", content: "youtube",
  mind: "mind", mental: "mind", meditation: "mind", meditate: "mind",
  sleep: "sleep",
  study: "study", exam: "study", school: "study", uni: "study", faculty: "study",
};

/** "#gym" → "training" (or null if the tag isn't an area). */
export function areaFromTag(tag: string): Area | null {
  return ALIASES[tag.replace(/^#/, "").toLowerCase()] ?? null;
}
