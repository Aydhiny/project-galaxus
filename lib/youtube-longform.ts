// Long-form YouTube: pitches, full scripts with a shot list, and the rough cut
// of a recording. Pure logic — no I/O; tested in youtube-longform.test.ts.
//
// The edit is split on purpose: the model only decides WHICH transcript lines
// to cut (retakes, flubs, rambling) and where B-roll goes. Every timestamp is
// computed here from Whisper's line times and the measured silences, so a
// model can never invent a cut point that lands mid-word.

// ─── Types ────────────────────────────────────────────────────────────────────

/** "auto": Claude first, free models if it fails; "free": free models only (costs nothing). */
export type BrainPref = "auto" | "free";

export const PILLARS = ["gamedev", "dev", "tutorial", "my-game"] as const;
export type Pillar = (typeof PILLARS)[number];
export const PILLAR_LABEL: Record<Pillar, string> = { gamedev: "Game dev", dev: "Development", tutorial: "Tutorial", "my-game": "My game" };

export type LongPitch = {
  topic: string; // one line: what the video is about
  angle: string; // the promise / why someone clicks
  why: string; // evidence from the channel for this idea
  viewer: string; // who it's for
  minutes: number;
  pillar: Pillar;
  outline: string[];
};

/** One spoken line and what's on screen while it's said. */
export type Beat = { say: string; show: string };
export type ScriptSection = { heading: string; minutes: number; beats: Beat[] };
export type Shot = { shot: string; how: string };

export type LongScript = {
  hook: Beat[]; // first ~30 seconds
  sections: ScriptSection[];
  outro: Beat[];
  titles: string[];
  thumbnail: string;
  description: string;
  shots: Shot[]; // what to capture before/while recording
};

export type LongPlan = { pitch: LongPitch; script?: LongScript | null };

export type Span = { start: number; end: number };
export type Segment = Span & { text: string };

export type EditDecision = {
  cut: { seg: number; why: string }[];
  show: { seg: number; what: string }[];
  chapters: { seg: number; title: string }[];
  titles: string[];
  description: string;
  notes: string;
};

// ─── Model output → typed data (lenient: free models wobble) ─────────────────

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/** The first JSON object in a model's answer (code fences and chatter around it are ignored). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  if (start < 0) throw new Error("The model didn't answer with JSON.");
  // Walk to the matching brace, respecting strings.
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(body.slice(start, i + 1));
  }
  throw new Error("The model's JSON was cut off — try again.");
}

const asPillar = (v: unknown): Pillar => {
  const s = str(v).toLowerCase();
  if ((PILLARS as readonly string[]).includes(s)) return s as Pillar;
  if (/tutorial|how/.test(s)) return "tutorial";
  if (/game|unity|devlog|hunter/.test(s)) return /my|hunter|devlog/.test(s) ? "my-game" : "gamedev";
  return "dev";
};

export function parsePitches(raw: unknown): (LongPitch & { title: string })[] {
  const list = arr((raw as { ideas?: unknown })?.ideas ?? raw);
  return list.flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const title = str(o.title, 120);
    if (!title) return [];
    return [{
      title,
      topic: str(o.topic, 300),
      angle: str(o.angle, 300),
      why: str(o.why, 600),
      viewer: str(o.viewer, 200),
      minutes: Math.round(num(o.minutes, 4, 40, 12)),
      pillar: asPillar(o.pillar),
      outline: arr(o.outline).map((s) => str(s, 200)).filter(Boolean).slice(0, 12),
    }];
  }).slice(0, 8);
}

const beats = (v: unknown): Beat[] =>
  arr(v).flatMap((b) => {
    const o = (b ?? {}) as Record<string, unknown>;
    const say = str(o.say, 1500);
    const show = str(o.show, 400);
    return say || show ? [{ say, show }] : [];
  });

export function parseLongScript(raw: unknown): LongScript {
  const o = (raw ?? {}) as Record<string, unknown>;
  const sections = arr(o.sections).flatMap((x) => {
    const s = (x ?? {}) as Record<string, unknown>;
    const b = beats(s.beats);
    return b.length ? [{ heading: str(s.heading, 120) || "Section", minutes: num(s.minutes, 0, 30, 2), beats: b }] : [];
  });
  const hook = beats(o.hook);
  if (!hook.length || !sections.length) throw new Error("The script came back incomplete — try again.");
  return {
    hook,
    sections,
    outro: beats(o.outro),
    titles: arr(o.titles).map((t) => str(t, 100)).filter(Boolean).slice(0, 5),
    thumbnail: str(o.thumbnail, 400),
    description: str(o.description, 3000),
    shots: arr(o.shots).flatMap((x) => {
      const s = (x ?? {}) as Record<string, unknown>;
      const shot = str(s.shot, 200);
      return shot ? [{ shot, how: str(s.how, 400) }] : [];
    }).slice(0, 30),
  };
}

/** The script as plain text — what the idea's `script` field holds, readable anywhere. */
export function scriptText(s: LongScript): string {
  const block = (b: Beat[]) => b.map((x) => `${x.say}${x.show ? `\n  [SHOW: ${x.show}]` : ""}`).join("\n");
  return [
    "HOOK", block(s.hook), "",
    ...s.sections.flatMap((sec) => [`${sec.heading.toUpperCase()} (~${sec.minutes} min)`, block(sec.beats), ""]),
    ...(s.outro.length ? ["OUTRO", block(s.outro)] : []),
  ].join("\n").trim();
}

