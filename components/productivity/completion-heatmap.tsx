"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DayCount } from "@/lib/productivity";

// Sequential: one hue (the accent), light → dark. 0 is a neutral empty cell.
const LEVELS = [
  "bg-foreground/[0.07]",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
];

function level(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}

export function CompletionHeatmap({ weeks }: { weeks: DayCount[][] }) {
  const [hover, setHover] = useState<DayCount | null>(null);
  const days = ["Mon", "", "Wed", "", "Fri", "", ""];

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="grid grid-rows-7 gap-[3px] text-[10px] text-muted-foreground pr-1 select-none" aria-hidden>
          {days.map((d, i) => <span key={i} className="h-3 leading-3">{d}</span>)}
        </div>
        <div className="flex gap-[3px]" role="grid" aria-label="Tasks completed per day, last 18 weeks" onMouseLeave={() => setHover(null)}>
          {weeks.map((week, w) => (
            <div key={w} className="grid grid-rows-7 gap-[3px]" role="row">
              {week.map((d) => (
                <div
                  key={d.date}
                  role="gridcell"
                  aria-label={d.count < 0 ? undefined : `${d.label}: ${d.count} completed`}
                  onMouseEnter={() => d.count >= 0 && setHover(d)}
                  className={cn("w-3 h-3 rounded-[3px]", d.count < 0 ? "bg-transparent" : LEVELS[level(d.count)])}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground min-h-4">
        <span>{hover ? `${hover.label} · ${hover.count} completed` : "Hover a day for details"}</span>
        <span className="flex items-center gap-1" aria-hidden>
          Less {LEVELS.map((c) => <span key={c} className={cn("w-3 h-3 rounded-[3px]", c)} />)} More
        </span>
      </div>
    </div>
  );
}
