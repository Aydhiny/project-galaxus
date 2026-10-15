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

/**
 * A tiny burst from one spot on screen (a checkbox, an Accept button): the
 * small "yes!" for everyday wins. Pass the element that was clicked.
 */
export async function fireBurst(from?: Element | null, colors?: string[]) {
  // No matchMedia = not a real browser (tests): skip quietly.
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = from?.getBoundingClientRect();
  const origin = r
    ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight }
    : { x: 0.5, y: 0.7 };
  const confetti = (await import("canvas-confetti")).default;
  confetti({
    particleCount: 18, spread: 70, startVelocity: 16, gravity: 0.9, ticks: 70, scalar: 0.55,
    origin, colors: colors ?? ["#34d399", "#6b8afd", "#f5a524"], disableForReducedMotion: true,
  });
}
