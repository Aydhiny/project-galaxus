import React from "react";
import { cn } from "@/lib/utils";

// Uses a CSS class (not inline style) to avoid React SSR hex→rgb hydration mismatch.
// The .heading-gradient class is defined in globals.css.

interface GradientTextProps {
  children: React.ReactNode;
  className?: string;
  from?: string;  // kept for API compat — ignored, color comes from CSS class
  via?: string;   // kept for API compat — ignored
  to?: string;    // kept for API compat — ignored
  as?: keyof React.JSX.IntrinsicElements;
  style?: React.CSSProperties;
}

export function GradientText({
  children, className, as: Tag = "span", style,
}: GradientTextProps) {
  return (
    <Tag className={cn("heading-gradient", className)} style={style}>
      {children}
    </Tag>
  );
}

export function PageTitle({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <h1 className={cn("heading-gradient text-2xl font-bold tracking-tight", className)} style={style}>
      {children}
    </h1>
  );
}

// SectionLabel: uses .section-label CSS class to avoid SSR dark-mode mismatch
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("section-label", className)}>
      {children}
    </p>
  );
}
