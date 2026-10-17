import { describe, expect, it } from "vitest";
import {
  chapterLines, edl, encodeWav, extractJson, ffmpegFilter, findSilences, keepRanges, keptSeconds, mapTime, parseEditDecision,
  parseLongScript, parsePitches, parseSubtitles, planChunks, scriptText, srtForEdit, type Segment,
} from "./youtube-longform";

const seg = (start: number, end: number, text = "line"): Segment => ({ start, end, text });

describe("extractJson", () => {
  it("reads JSON inside fences and chatter, with braces in strings", () => {
    expect(extractJson('Sure!\n```json\n{"a":"x}y","b":{"c":1}}\n```\nDone')).toEqual({ a: "x}y", b: { c: 1 } });
    expect(extractJson('here {"ok":true} trailing')).toEqual({ ok: true });
  });
  it("explains cut-off JSON", () => {
    expect(() => extractJson('{"a":[1,2')).toThrow(/cut off/);
  });
});

describe("parsePitches", () => {
  it("normalises pillars, clamps minutes, drops untitled", () => {
    const p = parsePitches({ ideas: [
      { title: "Making enemies smarter in Unity", pillar: "Unity tutorial", minutes: 200, outline: ["a", 3, "b"] },
      { title: "" },
      { title: "Hunter Mouse 2 devlog", pillar: "devlog" },
    ] });
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ pillar: "tutorial", minutes: 40, outline: ["a", "b"] });
    expect(p[1].pillar).toBe("my-game");
  });
});

describe("parseLongScript", () => {
  const raw = {
    hook: [{ say: "This bug cost me a week.", show: "the bug clip" }],
    sections: [{ heading: "Setup", minutes: 2, beats: [{ say: "First, the scene.", show: "Unity editor" }] }, { heading: "Empty", beats: [] }],
    outro: [], titles: ["A", "B"], shots: [{ shot: "Facecam intro", how: "" }, { how: "no shot" }],
  };
  it("keeps real sections and shots", () => {
    const s = parseLongScript(raw);
    expect(s.sections).toHaveLength(1);
    expect(s.shots).toEqual([{ shot: "Facecam intro", how: "" }]);
    expect(scriptText(s)).toContain("[SHOW: Unity editor]");
  });
  it("rejects a script without a hook", () => {
    expect(() => parseLongScript({ ...raw, hook: [] })).toThrow(/incomplete/);
  });
});

describe("parseEditDecision", () => {
  it("drops out-of-range and duplicate lines", () => {
    const d = parseEditDecision({ cut: [{ seg: 1, why: "retake" }, { seg: 1 }, { seg: 99 }, 2], chapters: [{ seg: 0, title: "Intro" }] }, 10);
    expect(d.cut.map((c) => c.seg)).toEqual([1, 2]);
    expect(d.chapters).toEqual([{ seg: 0, title: "Intro" }]);
  });
  it("refuses to cut most of the video", () => {
    expect(() => parseEditDecision({ cut: [0, 1, 2, 3] }, 4)).toThrow(/most of the video/);
  });
});

describe("findSilences", () => {
  it("finds the quiet gap between two loud parts", () => {
    const rate = 1000;
    const s = new Float32Array(3000);
    for (let i = 0; i < 3000; i++) s[i] = i < 1000 || i >= 2000 ? Math.sin(i) * 0.5 : 0.0001 * Math.sin(i);
    const q = findSilences(s, rate, 0.6);
    expect(q).toHaveLength(1);
    expect(q[0].start).toBeCloseTo(1, 1);
    expect(q[0].end).toBeCloseTo(2, 1);
  });
});

describe("planChunks", () => {
  it("splits at the last silence before the limit", () => {
    const c = planChunks(250, [{ start: 80, end: 82 }, { start: 170, end: 172 }], 100);
    expect(c).toEqual([{ start: 0, end: 81 }, { start: 81, end: 171 }, { start: 171, end: 250 }]);
  });
  it("falls back to a hard split without silences", () => {
    expect(planChunks(150, [], 100)).toEqual([{ start: 0, end: 100 }, { start: 100, end: 150 }]);
  });
});

describe("encodeWav", () => {
  it("writes a valid header", () => {
    const w = encodeWav(new Float32Array([0, 1, -1]), 16000);
    expect(String.fromCharCode(...w.slice(0, 4))).toBe("RIFF");
    expect(w.length).toBe(44 + 6);
    const v = new DataView(w.buffer);
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getInt16(46, true)).toBe(32767);
  });
});

