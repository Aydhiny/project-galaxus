"use client";
import { useMotionValue, motion, useMotionTemplate } from "framer-motion";
import React, { MouseEvent as ReactMouseEvent } from "react";
import { cn } from "@/lib/utils";

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  radius?: number;
  spotlightColor?: string;
  padding?: string;
  elevated?: boolean;
}

export function SpotlightCard({
  children, radius = 280, spotlightColor = "rgba(23,62,255,0.13)",
  className, padding = "p-5", elevated = false, ...props
}: SpotlightCardProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function onMouseMove({ currentTarget, clientX, clientY }: ReactMouseEvent<HTMLDivElement>) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  const background = useMotionTemplate`radial-gradient(${radius}px circle at ${mouseX}px ${mouseY}px, white, transparent 80%)`;

  return (
    <div
      onMouseMove={onMouseMove}
      className={cn(
        "group/spotlight relative rounded-2xl border overflow-hidden",
        // Dark glassmorphism
        "dark:bg-[rgba(10,14,28,0.80)] dark:border-white/[0.07]",
        "dark:[box-shadow:inset_0_1px_0_rgba(255,255,255,0.08),0_4px_24px_rgba(0,0,0,0.55)]",
        elevated && "dark:bg-[rgba(15,20,40,0.90)] dark:[box-shadow:inset_0_1px_0_rgba(255,255,255,0.10),0_8px_40px_rgba(0,0,0,0.65)]",
        // Light mode
        "bg-white/95 border-black/[0.07]",
        "[box-shadow:0_1px_3px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.05)]",
        elevated && "[box-shadow:0_2px_8px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.07)]",
        padding, className
      )}
      {...props}
    >
      {/* Spotlight overlay */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 transition duration-300 group-hover/spotlight:opacity-100"
        style={{
          background: spotlightColor,
          maskImage: background,
          WebkitMaskImage: background,
        }}
      />
      {/* Top edge highlight on dark */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px dark:bg-gradient-to-r dark:from-transparent dark:via-white/10 dark:to-transparent" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
