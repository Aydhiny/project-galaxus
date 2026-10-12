// Spatial sound for the empire: each district has its own synthesised voice
// (hammering at construction sites, a factory hum while automations work,
// coins near the vault), panned and faded by where the camera is. Nature on
// top: birds by day, rain when it rains, near-silence at night.
//
// Everything is generated with Web Audio (no files) and shares the UI sound
// context, so the volume/mute switch in the top bar controls it too.

import { sfxContext } from "@/lib/sfx";

type Key = "construction" | "factory" | "vault" | "mosque";
type Voice = { gain: GainNode; pan: StereoPannerNode };

export class EmpireAudio {
  private ac: AudioContext | null = null;
  private bus: GainNode | null = null;
  private voices = new Map<Key | "nature" | "rain", Voice>();
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hum: OscillatorNode[] = [];
  private rainSrc: AudioBufferSourceNode | null = null;
  private next = { hammer: 0, chirp: 0, coin: 0, cricket: 0 };
  private level: Partial<Record<Key, number>> = {};
  private night = 0;
  private raining = false;

  start() {
    if (this.ac) return;
    const ctx = sfxContext();
    if (!ctx) return;
    const { ac, out } = ctx;
    this.ac = ac;
    this.bus = ac.createGain(); this.bus.gain.value = 0.9; this.bus.connect(out);
    const len = ac.sampleRate * 2;
    this.noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    for (const k of ["construction", "factory", "vault", "mosque", "nature", "rain"] as const) {
      const gain = ac.createGain(); gain.gain.value = 0;
      const pan = ac.createStereoPanner();
      gain.connect(pan).connect(this.bus);
      this.voices.set(k, { gain, pan });
    }
    // Factory: a low two-oscillator hum through a lowpass.
    const f = this.voices.get("factory")!;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 180; lp.connect(f.gain);
    for (const [freq, type] of [[55, "sawtooth"], [82.5, "triangle"]] as const) {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = ac.createGain(); g.gain.value = 0.05; o.connect(g).connect(lp); o.start(); this.hum.push(o);
    }
    // Rain: looping filtered noise.
    const r = this.voices.get("rain")!;
    this.rainSrc = ac.createBufferSource(); this.rainSrc.buffer = this.noise; this.rainSrc.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1400; bp.Q.value = 0.6;
    this.rainSrc.connect(bp).connect(r.gain); this.rainSrc.start();

    this.timer = setInterval(() => this.schedule(), 90);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const o of this.hum) { try { o.stop(); } catch { /* already stopped */ } }
    try { this.rainSrc?.stop(); } catch { /* already stopped */ }
    this.bus?.disconnect();
    this.hum = []; this.voices.clear(); this.ac = null; this.bus = null; this.rainSrc = null;
  }

  /** Called ~8×/s with each district's loudness (0–1) and stereo position (−1…1). */
  update(mix: { key: Key; gain: number; pan: number }[], env: { night: number; raining: boolean }) {
    if (!this.ac) return;
    const now = this.ac.currentTime;
    this.night = env.night; this.raining = env.raining;
    const seen = new Set<Key>();
    for (const m of mix) {
      seen.add(m.key);
      this.level[m.key] = m.gain;
      const v = this.voices.get(m.key);
      if (!v) continue;
      const g = m.key === "factory" ? m.gain * 0.9 : m.gain;
      v.gain.gain.setTargetAtTime(g, now, 0.25);
      v.pan.pan.setTargetAtTime(m.pan, now, 0.25);
    }
    for (const k of ["construction", "factory", "vault", "mosque"] as const) if (!seen.has(k)) { this.level[k] = 0; this.voices.get(k)?.gain.gain.setTargetAtTime(0, now, 0.3); }
    this.voices.get("nature")?.gain.gain.setTargetAtTime(0.5 * (1 - this.night * 0.8) * (this.raining ? 0.3 : 1), now, 0.5);
    this.voices.get("rain")?.gain.gain.setTargetAtTime(this.raining ? 0.12 : 0, now, 0.8);
  }

  /** How close the mosque is (0–1) — the azan uses it while you're on the empire. */
  mosqueLevel() { return this.level.mosque ?? 0; }

  /** Cha-ching at the vault (a payment just arrived). */
  cash() {
    const ac = this.ac, v = this.voices.get("vault");
    if (!ac || !v) return;
    const t = ac.currentTime;
    this.noiseHit(v.gain, t, 0.05, 3000, 0.5);
    for (const [i, f] of [1320, 1760, 2637].entries()) this.tone(v.gain, t + 0.06 + i * 0.07, f, 0.35, 0.25, "triangle");
  }

  private schedule() {
    const ac = this.ac;
    if (!ac) return;
    const t = ac.currentTime;
    // Hammering at the nearest construction site
    if ((this.level.construction ?? 0) > 0.02 && t > this.next.hammer) {
      const g = this.voices.get("construction")!.gain;
      this.noiseHit(g, t, 0.04, 2200, 0.9); this.tone(g, t, 140, 0.08, 0.6, "sine", 70);
      this.next.hammer = t + (Math.random() < 0.25 ? 0.18 : 0.5 + Math.random() * 0.5);
    }
    // Occasional coin clinks near the vault
    if ((this.level.vault ?? 0) > 0.15 && t > this.next.coin) {
      this.tone(this.voices.get("vault")!.gain, t, 2400 + Math.random() * 600, 0.12, 0.18, "triangle");
      this.next.coin = t + 4 + Math.random() * 5;
    }
    // Birds by day, a few crickets at night — otherwise quiet
    const nature = this.voices.get("nature")!.gain;
    if (this.night < 0.5 && !this.raining && t > this.next.chirp) {
      const base = 2600 + Math.random() * 1600;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone(nature, t + i * 0.09, base, 0.07, 0.12, "sine", base * 1.25);
      this.next.chirp = t + 1.8 + Math.random() * 4;
    }
    if (this.night >= 0.5 && t > this.next.cricket) {
      for (let i = 0; i < 3; i++) this.tone(nature, t + i * 0.05, 4400, 0.03, 0.05, "square");
      this.next.cricket = t + 2.5 + Math.random() * 4;
    }
  }

  private tone(dest: AudioNode, at: number, freq: number, dur: number, gain: number, type: OscillatorType, to?: number) {
    const ac = this.ac!;
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest); o.start(at); o.stop(at + dur + 0.02);
  }

  private noiseHit(dest: AudioNode, at: number, dur: number, freq: number, gain: number) {
    const ac = this.ac!;
    const s = ac.createBufferSource(); s.buffer = this.noise;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 1.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(bp).connect(g).connect(dest); s.start(at, Math.random()); s.stop(at + dur + 0.02);
  }
}
