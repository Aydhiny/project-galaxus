"use client";

// Next prayer for the HUD and today's times for the Daily brief. Uses your
// location only if you've already allowed it (never prompts from here);
// otherwise Sarajevo — close enough for most of BiH.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRAYER_NAMES, fetchPrayerTimes, formatCountdown, getNextPrayer, type PrayerTimes } from "@/lib/prayer-times";

const SARAJEVO = { lat: 43.8563, lon: 18.4131 };
const BS: Record<string, string> = { Fajr: "Sabah", Dhuhr: "Podne", Asr: "Ikindija", Maghrib: "Akšam", Isha: "Jacija" };

async function location(): Promise<{ lat: number; lon: number }> {
  try {
    const p = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (p?.state !== "granted") return SARAJEVO;
    return await new Promise((resolve) => navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }), () => resolve(SARAJEVO), { timeout: 5000, maximumAge: 3_600_000 },
    ));
  } catch {
    return SARAJEVO;
  }
}

export function usePrayerTimes() {
  const [times, setTimes] = useState<PrayerTimes | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    location().then(({ lat, lon }) => fetchPrayerTimes(lat, lon)).then((t) => { if (alive) setTimes(t); }).catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return { times, next: times ? getNextPrayer(times) : null, now };
}

/** HUD chip: "Akšam 1h 12m". */
export function PrayerChip() {
  const { next } = usePrayerTimes();
  if (!next) return null;
  const soon = next.minutesLeft <= 15;
  return (
    <Link href="/spiritual" title={`Next prayer: ${BS[next.name] ?? next.name} at ${next.time}`}
      className="inline-flex items-center gap-1.5 h-8 px-1.5 rounded-lg hover:bg-accent/60 transition-colors">
      <span className={cn("w-5 h-5 rounded-full flex items-center justify-center bg-teal-500/15 text-teal-500", soon && "animate-pulse")}><Moon className="w-3 h-3" /></span>
      <span className="font-hud uppercase tracking-wide text-[15px] leading-none">{BS[next.name] ?? next.name}</span>
      <span className="text-[11px] text-muted-foreground tabular-nums">{formatCountdown(next.msLeft)}</span>
    </Link>
  );
}

/** Today's five prayers as a strip (Daily brief, Islam section). */
export function PrayerStrip({ className }: { className?: string }) {
  const { times, next } = usePrayerTimes();
  if (!times) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {PRAYER_NAMES.map((p) => (
        <span key={p} className={cn("inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs",
          next?.name === p ? "border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-300 font-medium" : "border-border text-muted-foreground")}>
          {BS[p]} <span className="tabular-nums">{times[p]}</span>
        </span>
      ))}
    </div>
  );
}