export const spokenWords = (s: LongScript) =>
  [...s.hook, ...s.sections.flatMap((x) => x.beats), ...s.outro].reduce((n, b) => n + (b.say.match(/\S+/g)?.length ?? 0), 0);

export function parseEditDecision(raw: unknown, segCount: number): EditDecision {
  const o = (raw ?? {}) as Record<string, unknown>;
  const seg = (v: unknown) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n < segCount ? n : null;
  };
  const uniq = <T extends { seg: number }>(xs: T[]) => [...new Map(xs.map((x) => [x.seg, x])).values()].sort((a, b) => a.seg - b.seg);
  const cut = uniq(arr(o.cut).flatMap((x) => {
    const c = (x ?? {}) as Record<string, unknown>;
    const s = seg(typeof x === "number" ? x : c.seg);
    return s == null ? [] : [{ seg: s, why: str(c.why, 200) }];
  }));
  // Never let a model cut (almost) everything: that's a misunderstanding, not an edit.
  if (segCount > 0 && cut.length > segCount * 0.7) throw new Error("The model tried to cut most of the video — try again.");
  return {
    cut,
    show: uniq(arr(o.show).flatMap((x) => {
      const c = (x ?? {}) as Record<string, unknown>;
      const s = seg(c.seg);
      const what = str(c.what, 300);
      return s == null || !what ? [] : [{ seg: s, what }];
    })),
    chapters: uniq(arr(o.chapters).flatMap((x) => {
      const c = (x ?? {}) as Record<string, unknown>;
      const s = seg(c.seg);
      const title = str(c.title, 80);
      return s == null || !title ? [] : [{ seg: s, title }];
    })),
    titles: arr(o.titles).map((t) => str(t, 100)).filter(Boolean).slice(0, 5),
    description: str(o.description, 3000),
    notes: str(o.notes, 1500),
  };
}

// ─── Audio (browser hands us 16 kHz mono samples) ────────────────────────────

/**
 * Stretches of near-silence at least `minSec` long. The threshold adapts to
 * the recording: 10 dB above its quiet floor (20th percentile of loudness),
 * so a noisy room and a treated booth both work.
 */
export function findSilences(samples: Float32Array, rate: number, minSec = 0.6, windowSec = 0.03): Span[] {
  const win = Math.max(1, Math.round(rate * windowSec));
  const n = Math.floor(samples.length / win);
  if (n === 0) return [];
  const db = new Float32Array(n);
  for (let w = 0; w < n; w++) {
    let sum = 0;
    for (let i = w * win; i < (w + 1) * win; i++) sum += samples[i] * samples[i];
    db[w] = 10 * Math.log10(sum / win + 1e-12);
  }
  const sorted = Float32Array.from(db).sort();
  const floor = sorted[Math.floor(n * 0.2)];
  const threshold = Math.min(-30, Math.max(-60, floor + 10));
  const out: Span[] = [];
  let from = -1;
  for (let w = 0; w <= n; w++) {
    const quiet = w < n && db[w] < threshold;
    if (quiet && from < 0) from = w;
    if (!quiet && from >= 0) {
      const start = (from * win) / rate, end = (w * win) / rate;
      if (end - start >= minSec) out.push({ start: round(start), end: round(end) });
      from = -1;
    }
  }
  return out;
}

