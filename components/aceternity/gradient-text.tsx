import React from "react";
import { cn } from "@/lib/utils";

// Two-color gradients only. No rainbow. Professional.
// Dark mode defaults: blue-400 → indigo-400
// Light mode: slightly darker to stay readable on white

interface GradientTextProps {
  children: React.ReactNode;
  className?: string;
  from?: string;
  via?: string;  // kept for backward compat — ignored, gradient uses from→to only
  to?: string;
  as?: keyof React.JSX.IntrinsicElements;
  style?: React.CSSProperties;
}

export function GradientText({
  children, className, as: Tag = "span",
  from = "#60a5fa",  // blue-400
  to   = "#818cf8",  // indigo-400 — just 2 stops, clean
}: GradientTextProps) {
  return (
    <Tag
      className={cn("bg-clip-text text-transparent", className)}
      style={{ backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
    >
      {children}
    </Tag>
  );
}

export function PageTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <GradientText
      as="h1"
      from="#60a5fa"
      to="#818cf8"
      className={cn("text-2xl font-bold tracking-tight", className)}
    >
      {children}
    </GradientText>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn(
      "text-[10px] font-semibold uppercase tracking-[0.18em]",
      "text-black/35 dark:text-white/35",
      className
    )}>
      {children}
    </p>
  );
}
