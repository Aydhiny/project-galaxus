"use client";

import type { Confetti } from "@/lib/celebrate";

/**
 * Fire confetti for a celebration tier. Loaded on demand (keeps it out of the
 * main bundle) and skipped entirely when the OS asks for reduced motion.
 */
export async function fireConfetti(kind: Confetti) {
  if (kind === "none" || typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const confetti = (await import("canvas-confetti")).default;
  if (kind === "small") {
    confetti({ particleCount: 60, spread: 60, startVelocity: 35, origin: { y: 0.8 }, scalar: 0.8, disableForReducedMotion: true });
    return;
  }
  // "big": two side cannons, then a centre burst.
  const opts = { particleCount: 90, spread: 70, startVelocity: 50, disableForReducedMotion: true };
  confetti({ ...opts, angle: 60, origin: { x: 0, y: 0.8 } });
  confetti({ ...opts, angle: 120, origin: { x: 1, y: 0.8 } });
  setTimeout(() => confetti({ particleCount: 140, spread: 100, origin: { y: 0.6 }, disableForReducedMotion: true }), 250);
}
