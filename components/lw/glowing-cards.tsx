"use client";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface GlowingCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  style?: React.CSSProperties;
}
interface GlowingCardsProps {
  children: React.ReactNode;
  className?: string;
  enableGlow?: boolean;
  glowRadius?: number;
  glowOpacity?: number;
  gap?: string;
  padding?: string;
}

export const GlowingCard: React.FC<GlowingCardProps> = ({ children, className, glowColor = "#173eff", style, ...props }) => (
  <div
    className={cn("relative flex-1 min-w-[12rem] p-5 rounded-2xl text-foreground bg-card border border-border transition-all duration-300", className)}
    style={{ "--glow-color": glowColor, ...style } as React.CSSProperties}
    {...props}
  >{children}</div>
);

export const GlowingCards: React.FC<GlowingCardsProps> = ({
  children, className, enableGlow = true, glowRadius = 25, glowOpacity = 1, gap = "1rem", padding = "0",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    const ov = overlayRef.current;
    if (!el || !ov || !enableGlow) return;
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      ov.style.setProperty("--x", x + "px");
      ov.style.setProperty("--y", y + "px");
      ov.style.setProperty("--op", String(glowOpacity));
      setShow(true);
    };
    const leave = () => { ov.style.setProperty("--op", "0"); setShow(false); };
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);
    return () => { el.removeEventListener("mousemove", move); el.removeEventListener("mouseleave", leave); };
  }, [enableGlow, glowOpacity]);

  return (
    <div className={cn("relative w-full", className)}>
      <div ref={containerRef} className="relative" style={{ padding }}>
        <div className="flex flex-wrap items-stretch" style={{ gap }}>{children}</div>
        {enableGlow && (
          <div
            ref={overlayRef}
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none select-none transition-opacity duration-300"
            style={{
              WebkitMask: `radial-gradient(${glowRadius}rem ${glowRadius}rem at var(--x,0) var(--y,0), #000 1%, transparent 50%)`,
              mask: `radial-gradient(${glowRadius}rem ${glowRadius}rem at var(--x,0) var(--y,0), #000 1%, transparent 50%)`,
              opacity: show ? "var(--op,0)" : 0,
            }}
          >
            <div className="flex flex-wrap items-stretch" style={{ gap, padding }}>
              {React.Children.map(children, (child) => {
                if (React.isValidElement(child) && (child.type as React.FC) === GlowingCard) {
                  const p = child.props as GlowingCardProps;
                  const c = p.glowColor || "#173eff";
                  return React.cloneElement(child as React.ReactElement<GlowingCardProps>, {
                    style: { ...p.style, backgroundColor: c + "18", borderColor: c, boxShadow: "0 0 0 1px inset " + c },
                  });
                }
                return child;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
