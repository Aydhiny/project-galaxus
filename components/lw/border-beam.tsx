"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface BorderBeamProps {
  className?: string;
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  reverse?: boolean;
  initialOffset?: number;
  borderThickness?: number;
  opacity?: number;
  glowIntensity?: number;
  beamBorderRadius?: number;
  speedMultiplier?: number;
}

export const BorderBeam = ({
  className, size = 100, delay = 0, duration = 6,
  colorFrom = "#173eff", colorTo = "#a78bfa",
  reverse = false, initialOffset = 0, borderThickness = 1,
  opacity = 1, glowIntensity = 0, beamBorderRadius, speedMultiplier = 1,
}: BorderBeamProps) => {
  const actualDuration = speedMultiplier ? duration / speedMultiplier : duration;
  const glowEffect = glowIntensity > 0 ? `0 0 ${glowIntensity * 5}px ${glowIntensity * 2}px ${colorFrom}` : undefined;
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]"
      style={{ borderWidth: `${borderThickness}px` }}
    >
      <motion.div
        className={cn("absolute aspect-square bg-gradient-to-l from-[var(--color-from)] via-[var(--color-to)] to-transparent", className)}
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${beamBorderRadius ?? size}px)`,
          "--color-from": colorFrom,
          "--color-to": colorTo,
          opacity,
          boxShadow: glowEffect,
        } as React.CSSProperties & { "--color-from": string; "--color-to": string }}
        initial={{ offsetDistance: `${initialOffset}%` }}
        animate={{ offsetDistance: reverse ? [`${100 - initialOffset}%`, `${-initialOffset}%`] : [`${initialOffset}%`, `${100 + initialOffset}%`] }}
        transition={{ repeat: Infinity, ease: "linear", duration: actualDuration, delay: -delay }}
      />
    </div>
  );
};
