"use client";

import { useEffect, useState, useCallback } from "react";
import { Moon, Sun, Sunrise, Clock, MapPin, Bell, BellOff } from "lucide-react";
import {
  fetchPrayerTimes, getUserLocation, getNextPrayer, formatCountdown,
  type PrayerTimes, type NextPrayer, type PrayerName,
} from "@/lib/prayer-times";
import { cn } from "@/lib/utils";

const PRAYER_ICONS: Record<PrayerName, React.ReactNode> = {
  Fajr:    <Moon    className="w-3.5 h-3.5" />,
  Dhuhr:   <Sun     className="w-3.5 h-3.5" />,
  Asr:     <Sun     className="w-3.5 h-3.5" />,
  Maghrib: <Sunrise className="w-3.5 h-3.5" />,
  Isha:    <Moon    className="w-3.5 h-3.5" />,
};

export function PrayerCountdown({ compact = false }: { compact?: boolean }) {
  const [times,    setTimes]    = useState<PrayerTimes | null>(null);
  const [next,     setNext]     = useState<NextPrayer | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);
  const [notifOk,  setNotifOk]  = useState(false);

  const computeNext = useCallback((t: PrayerTimes) => {
    setNext(getNextPrayer(t));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    getUserLocation().then(async (coords) => {
      if (!alive) return;
      if (!coords) { setError(true); setLoading(false); return; }

      try {
        const t = await fetchPrayerTimes(coords.latitude, coords.longitude);
        if (!alive) return;
        setTimes(t);
        computeNext(t);
        setLoading(false);
      } catch {
        if (alive) { setError(true); setLoading(false); }
      }
    });

    return () => { alive = false; };
  }, [computeNext]);

  // Tick every second
  useEffect(() => {
    if (!times) return;
    const iv = setInterval(() => computeNext(times), 1000);
    return () => clearInterval(iv);
  }, [times, computeNext]);

  // Notification permission
  useEffect(() => {
    if (typeof window !== "undefined") {
      setNotifOk(Notification.permission === "granted");
    }
  }, []);

  async function requestNotif() {
    if (typeof window === "undefined") return;
    const result = await Notification.requestPermission();
    setNotifOk(result === "granted");
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
      <Clock className="w-3.5 h-3.5" /> Loading prayer times…
    </div>
  );

  if (error || !next) return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <MapPin className="w-3.5 h-3.5" />
      <span>Enable location for prayer times</span>
    </div>
  );

  const isVeryClose = next.minutesLeft <= 15;
  const color = isVeryClose ? "var(--emerald)" : "var(--gold)";

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 text-xs font-medium", isVeryClose && "animate-pulse")}
        style={{ color }}>
        {PRAYER_ICONS[next.name]}
        <span>{next.name} in {formatCountdown(next.msLeft)}</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--emerald)]/20 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Next Prayer</p>
        <button
          onClick={notifOk ? undefined : requestNotif}
          title={notifOk ? "Notifications enabled" : "Enable prayer notifications"}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {notifOk
            ? <Bell className="w-3.5 h-3.5 text-[var(--emerald)]" />
            : <BellOff className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Main countdown */}
      <div className="flex items-end gap-3">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5" style={{ color }}>
            {PRAYER_ICONS[next.name]}
            <span className="text-sm font-semibold">{next.name}</span>
          </div>
          <p className={cn("text-2xl font-bold tabular-nums", isVeryClose && "animate-pulse")}
            style={{ color, fontFamily: "var(--font-heading)" }}>
            {formatCountdown(next.msLeft)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground pb-1">{next.time}</p>
      </div>

      {/* All prayer times */}
      {times && (
        <div className="grid grid-cols-5 gap-1 pt-1 border-t border-border">
          {(["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] as PrayerName[]).map(name => {
            const isNext = name === next.name;
            return (
              <div key={name} className={cn("text-center rounded-lg py-1.5 transition-colors",
                isNext ? "bg-[var(--emerald)]/15" : "")}>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{name.slice(0, 3)}</p>
                <p className={cn("text-[11px] font-semibold mt-0.5 tabular-nums",
                  isNext ? "text-[var(--emerald)]" : "text-foreground/70"
                )}>
                  {times[name]}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
