"use client";

// One icon per real-weather kind (lib/weather.ts), shared by the city HUD and the simple view.
import { useState } from "react";
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Snowflake, Sun } from "lucide-react";
import type { SkyNow, Weather } from "@/lib/weather";

const ICON: Record<Weather, typeof Sun> = { sun: Sun, partly: CloudSun, clouds: Cloud, fog: CloudFog, rain: CloudRain, snow: Snowflake, storm: CloudLightning };

export function SkyIcon({ kind, className }: { kind: Weather; className?: string }) {
  const I = ICON[kind] ?? Cloud;
  return <I className={className} />;
}

/** "14° · Clear · Sarajevo" (or just the label when the service is down). */
export function skyText(s: SkyNow, withPlace = true) {
  return [s.tempC != null ? `${s.tempC}°` : null, s.label, withPlace ? s.place : null].filter(Boolean).join(" · ");
}

/** The HUD weather chip: tap for the next 3 days and today's sunrise/sunset. */
export function SkyChip({ sky }: { sky: SkyNow }) {
  const [open, setOpen] = useState(false);
  const day = (d: string, i: number) => (i === 0 ? "Today" : new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" }));
  return (
    <span className="relative ml-1">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        title={sky.live ? `Live weather in ${sky.place} (Open-Meteo)` : "Couldn't reach the weather service"}
        className="inline-flex items-center gap-1 rounded-full bg-white/15 px-1.5 hover:bg-white/25">
        <SkyIcon kind={sky.kind} className="w-3 h-3" />{skyText(sky)}
      </button>
      {open && (
        <span className="absolute left-0 top-5 z-30 w-56 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 p-2.5 text-white text-[11px] shadow-xl">
          {(sky.forecast ?? []).map((f, i) => (
            <span key={f.day} className="flex items-center gap-2 py-0.5">
              <span className="w-10 text-white/60">{day(f.day, i)}</span>
              <SkyIcon kind={f.kind} className="w-3.5 h-3.5" />
              <span className="flex-1 truncate">{f.label}</span>
              <span className="tabular-nums">{f.max ?? "–"}° <span className="text-white/50">{f.min ?? "–"}°</span></span>
            </span>
          ))}
          {sky.sunrise && sky.sunset && <span className="block mt-1.5 pt-1.5 border-t border-white/10 text-white/60">Sunrise {sky.sunrise} · Sunset {sky.sunset}</span>}
          {!sky.forecast?.length && <span className="text-white/60">No forecast right now.</span>}
        </span>
      )}
    </span>
  );
}
