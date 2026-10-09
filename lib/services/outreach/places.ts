// Google Places API (New) — Text Search. The official, ToS-compliant way to
// get business names, phones and websites (scraping Google Maps is not).
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
//
// Cost note: asking for phone/website puts the call in a higher SKU; each
// call returns up to 20 places. 15 leads/day ≈ 20–40 calls a month.

export type Place = {
  placeId: string;
  name: string;
  address: string | null;
  internationalPhone: string | null;
  nationalPhone: string | null;
  website: string | null;
  mapsUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
};

const FIELDS = [
  "places.id", "places.displayName", "places.formattedAddress",
  "places.internationalPhoneNumber", "places.nationalPhoneNumber", "places.websiteUri",
  "places.googleMapsUri", "places.rating", "places.userRatingCount", "places.businessStatus",
  "nextPageToken",
].join(",");

type RawPlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
};

export async function searchPlaces(apiKey: string, textQuery: string, pageToken?: string | null) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELDS },
    body: JSON.stringify({ textQuery, languageCode: "bs", regionCode: "BA", pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { places?: RawPlace[]; nextPageToken?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(`Google Places: ${json.error?.message ?? `HTTP ${res.status}`}`);

  const places: Place[] = (json.places ?? [])
    // Closed businesses aren't leads.
    .filter((p) => !p.businessStatus || p.businessStatus === "OPERATIONAL")
    .map((p) => ({
      placeId: p.id,
      name: p.displayName?.text ?? "Unknown",
      address: p.formattedAddress ?? null,
      internationalPhone: p.internationalPhoneNumber ?? null,
      nationalPhone: p.nationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      mapsUrl: p.googleMapsUri ?? null,
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? null,
    }));
  return { places, nextPageToken: json.nextPageToken ?? null };
}
