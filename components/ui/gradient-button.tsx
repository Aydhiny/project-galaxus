"use client";
import { cn } from "@/lib/utils";
import React from "react";

interface GradientButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "blue" | "violet" | "emerald" | "gold";
  size?: "sm" | "md" | "lg";
  glow?: boolean;
}

const GRADIENTS = {
  blue:    "linear-gradient(135deg, #173eff 0%, #3758f9 50%, #6366f1 100%)",
  violet:  "linear-gradient(135deg, #7c3aed 0%, #a78bfa 50%, #06b6d4 100%)",
  emerald: "linear-gradient(135deg, #059669 0%, #34d399 50%, #06b6d4 100%)",
  gold:    "linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)",
};
const GLOWS = {
  blue:    "0 4px 24px rgba(23,62,255,0.45), 0 0 0 1px rgba(23,62,255,0.2)",
  violet:  "0 4px 24px rgba(124,58,237,0.45), 0 0 0 1px rgba(167,139,250,0.2)",
  emerald: "0 4px 24px rgba(5,150,105,0.45), 0 0 0 1px rgba(52,211,153,0.2)",
  gold:    "0 4px 24px rgba(217,119,6,0.45), 0 0 0 1px rgba(245,158,11,0.2)",
};
const SIZES = {
  sm: "px-4 py-2 text-xs rounded-lg",
  md: "px-5 py-2.5 text-sm rounded-xl",
  lg: "px-7 py-3 text-base rounded-xl",
};

export function GradientButton({
  children, variant = "blue", size = "md", glow = true, className, style, ...props
}: GradientButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "relative overflow-hidden font-semibold text-white transition-all duration-300 active:scale-95",
        "hover:brightness-110 hover:-translate-y-0.5",
        SIZES[size],
        className
      )}
      style={{
        backgroundImage: GRADIENTS[variant],
        backgroundSize: "200% auto",
        boxShadow: glow ? GLOWS[variant] : undefined,
        ...style,
      }}
      onMouseEnter={e => (e.currentTarget.style.backgroundPosition = "right top")}
      onMouseLeave={e => (e.currentTarget.style.backgroundPosition = "0% 50%")}
    >
      {/* Shine sweep */}
      <span
        className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-white/20"
        style={{ animation: "shine-sweep 2.5s ease infinite" }}
      />
      {children}
    </button>
  );
}
