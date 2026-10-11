"use client";

// GTA-style HUD for the top bar: level + XP bars on the left, today's stats as
// icon chips, and your money stacked on the right — all real numbers.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Coins, Flame, ListChecks, MailWarning, Radar, Vault } from "lucide-react";
import { cn } from "@/lib/utils";
import { getHudC, type Hud } from "@/lib/client/hud";
import { PrayerChip } from "@/components/prayer-chip";

/** Numbers roll up to their new value, like a game counter. */
function useCountUp(value: number, ms = 700) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const hudText = "font-hud uppercase tracking-wide [text-shadow:0_1px_0_rgb(0_0_0/0.25)]";

export function HudLevel({ hud }: { hud: Hud }) {
  return (
    <Link href="/level" className="group flex items-center gap-2.5" title={`${hud.xp} XP · ${hud.into}/${hud.need} to level ${hud.level + 1}`}>
      <span className={cn("relative h-7 px-2.5 inline-flex items-center bg-foreground text-background -skew-x-12 rounded-[3px]", hudText)}>
        <span className="skew-x-12 text-[15px] leading-none">LV {hud.level}</span>
      </span>
      <span className="flex flex-col gap-1 w-28">
        <span className={cn("text-[11px] leading-none text-muted-foreground", hudText)}>{hud.rank}</span>
        {/* XP (teal) and today's tasks (lavender) — like health and armour */}
        <span className="h-1.5 w-full bg-muted overflow-hidden -skew-x-12">
          <span className="block h-full bg-teal-400 transition-[width] duration-700" style={{ width: `${hud.progress}%` }} />
        </span>
        <span className="h-1 w-3/4 bg-muted overflow-hidden -skew-x-12">
          <span className="block h-full bg-violet-300 transition-[width] duration-700" style={{ width: `${hud.tasksToday ? Math.round((hud.tasksDone / hud.tasksToday) * 100) : 0}%` }} />
        </span>
      </span>
    </Link>
  );
}

function Chip({ href, icon: Icon, value, label, tone, pulse }: { href: string; icon: typeof Flame; value: string; label: string; tone: string; pulse?: boolean }) {
  return (
    <Link href={href} title={label} className="inline-flex items-center gap-1.5 h-8 px-1.5 rounded-lg hover:bg-accent/60 transition-colors">
      <span className={cn("w-5 h-5 rounded-full flex items-center justify-center", tone, pulse && "animate-pulse")}><Icon className="w-3 h-3" /></span>
      <span className={cn("text-[15px] leading-none tabular-nums", hudText)}>{value}</span>
    </Link>
  );
}

export function HudStats({ hud }: { hud: Hud }) {
  return (
    <div className="flex items-center">
      <PrayerChip />
      <Chip href="/tasks" icon={Flame} value={String(hud.streak)} label={`${hud.streak}-day streak`} tone="bg-orange-500/15 text-orange-500" />
      <Chip href="/tasks" icon={ListChecks} value={`${hud.tasksDone}/${hud.tasksToday}`} label="Tasks done today" tone="bg-violet-500/15 text-violet-500" />
      <Chip href="/gigs" icon={Radar} value={hud.hotGigs > 0 ? `${hud.newGigs}·${hud.hotGigs}🔥` : String(hud.newGigs)} label={`${hud.newGigs} new gigs, ${hud.hotGigs} hot`} tone="bg-emerald-500/15 text-emerald-500" />
      {hud.replies > 0 && <Chip href="/gigs" icon={MailWarning} value={String(hud.replies)} label="Client replies waiting for you" tone="bg-rose-500/15 text-rose-500" pulse />}
    </div>
  );
}

export function HudMoney({ hud }: { hud: Hud }) {
  const month = useCountUp(hud.monthKm);
  const total = useCountUp(hud.totalKm);
  return (
    <Link href="/money" className="flex flex-col items-end gap-0.5 px-1" title={hud.goalKm ? `${hud.monthKm} / ${hud.goalKm} KM this month` : "Earned this month · all time"}>
      <span className={cn("inline-flex items-center gap-1.5 text-[17px] leading-none", hudText)}>
        {fmt(month)} KM
        <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center"><Coins className="w-2.5 h-2.5" /></span>
      </span>
      <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] leading-none text-muted-foreground", hudText)}>
        {fmt(total)} KM
        <span className="w-4 h-4 rounded-full bg-violet-500/20 text-violet-500 flex items-center justify-center"><Vault className="w-2.5 h-2.5" /></span>
      </span>
    </Link>
  );
}

/** Loads the HUD and refreshes it every 2 minutes (and when you come back to the tab). */
export function useHud() {
  const [hud, setHud] = useState<Hud | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => getHudC().then((h) => { if (alive) setHud(h); }).catch(() => {});
    load();
    const t = setInterval(load, 120_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, []);
  return hud;
}
