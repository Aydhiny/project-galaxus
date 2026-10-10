// OpenStreetMap as a free lead source — no key, no billing.
//   Nominatim: city name → bounding box.   Overpass: businesses of a type in it.
// Both are free community services: identify ourselves, keep volume tiny
// (one search ≈ two requests), and credit OSM (ODbL) in the UI.
//
// Trade-off vs Google: far fewer phone numbers in OSM for Bosnia (Sarajevo
// dentists: 25 listed, 5 with a phone in Oct 2026). The audit step fills
// gaps by reading the phone off the business's own website.

import { isMobileBA, normalizePhone, osmType } from "@/lib/outreach";
import type { Place } from "./places";

const UA = "Galaxus/1.0 (personal lead finder; https://project-galaxus.vercel.app)";

async function cityBox(city: string): Promise<[number, number, number, number]> {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: city, countrycodes: "ba", format: "json", limit: "1" })}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  const [hit] = (await res.json().catch(() => [])) as { boundingbox?: string[] }[];
  if (!hit?.boundingbox) throw new Error(`OpenStreetMap couldn't find "${city}".`);
  const [south, north, west, east] = hit.boundingbox.map(Number);
  return [south, west, north, east];
}

type OsmElement = { type: string; id: number; tags?: Record<string, string> };

// The main Overpass server is often overloaded (504 "too busy"); these are
// the public mirrors listed on the OSM wiki, tried in order.
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

async function overpass(query: string): Promise<unknown> {
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith("{")) return JSON.parse(text);
    } catch {
      // timeout / network — try the next mirror
    }
  }
  throw new Error("OpenStreetMap servers are busy right now — try again in a few minutes.");
}

export async function searchOsm(typeKey: string, city: string): Promise<Place[]> {
  const type = osmType(typeKey);
  if (!type) throw new Error(`Unknown OpenStreetMap business type "${typeKey}".`);
  const [s, w, n, e] = await cityBox(city);
  const bbox = `${s},${w},${n},${e}`;
  const parts = type.tags.map((t) => {
    const [k, v] = t.split("=");
    return `nwr["${k}"="${v}"](${bbox});`;
  });
  const query = `[out:json][timeout:40];(${parts.join("")});out tags center;`;
  const { elements = [] } = (await overpass(query)) as { elements?: OsmElement[] };

  const seen = new Set<string>();
  const places: Place[] = [];
  for (const el of elements) {
    const t = el.tags ?? {};
    if (!t.name) continue; // unnamed POIs can't be contacted
    const key = `osm:${el.type}/${el.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Fields can hold several numbers ("+387 33 434925;+387 61904566") — prefer a mobile (WhatsApp).
    const phones = [t["contact:mobile"], t.mobile, t.phone, t["contact:phone"]]
      .filter(Boolean)
      .flatMap((v) => v!.split(/[;,]/))
      .map((v) => (v.trim().startsWith("+") ? normalizePhone(v, null) : normalizePhone(null, v)))
      .filter((v): v is string => !!v);
    const phone = phones.find(isMobileBA) ?? phones[0] ?? null;
    const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
    places.push({
      placeId: key,
      name: t.name,
      address: [street, t["addr:city"] ?? city].filter(Boolean).join(", ") || null,
      internationalPhone: phone,
      nationalPhone: null,
      website: t.website ?? t["contact:website"] ?? null,
      mapsUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      rating: null,
      reviewCount: null,
    });
  }
  return places;
}
