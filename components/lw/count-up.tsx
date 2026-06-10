"use client";
import React, { useState, useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { cn } from "@/lib/utils";

interface CountUpProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  colorScheme?: "default" | "gradient" | "blue";
}

export function CountUp({ value, duration = 1.5, decimals = 0, prefix = "", suffix = "", className, colorScheme = "default" }: CountUpProps) {
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => prefix + v.toFixed(decimals) + suffix);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !hasAnimated) {
        animate(0, value, { duration, ease: "easeOut", onUpdate: (v) => count.set(v), onComplete: () => setHasAnimated(true) });
      }
    }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [value, duration, hasAnimated, count]);

  const colorClass = colorScheme === "gradient"
    ? "bg-clip-text text-transparent bg-gradient-to-r from-[#173eff] to-[#a78bfa]"
    : colorScheme === "blue" ? "text-[#3758f9]" : "";

  return (
    <div ref={ref} className={cn("inline-flex items-baseline font-bold tabular-nums", className)}>
      <motion.span className={colorClass}>{rounded}</motion.span>
    </div>
  );
}
