// Soft bell chimes synthesised with Web Audio — no sound files to ship.
// A bell = a few sine partials at inharmonic ratios, each fading out.

let ctx: AudioContext | null = null;

function bell(ac: AudioContext, freq: number, at: number, gain = 0.18) {
  const partials = [1, 2.0, 2.76, 5.4];
  partials.forEach((ratio, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    const peak = gain / (i + 1.5);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 2.8 / (i + 1));
    osc.connect(g).connect(ac.destination);
    osc.start(at);
    osc.stop(at + 3);
  });
}

/** "gentle" = three descending notes (wind-down), "sleep" = slow low pair, "done" = bright rising pair. */
export function playChime(kind: "gentle" | "sleep" | "done" = "gentle") {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime + 0.05;
    const notes = kind === "gentle" ? [784, 659, 523] : kind === "sleep" ? [392, 294] : [523, 784];
    notes.forEach((f, i) => bell(ctx!, f, t + i * (kind === "sleep" ? 1.1 : 0.45)));
  } catch {
    /* audio blocked until the user interacts — silent is fine */
  }
}
