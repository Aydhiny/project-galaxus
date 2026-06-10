"use client";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface InteractiveGradientCardProps {
  glowColor?: string;
  borderColor?: string;
  className?: string;
  children?: React.ReactNode;
}

export const InteractiveGradientCard = ({
  glowColor = "#173eff40",
  borderColor = "#173eff",
  className,
  children,
}: InteractiveGradientCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("mousemove", move);
    return () => el.removeEventListener("mousemove", move);
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={cn("relative rounded-2xl border transition-all duration-300 overflow-hidden", className)}
      style={{
        background: hovering
          ? `radial-gradient(300px circle at ${pos.x}px ${pos.y}px, ${glowColor}, transparent 70%)`
          : "transparent",
        borderColor: hovering ? borderColor : "oklch(1 0 0 / 8%)",
      }}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
};
