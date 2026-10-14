// The real sky over your city, from Open-Meteo (free, keyless — nothing to set
// up on Vercel). Cached for 15 minutes per place by Next's data cache, so the
// whole app makes at most a few calls an hour per location.

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { DEFAULT_PLACE, UNKNOWN_SKY, cleanPlace, parseOpenMeteo, type SkyNow } from "@/lib/weather";

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";

export async function placeFor(userId: number) {
  const [s] = await db.select({ lat: userSettings.weatherLat, lon: userSettings.weatherLon, name: userSettings.weatherPlace })
    .from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return s?.lat != null && s?.lon != null ? { lat: s.lat, lon: s.lon, name: s.name || "My location" } : { ...DEFAULT_PLACE };
}

export async function skyAt(place: { lat: number; lon: number; name: string }): Promise<SkyNow> {
  const url = `${FORECAST}?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;
  try {
    const res = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return UNKNOWN_SKY(place.name);
    return parseOpenMeteo(await res.json(), place.name) ?? UNKNOWN_SKY(place.name);
  } catch {
    return UNKNOWN_SKY(place.name); // never let weather break the city
  }
}

export async function skyFor(userId: number) {
  return skyAt(await placeFor(userId));
}

/** Town search for the location picker (server-side, so the browser's CSP stays strict). */
export async function searchPlaces(q: string) {
  const name = q.trim().slice(0, 60);
  if (name.length < 2) return [];
  const res = await fetch(`${GEOCODE}?name=${encodeURIComponent(name)}&count=6&format=json`, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error("Place search is unavailable right now.");
  const json = (await res.json()) as { results?: { name: string; latitude: number; longitude: number; country?: string; admin1?: string }[] };
  return (json.results ?? []).map((r) => ({
    name: r.name, lat: r.latitude, lon: r.longitude,
    detail: [r.admin1, r.country].filter(Boolean).join(", "),
  }));
}

/** Save (or clear, with null) where the sky comes from. */
export async function setPlaceFor(userId: number, raw: { lat: unknown; lon: unknown; name: unknown } | null) {
  const p = raw ? cleanPlace(raw) : null;
  if (raw && !p) throw new Error("That location doesn't look right.");
  await db.insert(userSettings).values({ userId }).onConflictDoNothing();
  await db.update(userSettings)
    .set({ weatherLat: p?.lat ?? null, weatherLon: p?.lon ?? null, weatherPlace: p?.name ?? null, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
  return p ?? { ...DEFAULT_PLACE };
}
