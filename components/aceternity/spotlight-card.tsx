"use client";
import { useMotionValue, motion, useMotionTemplate } from "framer-motion";
import React, { MouseEvent as ReactMouseEvent, useState } from "react";
import { cn } from "@/lib/utils";

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  radius?: number;
  spotlightColor?: string;
  padding?: string;
  elevated?: boolean;
  tilt?: boolean;
}

export function SpotlightCard({
  children,
  radius = 260,
  spotlightColor = "rgba(23,62,255,0.10)",
  className,
  padding = "p-5",
  elevated = false,
  tilt = true,
  ...props
}: SpotlightCardProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const [rot, setRot] = useState({ x: 0, y: 0 });

  const maskImage = useMotionTemplate`radial-gradient(${radius}px circle at ${mouseX}px ${mouseY}px, white, transparent 80%)`;

  function onMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const { left, top, width, height } = el.getBoundingClientRect();
    const x = e.clientX - left;
    const y = e.clientY - top;
    mouseX.set(x);
    mouseY.set(y);
    if (tilt) {
      // max ±6 degrees
      setRot({
        x: ((y / height) - 0.5) * 6,
        y: -((x / width) - 0.5) * 6,
      });
    }
  }

  function onMouseLeave() {
    if (tilt) setRot({ x: 0, y: 0 });
    mouseX.set(-9999);
    mouseY.set(-9999);
  }

  return (
    <motion.div
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      animate={{
        rotateX: rot.x,
        rotateY: rot.y,
        transition: { type: "spring", stiffness: 200, damping: 20 },
      }}
      className={cn(
        "group/spotlight relative rounded-2xl border overflow-hidden",
        // Dark: 2-color gradient (blue-navy → deep navy) + glass
        "dark:border-white/[0.07]",
        "dark:[background:linear-gradient(135deg,rgba(13,18,38,0.88)_0%,rgba(7,11,22,0.84)_100%)]",
        elevated
          ? "dark:[box-shadow:inset_0_1px_0_rgba(255,255,255,0.10),inset_0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_rgba(0,0,0,0.65)]"
          : "dark:[box-shadow:inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(255,255,255,0.03),0_4px_24px_rgba(0,0,0,0.55)]",
        // Light: 2-color gradient (white → very light blue)
        "[background:linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(240,244,255,0.92)_100%)]",
        "border-black/[0.07] [box-shadow:0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.05)]",
        padding,
        className
      )}
      style={{ transformStyle: "preserve-3d", perspective: "1000px" }}
      {...(props as any)}
    >
      {/* Spotlight glow overlay */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 transition duration-300 group-hover/spotlight:opacity-100"
        style={{
          background: spotlightColor,
          maskImage,
          WebkitMaskImage: maskImage,
        }}
      />
      {/* Top edge highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px dark:bg-gradient-to-r dark:from-transparent dark:via-blue-500/20 dark:to-transparent" />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
