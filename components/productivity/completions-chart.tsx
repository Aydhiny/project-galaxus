"use client";

import { useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { DayCount } from "@/lib/productivity";

/**
 * Single-series bar chart in plain HTML (no chart library): one hue, thin
 * bars with rounded data-ends anchored to the baseline, recessive gridlines,
 * a per-bar hover/focus tooltip, and a visually-hidden table for screen readers.
 */
export function CompletionsChart({ series, today }: { series: DayCount[]; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(4, ...series.map((d) => d.count));
  // Nice round top for the axis: 4, 6, 8, 10, 15, 20…
  const top = max <= 10 ? Math.ceil(max / 2) * 2 : Math.ceil(max / 5) * 5;
  const ticks = [top, top / 2, 0];
  // Label every day for short ranges, otherwise every ~5th day + today.
  const labelEvery = series.length <= 14 ? 1 : 5;
  const total = series.reduce((s, d) => s + d.count, 0);

  return (
    <div className="flex-1 flex flex-col min-h-52">
      <div className="relative flex-1 flex">
        {/* Y axis labels */}
        <div className="flex flex-col justify-between text-[10px] text-muted-foreground tabular-nums pr-2 -my-1.5 select-none" aria-hidden>
          {ticks.map((t) => <span key={t}>{t}</span>)}
        </div>

        <div className="relative flex-1">
          {/* Recessive gridlines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" aria-hidden>
            {ticks.map((t) => <div key={t} className={cn("border-t", t === 0 ? "border-border" : "border-border/50 border-dashed")} />)}
          </div>

          {/* Bars — each column is a full-height hit target, bigger than the mark */}
          <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
            {series.map((d, i) => {
              const h = (d.count / top) * 100;
              const isToday = d.date === today;
              return (
                <button
                  key={d.date}
                  type="button"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${format(new Date(d.date + "T12:00:00"), "EEEE, MMM d")}: ${d.count} completed`}
                  className="relative flex-1 h-full flex items-end justify-center outline-none group"
                >
                  <span
                    className={cn(
                      "w-full max-w-7 rounded-t-[4px] transition-[height,opacity] duration-300",
                      d.count === 0 ? "bg-transparent" : "bg-primary",
                      hover !== null && hover !== i && "opacity-45",
                      "group-focus-visible:ring-2 group-focus-visible:ring-ring"
                    )}
                    style={{ height: d.count === 0 ? 0 : `max(${h}%, 4px)` }}
                  />
                  {isToday && <span className="absolute -bottom-[3px] w-1 h-1 rounded-full bg-foreground/60" aria-hidden />}
                </button>
              );
            })}
          </div>

          {/* Tooltip */}
          {hover !== null && (
            <div
              className="absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md pointer-events-none whitespace-nowrap"
              style={{
                left: `${((hover + 0.5) / series.length) * 100}%`,
                top: `${100 - (series[hover].count / top) * 100}%`,
                marginTop: -6,
              }}
            >
              <p className="text-muted-foreground">{format(new Date(series[hover].date + "T12:00:00"), "EEE, MMM d")}</p>
              <p className="font-medium tabular-nums">{series[hover].count} completed</p>
            </div>
          )}
        </div>
      </div>

      {/* X axis labels */}
      <div className="flex gap-[2px] pl-6 mt-2 text-[10px] text-muted-foreground select-none" aria-hidden>
        {series.map((d, i) => (
          <span key={d.date} className={cn("flex-1 flex justify-center whitespace-nowrap overflow-visible", d.date === today && "text-foreground font-medium")}>
            {d.date === today ? "Today" : i % labelEvery === (series.length - 1) % labelEvery ? d.label : ""}
          </span>
        ))}
      </div>

      {total === 0 && (
        <p className="text-xs text-muted-foreground text-center mt-3">Complete a task and it shows up here.</p>
      )}

      {/* Table view for assistive tech */}
      <table className="sr-only">
        <caption>Tasks completed per day</caption>
        <thead><tr><th>Date</th><th>Completed</th></tr></thead>
        <tbody>
          {series.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.count}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
