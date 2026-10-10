// Connected calendars (private iCal links) → upcoming meetings.
//
// Why iCal links instead of Google sign-in: read-only, no Google Cloud app,
// no 7-day token expiry in Google's "testing" mode, and no server env vars.
// The link IS a secret (anyone with it can read the calendar), so it's
// stored encrypted in user_secrets and never sent back to the browser.

import { getSecret, setSecret } from "@/lib/services/secrets";
import { isValidFeedUrl, meetingsFromIcs, normalizeFeedUrl, type Meeting } from "@/lib/calendar";

type Feed = { label: string; url: string };
const MAX_FEEDS = 5;
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<number, { at: number; meetings: Meeting[] }>();

async function feedsFor(userId: number): Promise<Feed[]> {
  const raw = await getSecret(userId, "calendar");
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as Feed[]).filter((f) => f && isValidFeedUrl(f.url));
  } catch {
    return [];
  }
}

async function fetchIcs(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Galaxus/1.0 (calendar sync)", Accept: "text/calendar" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(res.status === 404 ? "Calendar link not found — it may have been reset." : `Calendar returned HTTP ${res.status}.`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That link isn't an iCal calendar (.ics).");
  return text.slice(0, 5_000_000);
}

/** What the browser may see: labels and counts, never the secret links. */
export async function calendarStatusFor(userId: number) {
  const feeds = await feedsFor(userId);
  return { feeds: feeds.map((f, i) => ({ index: i, label: f.label, host: new URL(f.url).hostname })) };
}

export async function addCalendarFor(userId: number, input: { url: string; label?: string }) {
  const url = normalizeFeedUrl(String(input.url ?? ""));
  if (!isValidFeedUrl(url)) throw new Error("Paste the calendar's https iCal link (it ends in .ics).");
  const feeds = await feedsFor(userId);
  if (feeds.length >= MAX_FEEDS) throw new Error(`Up to ${MAX_FEEDS} calendars.`);
  if (feeds.some((f) => f.url === url)) throw new Error("That calendar is already connected.");
  // Prove it works before saving.
  meetingsFromIcs(await fetchIcs(url), new Date(), new Date(Date.now() + 86_400_000));
  const label = String(input.label ?? "").trim().slice(0, 40) || (url.includes("google.com") ? "Google Calendar" : "Calendar");
  await setSecret(userId, "calendar", JSON.stringify([...feeds, { label, url }]));
  cache.delete(userId);
}

export async function removeCalendarFor(userId: number, index: number) {
  const feeds = await feedsFor(userId);
  const next = feeds.filter((_, i) => i !== index);
  await setSecret(userId, "calendar", next.length ? JSON.stringify(next) : null);
  cache.delete(userId);
}

/**
 * Timed meetings from now to +7 days (all-day events are left out — they're
 * not meetings). Cached 5 minutes per user; a broken feed doesn't hide the
 * others.
 */
export async function upcomingMeetingsFor(userId: number, opts: { fresh?: boolean } = {}) {
  const hit = cache.get(userId);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_MS) return { connected: true, meetings: hit.meetings, errors: [] as string[] };
  const feeds = await feedsFor(userId);
  if (feeds.length === 0) return { connected: false, meetings: [] as Meeting[], errors: [] as string[] };

  const from = new Date(Date.now() - 60 * 60 * 1000); // keep a meeting that's running now
  const to = new Date(Date.now() + 7 * 86_400_000);
  const errors: string[] = [];
  const lists = await Promise.all(
    feeds.map(async (f) => {
      try {
        return meetingsFromIcs(await fetchIcs(f.url), from, to, f.label);
      } catch (e) {
        errors.push(`${f.label}: ${e instanceof Error ? e.message : "couldn't load"}`);
        return [];
      }
    })
  );
  const now = Date.now();
  const meetings = lists
    .flat()
    .filter((m) => !m.allDay && new Date(m.end).getTime() > now)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 50);
  cache.set(userId, { at: now, meetings });
  return { connected: true, meetings, errors };
}
