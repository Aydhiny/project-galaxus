// UI sound effects, synthesised live with Web Audio — no files, no licences,
// works offline. Short, soft, game-like. One shared AudioContext; every sound
// is a few oscillators or a noise burst with an envelope.
//
// Settings live in localStorage ("galaxus-sfx"): { on, volume }.

export type Sfx = "tick" | "toggle" | "open" | "close" | "success" | "error" | "notify" | "coin" | "levelup" | "whoosh" | "pop" | "hover";

const KEY = "galaxus-sfx";
type Settings = { on: boolean; volume: number };
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const last: Partial<Record<Sfx, number>> = {};

export function sfxSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s && typeof s.on === "boolean") return { on: s.on, volume: Math.min(1, Math.max(0, Number(s.volume) || 0.5)) };
  } catch { /* private mode */ }
  return { on: true, volume: 0.5 };
}
export function setSfxSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  if (master) master.gain.value = s.volume * 0.6;
  window.dispatchEvent(new Event("galaxus:sfx"));
}

function audio() {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (!master) {
      master = ctx.createGain();
      master.gain.value = sfxSettings().volume * 0.6;
      // A gentle compressor keeps overlapping sounds from clipping.
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
    }
    return ctx;
  } catch {
    return null;
  }
}

function tone(ac: AudioContext, at: number, freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number; attack?: number } = {}) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, at);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
  const peak = opts.gain ?? 0.25;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + (opts.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function noise(ac: AudioContext, at: number, dur: number, opts: { from: number; to: number; gain?: number; q?: number }) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = opts.q ?? 1.2;
  f.frequency.setValueAtTime(opts.from, at);
  f.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(opts.gain ?? 0.3, at + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(at);
  src.stop(at + dur + 0.05);
}

const MIN_GAP: Partial<Record<Sfx, number>> = { tick: 40, hover: 60, toggle: 60, notify: 400 };

export function play(name: Sfx) {
  if (typeof window === "undefined" || !sfxSettings().on) return;
  const nowMs = performance.now();
  if (nowMs - (last[name] ?? 0) < (MIN_GAP[name] ?? 30)) return;
  last[name] = nowMs;
  const ac = audio();
  if (!ac || !master) return;
  const t = ac.currentTime + 0.005;
  switch (name) {
    case "tick": tone(ac, t, 1800, 0.035, { type: "triangle", gain: 0.09 }); break;
    case "hover": tone(ac, t, 2400, 0.02, { type: "sine", gain: 0.03 }); break;
    case "toggle": tone(ac, t, 660, 0.05, { type: "square", gain: 0.05 }); tone(ac, t + 0.045, 990, 0.06, { type: "square", gain: 0.05 }); break;
    case "pop": tone(ac, t, 420, 0.12, { to: 900, gain: 0.18 }); break;
    case "open": tone(ac, t, 520, 0.09, { to: 780, type: "triangle", gain: 0.12 }); noise(ac, t, 0.12, { from: 900, to: 2600, gain: 0.05 }); break;
    case "close": tone(ac, t, 700, 0.09, { to: 420, type: "triangle", gain: 0.1 }); break;
    case "whoosh": noise(ac, t, 0.35, { from: 300, to: 3200, gain: 0.12, q: 0.8 }); break;
    case "success": [523.25, 659.25, 783.99].forEach((f, i) => tone(ac, t + i * 0.07, f, 0.22, { type: "triangle", gain: 0.13 })); break;
    case "error": tone(ac, t, 220, 0.18, { type: "sawtooth", gain: 0.07, to: 160 }); tone(ac, t + 0.12, 180, 0.2, { type: "sawtooth", gain: 0.06, to: 120 }); break;
    case "notify": tone(ac, t, 880, 0.3, { gain: 0.12 }); tone(ac, t + 0.12, 1318.5, 0.4, { gain: 0.1 }); break;
    case "coin": tone(ac, t, 987.77, 0.08, { type: "square", gain: 0.06 }); tone(ac, t + 0.08, 1318.5, 0.35, { type: "square", gain: 0.06 }); break;
    case "levelup":
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ac, t + i * 0.09, f, 0.3, { type: "triangle", gain: 0.14 }));
      tone(ac, t + 0.5, 1046.5, 0.9, { type: "sine", gain: 0.1 });
      break;
  }
}
