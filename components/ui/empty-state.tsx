import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Nothing here yet": a soft, gently floating icon, a line of text and an
 * optional action. The float is pure CSS and stops under reduced motion.
 */
export function EmptyState({ icon: Icon, title, children, action, className, compact }: {
  icon: LucideIcon;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** Smaller, for popovers and side panels. */
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center animate-rise", compact ? "gap-1.5 py-6 px-3" : "gap-2 py-10 px-4", className)}>
      <span className={cn(
        "rounded-2xl bg-muted/60 text-muted-foreground/70 flex items-center justify-center animate-float-soft",
        compact ? "w-9 h-9" : "w-12 h-12",
      )}>
        <Icon className={compact ? "w-4 h-4" : "w-5 h-5"} strokeWidth={1.75} />
      </span>
      <p className={cn("font-medium text-foreground/85", compact ? "text-xs" : "text-sm")}>{title}</p>
      {children && <div className={cn("text-muted-foreground max-w-sm", compact ? "text-[11px]" : "text-xs")}>{children}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
