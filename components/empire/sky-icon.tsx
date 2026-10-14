// One icon per real-weather kind (lib/weather.ts), shared by the city HUD and the simple view.
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
