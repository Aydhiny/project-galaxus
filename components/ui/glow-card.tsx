"use client";
import { useRef, MouseEvent } from "react";
import { cn } from "@/lib/utils";

interface GlowCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glowColor?: string;
  intensity?: number;
}

export function GlowCard({ children, className, glowColor = "58 40% 258", intensity = 0.15, ...props }: GlowCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMove(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const { left, top } = el.getBoundingClientRect();
    el.style.setProperty("--glow-x", `${e.clientX - left}px`);
    el.style.setProperty("--glow-y", `${e.clientY - top}px`);
  }
  function handleLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--glow-x", "-999px");
    el.style.setProperty("--glow-y", "-999px");
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={cn("relative transition-all duration-300", className)}
      style={{
        "--glow-x": "-999px",
        "--glow-y": "-999px",
      } as React.CSSProperties}
      {...props}
    >
      {/* Glow overlay follows cursor */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(300px circle at var(--glow-x) var(--glow-y), oklch(0.58 0.28 258 / ${intensity}), transparent 70%)`,
        }}
      />
      {children}
    </div>
  );
}
