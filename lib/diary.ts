// Diary — pure helpers (tested in diary.test.ts): moods, the import file
// format, and "on this day".

/** Moods as MyDiary stores them (mood_basic_001…010), mapped to something readable. */
export const MOODS = [
  { key: "mood_basic_003", emoji: "😄", label: "Happy" },
  { key: "mood_basic_005", emoji: "🤩", label: "Excited" },
  { key: "mood_basic_002", emoji: "🙂", label: "Okay" },
  { key: "mood_basic_006", emoji: "🤔", label: "Thoughtful" },
  { key: "mood_basic_001", emoji: "😔", label: "Low" },
  { key: "mood_basic_009", emoji: "😣", label: "Stressed" },
  { key: "mood_basic_007", emoji: "😠", label: "Angry" },
  { key: "mood_basic_008", emoji: "😞", label: "Heavy" },
  { key: "mood_basic_010", emoji: "💔", label: "Heartbroken" },
  { key: "mood_basic_004", emoji: "😴", label: "Tired" },
] as const;
export const moodOf = (key: string | null | undefined) => MOODS.find((m) => m.key === key) ?? null;

export type ImportEntry = { externalId: string; date: string; title: string; content: string; mood: string | null; tags: string[] };

/**
 * Accepts the Galaxus master file ({format:"galaxus-diary-v1", entries:[…]}),
 * a plain array of entries, or a single raw MyDiary entry. Bad rows are skipped.
 */
export function parseImport(json: unknown): ImportEntry[] {
  const j = json as { entries?: unknown[]; diaryBodyList?: unknown } | unknown[];
  const rows: unknown[] = Array.isArray(j) ? j : Array.isArray((j as { entries?: unknown[] })?.entries) ? (j as { entries: unknown[] }).entries : j && typeof j === "object" && "diaryBodyList" in j ? [j] : [];
  const out: ImportEntry[] = [];
  for (const r of rows) {
    const e = r as Record<string, unknown>;
    // Raw MyDiary entry
    if (Array.isArray(e.diaryBodyList)) {
      const content = (e.diaryBodyList as { type?: string; content?: string }[]).filter((b) => b.type === "text").map((b) => b.content ?? "").join("\n\n").trim();
      const title = ((e.diaryTitle as { titleText?: { content?: string } })?.titleText?.content ?? "").trim();
      const mood = (e.diaryTitle as { moodEntry?: { moodName?: string } })?.moodEntry?.moodName ?? null;
      const ts = Number(e.diaryTime ?? e.createTime);
      if (!content || !ts) continue;
      out.push({ externalId: String(e.folder ?? ts), date: new Date(ts).toISOString(), title, content, mood, tags: [] });
      continue;
    }
    const content = typeof e.content === "string" ? e.content.trim() : "";
    const date = typeof e.date === "string" && !Number.isNaN(Date.parse(e.date)) ? new Date(e.date).toISOString() : null;
    if (!content || !date) continue;
    out.push({
      externalId: String(e.externalId ?? e.id ?? date).slice(0, 80),
      date,
      title: typeof e.title === "string" ? e.title.slice(0, 200) : "",
      content: content.slice(0, 100_000),
      mood: typeof e.mood === "string" ? e.mood.slice(0, 40) : null,
      tags: Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === "string").slice(0, 20) : [],
    });
  }
  return out;
}

/** Entries written on today's date in earlier years. */
export function onThisDay<T extends { date: string | Date }>(entries: T[], today = new Date()): T[] {
  const md = (d: Date) => `${d.getMonth()}-${d.getDate()}`;
  return entries.filter((e) => {
    const d = new Date(e.date);
    return md(d) === md(today) && d.getFullYear() < today.getFullYear();
  });
}

export const wordCount = (s: string) => (s.trim().match(/\S+/g) ?? []).length;
