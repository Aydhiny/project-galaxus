import { GAP_META, type Gap, type LeadStatus } from "@/lib/outreach";

export const STATUS_STYLE: Record<LeadStatus, string> = {
  new: "bg-muted text-muted-foreground",
  audited: "bg-muted text-muted-foreground",
  ready: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  queued: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  sent: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  replied: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  meeting: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  client: "bg-emerald-600 text-white",
  skipped: "bg-muted text-muted-foreground/70",
  not_interested: "bg-muted text-muted-foreground",
  do_not_contact: "bg-destructive/10 text-destructive",
};

export function GapChips({ gaps }: { gaps: string[] }) {
  if (gaps.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {gaps.map((g) => (
        <span key={g} className="rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 text-[11px] font-medium">
          {GAP_META[g as Gap]?.label ?? g}
        </span>
      ))}
    </div>
  );
}
