// Foursquare Places API — optional second lead source (free tier, needs a key
// from foursquare.com/developers). Strong in the Balkans thanks to years of
// Swarm check-ins, and it often has the phone number OpenStreetMap lacks.
// Docs: https://docs.foursquare.com/fsq-developers-places/reference/place-search

import { normalizePhone } from "@/lib/outreach";
import type { Place } from "./places";

type FsqPlace = {
  fsq_place_id?: string;
  name?: string;
  tel?: string;
  website?: string;
  location?: { formatted_address?: string; address?: string; locality?: string };
};

async function call(key: string, params: Record<string, string>) {
  const res = await fetch(`https://places-api.foursquare.com/places/search?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${key}`, "X-Places-Api-Version": "2025-06-17", Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  return res;
}

export async function searchFoursquare(key: string, query: string, city: string): Promise<Place[]> {
  const base = { query, near: `${city}, Bosnia and Herzegovina`, limit: "50" };
  // Phone and website can be "premium" fields; if the plan refuses them, fall back to the free ones.
  let res = await call(key, { ...base, fields: "fsq_place_id,name,location,tel,website" });
  if (res.status === 402 || res.status === 403) res = await call(key, { ...base, fields: "fsq_place_id,name,location" });
  if (res.status === 401) throw new Error("Foursquare rejected the key — check it in Outreach → Setup.");
  if (!res.ok) throw new Error(`Foursquare search failed (${res.status}).`);
  const { results = [] } = (await res.json()) as { results?: FsqPlace[] };
  return results
    .filter((r) => r.fsq_place_id && r.name)
    .map((r) => ({
      placeId: `fsq:${r.fsq_place_id}`,
      name: r.name!,
      address: r.location?.formatted_address ?? ([r.location?.address, r.location?.locality].filter(Boolean).join(", ") || null),
      internationalPhone: r.tel ? (r.tel.trim().startsWith("+") ? normalizePhone(r.tel, null) : normalizePhone(null, r.tel)) : null,
      nationalPhone: null,
      website: r.website ?? null,
      mapsUrl: `https://www.google.com/maps/search/${encodeURIComponent(`${r.name} ${city}`)}`,
      rating: null,
      reviewCount: null,
    }));
}
