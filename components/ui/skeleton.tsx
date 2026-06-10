import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-muted/50", className)} />
  );
}

/** Card-shaped skeleton — matches the rounded-2xl border bg-card pattern used throughout the app */
export function CardSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 space-y-3", className)}>
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === rows - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/** Row skeleton — for lists */
export function RowSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
          <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stats grid skeleton */
export function StatsSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-${cols} gap-3`}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <Skeleton className="w-6 h-6 rounded-lg" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-2.5 w-12" />
        </div>
      ))}
    </div>
  );
}
