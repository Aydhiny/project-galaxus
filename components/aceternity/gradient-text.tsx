import React from "react";
import { cn } from "@/lib/utils";

interface GradientTextProps {
  children: React.ReactNode;
  className?: string;
  from?: string;
  via?: string;
  to?: string;
  as?: keyof React.JSX.IntrinsicElements;
  style?: React.CSSProperties;
}

export function GradientText({
  children, className, as: Tag = "span",
  from = "#60a5fa", via = "#818cf8", to = "#a78bfa",
}: GradientTextProps) {
  return (
    <Tag
      className={cn("bg-clip-text text-transparent", className)}
      style={{ backgroundImage: `linear-gradient(135deg, ${from} 0%, ${via} 50%, ${to} 100%)` }}
    >
      {children}
    </Tag>
  );
}

export function PageTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <GradientText
      as="h1"
      from="#60a5fa" via="#818cf8" to="#a78bfa"
      className={cn("text-2xl font-bold tracking-tight", className)}
    >
      {children}
    </GradientText>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/35", className)}>
      {children}
    </p>
  );
}