describe("parseSubtitles", () => {
  it("reads SRT and VTT", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,500\nHello <b>there</b>\n\n2\n00:00:03,000 --> 00:00:04,000\nSecond\n";
    expect(parseSubtitles(srt)).toEqual([{ start: 1, end: 2.5, text: "Hello there" }, { start: 3, end: 4, text: "Second" }]);
    const vtt = "WEBVTT\n\n00:01.000 --> 00:02.000 align:start\nHi\n";
    expect(parseSubtitles(vtt)).toEqual([{ start: 1, end: 2, text: "Hi" }]);
  });
});

describe("keepRanges", () => {
  const segs = [seg(0, 2), seg(2.1, 4, "retake"), seg(4.2, 6), seg(10, 12)];

  it("drops cut lines, merges breaths, and removes the long gap", () => {
    const r = keepRanges(segs, [1], [], 12, { padBefore: 0, padAfter: 0 });
    expect(r).toEqual([{ start: 0, end: 2 }, { start: 4.2, end: 6 }, { start: 10, end: 12 }]);
  });

  it("never merges across a short cut line", () => {
    const r = keepRanges([seg(0, 1), seg(1.05, 1.3, "uh"), seg(1.35, 2)], [1], [], 2, { padBefore: 0.1, padAfter: 0.1 });
    expect(r.some((x) => x.start < 1.1 && x.end > 1.25)).toBe(false);
  });

  it("shortens a long pause inside a kept line", () => {
    const r = keepRanges([seg(0, 10)], [], [{ start: 3, end: 6 }], 10, { padBefore: 0, padAfter: 0, maxPause: 0.5 });
    expect(r).toEqual([{ start: 0, end: 3.25 }, { start: 5.75, end: 10 }]);
    expect(keptSeconds(r)).toBeCloseTo(7.5);
  });
});

describe("timeline exports", () => {
  const ranges = [{ start: 0, end: 2 }, { start: 4, end: 6 }, { start: 10, end: 40 }];
  const segs = [seg(0, 2, "a"), seg(2, 4, "cut me"), seg(4, 6, "b"), seg(10, 25, "c"), seg(25, 40, "d")];

  it("maps recording time to edited time", () => {
    expect(mapTime(1, ranges)).toBe(1);
    expect(mapTime(3, ranges)).toBeNull();
    expect(mapTime(5, ranges)).toBe(3);
    expect(mapTime(10, ranges)).toBe(4);
  });

  it("re-times captions and skips cut lines", () => {
    const srt = srtForEdit(segs, [1], ranges);
    expect(srt).not.toContain("cut me");
    expect(srt).toContain("00:00:02,000 --> 00:00:04,000\nb");
  });

  it("chapters follow YouTube's rules", () => {
    const ch = chapterLines([{ seg: 0, title: "Intro" }, { seg: 2, title: "Too close" }, { seg: 3, title: "Main" }, { seg: 4, title: "End" }], segs, ranges, 34);
    // 0:00 Intro, Main at 0:04 is <10s after Intro → skipped; End at 0:19 → only 2 → none.
    expect(ch).toEqual([]);
    const ok = chapterLines([{ seg: 0, title: "Intro" }, { seg: 3, title: "Main" }, { seg: 4, title: "End" }], [seg(0, 2), seg(2, 3), seg(3, 4), seg(14, 20), seg(30, 40)], [{ start: 0, end: 40 }], 40);
    expect(ok).toEqual(["0:00 Intro", "0:14 Main", "0:30 End"]);
  });

  it("builds an ffmpeg filter and an EDL", () => {
    const f = ffmpegFilter(ranges);
    expect(f).toContain("between(t,4.000,6.000)");
    expect(f).toContain("asetpts=N/SR/TB[a]");
    const e = edl(ranges, 30, "rec.mp4", "My video");
    expect(e).toContain("001  AX       AA/V  C        00:00:00:00 00:00:02:00 00:00:00:00 00:00:02:00");
    expect(e).toContain("002  AX       AA/V  C        00:00:04:00 00:00:06:00 00:00:02:00 00:00:04:00");
    expect(e).toContain("* FROM CLIP NAME: rec.mp4");
  });
});
