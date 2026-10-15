"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { DURATION, easeOutCubic, prefersReducedMotion } from "@/lib/motion";

const defaultFormat = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * A number that rolls to its value: from 0 on first mount, then from the old
 * value to the new one whenever it really changes. A re-render with the same
 * value (e.g. a 5-second data refresh) does nothing.
 *
 * Writes straight to the DOM node each frame instead of setting state, so a
 * tween costs no React re-renders. The server/first render prints the final
 * value, so the number is right even before JS runs, and with reduced motion
 * it never moves.
 */
export function CountUp({
  value,
  format = defaultFormat,
  duration = DURATION.count,
  animateOnMount = true,
  className,
}: {
  value: number;
  /** How to print the number (default: rounded, with thousands separators). */
  format?: (n: number) => string;
  /** Tween length in ms. */
  duration?: number;
  /** Count up from 0 when first shown (default true). */
  animateOnMount?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // What's on screen right now (mid-tween included), so a change during a
  // tween continues from where the number is instead of jumping.
  const shown = useRef<number | null>(null);
  const formatRef = useRef(format);
  useLayoutEffect(() => { formatRef.current = format; });

  // Layout effect: runs before paint, so the first frame already shows the
  // start value (no flash of the final number, then a jump back).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = formatRef.current;
    const from = shown.current ?? (animateOnMount ? 0 : value);
    if (from === value || prefersReducedMotion() || duration <= 0) {
      shown.current = value;
      el.textContent = fmt(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    el.textContent = fmt(from);
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const v = from + (value - from) * easeOutCubic(k);
      shown.current = v;
      el.textContent = fmt(k < 1 ? v : value);
      if (k < 1) raf = requestAnimationFrame(step);
      else shown.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, animateOnMount]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format(value)}
    </span>
  );
}
