"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { format, isToday, isTomorrow } from "date-fns";
import { CalendarClock, ExternalLink, Mic, RefreshCw, Search, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeStart, type Meeting } from "@/lib/calendar";
import { getUpcomingMeetings } from "@/lib/client/calendar";
import { useCommandStore } from "@/lib/store/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BrandIcon } from "@/components/brand-icon";
import { openVoice } from "@/lib/voice-events";

const TITLES: Record<string, string> = {
  overview: "Today", brief: "Daily brief", voice: "Voice", productivity: "Productivity", tasks: "Tasks", pages: "Pages",
  review: "Weekly Review", daily: "Daily Check-in", goals: "Goals", goal: "Goal", outreach: "Outreach",
  youtube: "YouTube", game: "Game dev", connections: "Connections", settings: "Settings", dashboard: "Feed",
};

type State = { connected: boolean; meetings: Meeting[] } | null;

/** Slim bar above every page: where you are, search, voice, and your next meeting. */
export function TopBar() {
  const pathname = usePathname();
  const title = TITLES[pathname.split("/")[1] ?? ""] ?? "";
  const { openPalette } = useCommandStore();

  return (
    <div className="hidden md:flex items-center gap-2 h-12 px-4 border-b border-border/70 bg-background/80 shrink-0">
      <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
      <div className="flex-1" />
      <button onClick={openPalette} className="inline-flex items-center gap-2 h-8 px-2.5 rounded-lg border border-border/80 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 w-52">
        <Search className="w-3.5 h-3.5" /> Search…
        <kbd className="ml-auto rounded border border-border bg-muted px-1 font-mono text-[10px]">Ctrl K</kbd>
      </button>
      <button onClick={openVoice} title="Talk to Claude (Alt+V)" aria-label="Talk to Claude"
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60">
        <Mic className="w-4 h-4" />
      </button>
      <MeetingsPill />
    </div>
  );
}

/** Next meeting (or "No meetings ahead"), with the week in a dropdown. */
export function MeetingsPill({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<State>(null);
  const [now, setNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => getUpcomingMeetings().then((r) => { if (alive) setState(r); });
    load();
    const poll = setInterval(load, 5 * 60 * 1000);
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => { alive = false; clearInterval(poll); clearInterval(tick); };
  }, []);

  async function refresh() {
    setRefreshing(true);
    setState(await getUpcomingMeetings(true));
    setRefreshing(false);
  }

  if (!state) return <span className="h-8 w-40 rounded-lg bg-muted/50 animate-pulse" aria-hidden />;

  if (!state.connected) {
    return (
      <Link href="/connections" className="inline-flex items-center gap-2 h-8 px-3 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60">
        <BrandIcon name="googlecalendar" className="w-3.5 h-3.5" /> {compact ? "" : "Connect calendar"}
      </Link>
    );
  }

  const upcoming = state.meetings.filter((m) => new Date(m.end) > now);
  const next = upcoming[0];
  const live = next && new Date(next.start) <= now;
  const rel = next ? relativeStart(next, now) : "";
  const soon = next && !live && new Date(next.start).getTime() - now.getTime() < 15 * 60_000;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-2 h-8 px-3 rounded-lg text-xs max-w-[18rem] transition-colors",
          live ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
            : soon ? "bg-amber-500/12 text-amber-800 dark:text-amber-200"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
        )}
        aria-label="Upcoming meetings"
      >
        {live ? <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> : <CalendarClock className="w-3.5 h-3.5 shrink-0" />}
        {!next ? (
          <span>No meetings ahead</span>
        ) : compact ? (
          <span className="tabular-nums">{format(new Date(next.start), "HH:mm")}</span>
        ) : (
          <span className="truncate">
            <span className="font-medium">{live ? "Now" : rel || dayLabel(next.start)}</span>
            <span className="opacity-60"> · </span>
            {next.title}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 gap-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <p className="text-sm font-semibold flex items-center gap-2"><BrandIcon name="googlecalendar" className="w-3.5 h-3.5" /> Next 7 days</p>
          <button onClick={refresh} aria-label="Refresh" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
          </button>
        </div>
        {upcoming.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No meetings ahead. Enjoy the deep work.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto py-1">
            {upcoming.slice(0, 20).map((m, i) => {
              const showDay = i === 0 || dayLabel(m.start) !== dayLabel(upcoming[i - 1].start);
              const isLive = new Date(m.start) <= now;
              return (
                <li key={m.id}>
                  {showDay && <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{dayLabel(m.start)}</p>}
                  <div className="flex items-center gap-3 px-3 py-2 hover:bg-accent/40">
                    <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">{format(new Date(m.start), "HH:mm")}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{isLive && <span className="mr-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 align-middle" />}{m.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {format(new Date(m.start), "HH:mm")}–{format(new Date(m.end), "HH:mm")}{m.calendar ? ` · ${m.calendar}` : ""}
                      </p>
                    </div>
                    {m.joinUrl && (
                      <a href={m.joinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-primary text-primary-foreground text-[11px] font-medium">
                        <Video className="w-3 h-3" /> Join
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/connections" className="flex items-center gap-1.5 px-3 py-2 border-t border-border text-xs text-muted-foreground hover:text-foreground">
          Manage calendars <ExternalLink className="w-3 h-3" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  return isToday(d) ? "Today" : isTomorrow(d) ? "Tomorrow" : format(d, "EEE d MMM");
}
