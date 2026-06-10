"use client";
import { cn } from "@/lib/utils";

interface BorderBeamProps {
  className?: string;
  size?: number;
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
}

export function BorderBeam({
  className,
  size = 200,
  duration = 8,
  colorFrom = "#173eff",
  colorTo = "#a78bfa",
  borderWidth = 1,
}: BorderBeamProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] [border:1px_solid_transparent]",
        className
      )}
      style={{
        background: `linear-gradient(#0000,#0000) padding-box, conic-gradient(from var(--border-angle,0turn), transparent 75%, ${colorFrom}, ${colorTo}, transparent) border-box`,
        animation: `border-spin ${duration}s linear infinite`,
        borderWidth,
      } as React.CSSProperties}
    />
  );
}
