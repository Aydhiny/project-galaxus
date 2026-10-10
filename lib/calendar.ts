// Calendar feeds (iCal / .ics) → upcoming meetings. Pure; tested in
// calendar.test.ts. Works with Google Calendar's "Secret address in iCal
// format", Outlook's published ICS links, Apple iCloud public calendars…
//
// Recurring meetings are the hard part: RRULE expansion, EXDATE (skipped
// occurrences), RECURRENCE-ID overrides (one occurrence moved) and VTIMEZONE
// definitions. ical.js (Mozilla's parser) handles all four.

import ICAL from "ical.js";

export type Meeting = {
  id: string; // uid + start, unique per occurrence
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  location: string | null;
  joinUrl: string | null; // Meet / Zoom / Teams link if present
  calendar?: string;
};

const JOIN_RE = /https:\/\/(?:meet\.google\.com\/[a-z-]+|[\w.-]*zoom\.us\/j\/[^\s"<>]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+|teams\.live\.com\/meet\/[^\s"<>]+)/i;

function joinUrlOf(v: ICAL.Component, ev: ICAL.Event): string | null {
  const conf = v.getFirstPropertyValue("x-google-conference");
  if (typeof conf === "string" && conf.startsWith("https://")) return conf;
  for (const text of [ev.location, ev.description, String(v.getFirstPropertyValue("url") ?? "")]) {
    const m = text?.match(JOIN_RE);
    if (m) return m[0];
  }
  return null;
}

/** Every meeting occurrence that overlaps [from, to). */
export function meetingsFromIcs(ics: string, from: Date, to: Date, calendar?: string): Meeting[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(tz);
  }

  // Group by UID: the base event plus its moved/edited occurrences.
  const byUid = new Map<string, { base?: ICAL.Event; exceptions: ICAL.Event[] }>();
  for (const v of root.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(v);
    const g = byUid.get(ev.uid) ?? { exceptions: [] };
    if (ev.isRecurrenceException()) g.exceptions.push(ev);
    else g.base = ev;
    byUid.set(ev.uid, g);
  }

  const out: Meeting[] = [];
  const push = (ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if (String(ev.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") return;
    const s = start.toJSDate();
    const e = end.toJSDate();
    if (e <= from || s >= to) return;
    out.push({
      id: `${ev.uid}:${s.toISOString()}`,
      title: ev.summary?.trim() || "(No title)",
      start: s.toISOString(),
      end: e.toISOString(),
      allDay: start.isDate,
      location: ev.location?.trim() || null,
      joinUrl: joinUrlOf(ev.component, ev),
      calendar,
    });
  };

  for (const { base, exceptions } of byUid.values()) {
    if (!base) {
      for (const ex of exceptions) push(ex, ex.startDate, ex.endDate); // orphan override
      continue;
    }
    for (const ex of exceptions) base.relateException(ex);
    if (!base.isRecurring()) {
      push(base, base.startDate, base.endDate);
      continue;
    }
    const it = base.iterator();
    for (let next = it.next(), guard = 0; next && guard < 2000; next = it.next(), guard++) {
      if (next.toJSDate() >= to) break;
      const occ = base.getOccurrenceDetails(next);
      push(occ.item, occ.startDate, occ.endDate);
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Only https feeds, never local/private hosts (the server fetches them). */
export function isValidFeedUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    return !(h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(\d+\.){3}\d+$/.test(h) || h.includes(":"));
  } catch {
    return false;
  }
}

export const normalizeFeedUrl = (raw: string) => raw.trim().replace(/^webcal:\/\//i, "https://");

/** "in 25 min", "in 3 h", "now" — for the top bar. */
export function relativeStart(m: Pick<Meeting, "start" | "end">, now: Date): string {
  const s = new Date(m.start).getTime();
  const e = new Date(m.end).getTime();
  const t = now.getTime();
  if (t >= s && t < e) return "now";
  const mins = Math.round((s - t) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `in ${mins} min`;
  if (mins < 60 * 12) return `in ${Math.round(mins / 60)} h`;
  return "";
}