/** Transcription chunks of at most `maxSec`, split in the middle of a silence when one is near the limit (so no word is cut in half). */
export function planChunks(duration: number, silences: Span[], maxSec = 100): Span[] {
  const chunks: Span[] = [];
  let start = 0;
  while (duration - start > maxSec) {
    const limit = start + maxSec;
    const quiet = silences.filter((s) => (s.start + s.end) / 2 > start + maxSec * 0.5 && (s.start + s.end) / 2 < limit);
    const end = quiet.length ? round((quiet[quiet.length - 1].start + quiet[quiet.length - 1].end) / 2) : limit;
    chunks.push({ start, end });
    start = end;
  }
  if (duration - start > 0.05) chunks.push({ start, end: round(duration) });
  return chunks;
}

/** 16-bit PCM WAV bytes — what Whisper gets for each chunk. */
export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const text = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  text(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE");
  text(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

// ─── Subtitles in (paste an SRT/VTT instead of transcribing) ─────────────────

const tc = (s: string) => {
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!m) return NaN;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000;
};

export function parseSubtitles(text: string): Segment[] {
  const out: Segment[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->");
    const start = tc(a), end = tc(b.trim().split(/\s+/)[0]);
    const words = lines.slice(i + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && words) out.push({ start, end, text: words });
  }
  return out.sort((x, y) => x.start - y.start);
}

// ─── The cut ──────────────────────────────────────────────────────────────────

const round = (n: number) => Math.round(n * 1000) / 1000;

export type CutOptions = { padBefore?: number; padAfter?: number; joinGap?: number; maxPause?: number; minKeep?: number };

/**
 * What stays: every line the model didn't cut, padded a little, with pauses
 * between and inside lines shortened to `maxPause` (jump cuts on dead air).
 */
export function keepRanges(segments: Segment[], cutIds: number[], silences: Span[], duration: number, o: CutOptions = {}): Span[] {
  const padBefore = o.padBefore ?? 0.12, padAfter = o.padAfter ?? 0.2, joinGap = o.joinGap ?? 0.35;
  const maxPause = o.maxPause ?? 0.5, minKeep = o.minKeep ?? 0.25;
  const cut = new Set(cutIds);

  // 1. Kept lines, padded, merged when the gap is a natural breath.
  const lines: Span[] = [];
  let cutSince = false; // never merge across a cut line, however short
  segments.forEach((s, i) => {
    if (cut.has(i)) { cutSince = true; return; }
    const span = { start: Math.max(0, s.start - padBefore), end: Math.min(duration, s.end + padAfter) };
    const last = lines[lines.length - 1];
    if (last && !cutSince && span.start - last.end <= joinGap) last.end = Math.max(last.end, span.end);
    else lines.push(span);
    cutSince = false;
  });
  // A cut line wins over its neighbours' padding.
  for (const i of cut) {
    const s = segments[i];
    if (!s) continue;
    for (const l of lines) {
      if (l.end > s.start && l.end <= s.end) l.end = s.start;
      if (l.start < s.end && l.start >= s.start) l.start = s.end;
    }
  }

  // 2. Long silences inside what's left shrink to maxPause.
  const out: Span[] = [];
  for (const l of lines) {
    let from = l.start;
    for (const q of silences) {
      if (q.end <= from || q.start >= l.end) continue;
      const qs = Math.max(q.start, from), qe = Math.min(q.end, l.end);
      if (qe - qs <= maxPause) continue;
      const half = maxPause / 2;
      if (qs + half - from >= minKeep) out.push({ start: from, end: qs + half });
      from = qe - half;
    }
    if (l.end - from >= minKeep) out.push({ start: from, end: l.end });
  }
  return out.map((r) => ({ start: round(r.start), end: round(r.end) }));
}

export const keptSeconds = (ranges: Span[]) => ranges.reduce((s, r) => s + (r.end - r.start), 0);

/** Where a moment of the recording lands in the edited video (null if it was cut). */
export function mapTime(t: number, ranges: Span[]): number | null {
  let acc = 0;
  for (const r of ranges) {
    if (t < r.start) return null;
    if (t <= r.end) return round(acc + (t - r.start));
    acc += r.end - r.start;
  }
  return null;
}

/** First moment of a line that survived the cut, on the edited timeline. */
export function segmentOutTime(s: Span, ranges: Span[]): number | null {
  for (const r of ranges) {
    if (r.end <= s.start || r.start >= s.end) continue;
    return mapTime(Math.max(s.start, r.start), ranges);
  }
  return null;
}

export function clock(sec: number, withHours = false): string {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h || withHours ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * An ffmpeg filter graph that keeps `ranges` in one pass (select/aselect, so
 * hundreds of jump cuts stay fast). Used with `-/filter_complex <file>`.
 */
export function ffmpegFilter(ranges: Span[]): string {
  const expr = ranges.map((r) => `between(t,${r.start.toFixed(3)},${r.end.toFixed(3)})`).join("+");
  return `[0:v]select='${expr}',setpts=N/FRAME_RATE/TB[v];\n[0:a]aselect='${expr}',asetpts=N/SR/TB[a]\n`;
}

export const FILTER_FILE = "galaxus-cut.txt";

export function ffmpegCommand(fileName: string): string {
  const out = fileName.replace(/\.[^.]+$/, "") + "-edit.mp4";
  return `ffmpeg -i "${fileName}" -/filter_complex ${FILTER_FILE} -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 192k "${out}"`;
}

const frames = (sec: number, fps: number) => {
  const f = Math.round(sec * fps);
  const ff = f % fps, s = Math.floor(f / fps);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
};

/** CMX 3600 EDL — DaVinci Resolve / Premiere import it as a timeline of the kept pieces. */
export function edl(ranges: Span[], fps: number, clipName: string, title: string): string {
  const lines = [`TITLE: ${title.replace(/[^\w .-]/g, "").slice(0, 60) || "Galaxus edit"}`, "FCM: NON-DROP FRAME", ""];
  let rec = 0;
  ranges.forEach((r, i) => {
    const len = r.end - r.start;
    lines.push(`${String(i + 1).padStart(3, "0")}  AX       AA/V  C        ${frames(r.start, fps)} ${frames(r.end, fps)} ${frames(rec, fps)} ${frames(rec + len, fps)}`);
    lines.push(`* FROM CLIP NAME: ${clipName}`, "");
    rec += len;
  });
  return lines.join("\n");
}

const srtTime = (sec: number) => {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

/** Captions for the EDITED video: cut lines dropped, kept ones moved to their new time. */
export function srtForEdit(segments: Segment[], cutIds: number[], ranges: Span[]): string {
  const cut = new Set(cutIds);
  const cues: string[] = [];
  segments.forEach((s, i) => {
    if (cut.has(i)) return;
    const start = segmentOutTime(s, ranges);
    if (start == null) return;
    let end = start;
    for (const r of ranges) {
      if (r.end <= s.start || r.start >= s.end) continue;
      end = mapTime(Math.min(s.end, r.end), ranges) ?? end;
    }
    if (end - start < 0.3) end = start + 0.3;
    cues.push(`${cues.length + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${s.text}\n`);
  });
  return cues.join("\n");
}

/**
 * YouTube chapters on the edited timeline. YouTube only shows them when the
 * first is 0:00, there are at least 3, and each is 10 s or longer.
 */
export function chapterLines(chapters: EditDecision["chapters"], segments: Segment[], ranges: Span[], total: number): string[] {
  const at = chapters
    .map((c) => ({ title: c.title, t: segments[c.seg] ? segmentOutTime(segments[c.seg], ranges) : null }))
    .filter((c): c is { title: string; t: number } => c.t != null)
    .sort((a, b) => a.t - b.t);
  const out: { title: string; t: number }[] = [];
  for (const c of at) {
    const prev = out[out.length - 1];
    if (prev && c.t - prev.t < 10) continue;
    out.push(out.length === 0 ? { ...c, t: 0 } : c);
  }
  while (out.length && total - out[out.length - 1].t < 10) out.pop();
  if (out.length < 3) return [];
  const hours = total >= 3600;
  return out.map((c) => `${clock(c.t, hours)} ${c.title}`);
}

// ─── Prompt helpers ───────────────────────────────────────────────────────────

/** Numbered transcript lines for the model ("[12] 3:05 so the trick is…"), trimmed to fit a free model's window. */
export function transcriptForPrompt(segments: Segment[], maxChars = 60_000): string {
  const lines = segments.map((s, i) => `[${i}] ${clock(s.start)} ${s.text}`);
  let text = lines.join("\n");
  if (text.length <= maxChars) return text;
  // Too long: keep each line but shorten its words evenly.
  const per = Math.max(40, Math.floor(maxChars / lines.length));
  text = lines.map((l) => (l.length > per ? l.slice(0, per - 1) + "…" : l)).join("\n");
  return text;
}
