// The JS half of the motion system (the CSS half lives at the top of
// app/globals.css). Same numbers in both places so CSS and framer-motion
// animations feel like one app. No framer-motion import here: this file is
// safe to use from anything without pulling the library into the bundle.

/** Durations in ms (match --motion-* in globals.css). */
export const DURATION = {
  instant: 80,
  fast: 140,
  base: 200,
  slow: 320,
  bar: 700,
  count: 700,
} as const;

/** Cubic-bezier easings (match --ease-* in globals.css), as framer-motion arrays. */
export const EASE = {
  outExpo: [0.16, 1, 0.3, 1],
  spring: [0.34, 1.56, 0.64, 1],
  snappy: [0.2, 0, 0, 1],
} as const;

/** framer-motion spring presets: pass as `transition={SPRING}`. */
export const SPRING = { type: "spring", stiffness: 420, damping: 28, mass: 0.8 } as const;
/** Softer, for larger surfaces (panels, sheets). */
export const SPRING_SOFT = { type: "spring", stiffness: 260, damping: 26 } as const;
/** Bouncy, for small celebratory things (badges, checkmarks). */
export const SPRING_BOUNCY = { type: "spring", stiffness: 560, damping: 18 } as const;

/** True when the OS asks for reduced motion (false on the server / in old browsers). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** easeOutCubic: fast start, gentle landing. Used by number tweens. */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
