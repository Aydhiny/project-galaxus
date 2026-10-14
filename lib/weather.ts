// Real weather for the city's sky. Pure rules (tested in weather.test.ts); the
// fetch lives in lib/services/weather.ts.
//
// Source: Open-Meteo (https://open-meteo.com) — free, no API key, built on the
// national weather services' models (ECMWF, DWD ICON…). It returns WMO weather
// codes, mapped below to what the city can draw.

export type Weather = "sun" | "partly" | "clouds" | "fog" | "rain" | "snow" | "storm";

export type SkyNow = {
  kind: Weather;
  intensity: number; // 0–1: drizzle vs downpour, flurries vs blizzard
  tempC: number | null;
  label: string; // "Light rain"
  place: string; // "Sarajevo"
  isDay: boolean | null;
  live: boolean; // false = we couldn't reach the weather service and are guessing
};

/** Sarajevo, used until you pick a place in the city's Customize panel. */
export const DEFAULT_PLACE = { lat: 43.8563, lon: 18.4131, name: "Sarajevo" } as const;

/** WMO code → what the sky does. https://open-meteo.com/en/docs#weathervariables */
export function skyFromCode(code: number): { kind: Weather; intensity: number; label: string } {
  if (code === 0) return { kind: "sun", intensity: 0, label: "Clear" };
  if (code === 1) return { kind: "sun", intensity: 0, label: "Mostly clear" };
  if (code === 2) return { kind: "partly", intensity: 0, label: "Partly cloudy" };
  if (code === 3) return { kind: "clouds", intensity: 0, label: "Overcast" };
  if (code === 45 || code === 48) return { kind: "fog", intensity: 0.6, label: code === 48 ? "Freezing fog" : "Fog" };
  if (code >= 51 && code <= 57) return { kind: "rain", intensity: code >= 55 ? 0.45 : 0.25, label: code >= 56 ? "Freezing drizzle" : "Drizzle" };
  if (code >= 61 && code <= 67) {
    const i = code === 61 || code === 66 ? 0.45 : code === 63 ? 0.7 : 1;
    return { kind: "rain", intensity: i, label: code >= 66 ? "Freezing rain" : i < 0.5 ? "Light rain" : i < 1 ? "Rain" : "Heavy rain" };
  }
  if (code >= 71 && code <= 77) return { kind: "snow", intensity: code === 71 || code === 77 ? 0.4 : code === 73 ? 0.7 : 1, label: code === 77 ? "Snow grains" : code === 75 ? "Heavy snow" : "Snow" };
  if (code >= 80 && code <= 82) return { kind: "rain", intensity: code === 80 ? 0.45 : code === 81 ? 0.7 : 1, label: "Showers" };
  if (code === 85 || code === 86) return { kind: "snow", intensity: code === 85 ? 0.5 : 1, label: "Snow showers" };
  if (code >= 95) return { kind: "storm", intensity: 1, label: code === 95 ? "Thunderstorm" : "Thunderstorm with hail" };
  return { kind: "clouds", intensity: 0, label: "Cloudy" };
}

/** Open-Meteo `current` block → SkyNow, or null when the reply isn't what we asked for. */
export function parseOpenMeteo(json: unknown, place: string): SkyNow | null {
  const cur = (json as { current?: Record<string, unknown> } | null)?.current;
  if (!cur || typeof cur.weather_code !== "number") return null;
  const sky = skyFromCode(cur.weather_code);
  const t = typeof cur.temperature_2m === "number" ? Math.round(cur.temperature_2m) : null;
  return { ...sky, tempC: t, place, isDay: typeof cur.is_day === "number" ? cur.is_day === 1 : null, live: true };
}

/** Used when the weather service is down: a calm, honest "we don't know". */
export const UNKNOWN_SKY = (place: string): SkyNow => ({ kind: "partly", intensity: 0, tempC: null, label: "Weather unavailable", place, isDay: null, live: false });

/** Coordinates someone typed or picked → valid, or null. */
export function cleanPlace(raw: { lat?: unknown; lon?: unknown; name?: unknown }) {
  const lat = Number(raw.lat), lon = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const name = String(raw.name ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80) || "My location";
  // ~1 km precision is plenty for weather and keeps the stored location coarse.
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, name };
}
