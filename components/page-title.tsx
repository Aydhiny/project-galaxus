import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one page header every screen uses: a tinted icon tile, a small
 * eyebrow, the title, an optional subtitle, and actions on the right.
 * Keeps old and new pages looking like one product.
 */
export function PageTitle({ icon: Icon, tone, eyebrow, title, subtitle, children, className }: {
  icon: LucideIcon;
  tone: string; // e.g. "bg-amber-500/12 text-amber-600 dark:text-amber-400"
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4 animate-in fade-in-0 slide-in-from-bottom-1", className)}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0", tone)}><Icon className="w-5 h-5" /></span>
        <div className="min-w-0">
          {eyebrow && <p className="section-label">{eyebrow}</p>}
          <h1 className="text-3xl font-bold tracking-tight leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/** A compact stat tile with an icon — used across the refreshed pages. */
export function StatTile({ icon: Icon, tone, value, label, className }: { icon: LucideIcon; tone: string; value: React.ReactNode; label: string; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 flex items-center gap-3 transition-colors hover:border-foreground/15", className)}>
      <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", tone)}><Icon className="w-5 h-5" /></span>
      <div className="min-w-0">
        <p className="font-hud uppercase tracking-wide text-2xl leading-none tabular-nums">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}
