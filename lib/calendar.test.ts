import { describe, expect, it } from "vitest";
import { isValidFeedUrl, meetingsFromIcs, relativeStart } from "./calendar";

// A Google-Calendar-shaped feed: Sarajevo timezone, a one-off meeting with a
// Meet link, a weekly standup with one skipped and one moved occurrence, a
// cancelled event and an all-day event.
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VTIMEZONE
TZID:Europe/Sarajevo
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:client-call@google.com
DTSTART;TZID=Europe/Sarajevo:20261012T140000
DTEND;TZID=Europe/Sarajevo:20261012T143000
SUMMARY:Client call — Dental Smile
X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij
END:VEVENT
BEGIN:VEVENT
UID:standup@google.com
DTSTART;TZID=Europe/Sarajevo:20261005T090000
DTEND;TZID=Europe/Sarajevo:20261005T091500
RRULE:FREQ=WEEKLY;BYDAY=MO,WE
EXDATE;TZID=Europe/Sarajevo:20261014T090000
SUMMARY:Standup
LOCATION:https://zoom.us/j/123456789
END:VEVENT
BEGIN:VEVENT
UID:standup@google.com
RECURRENCE-ID;TZID=Europe/Sarajevo:20261012T090000
DTSTART;TZID=Europe/Sarajevo:20261012T100000
DTEND;TZID=Europe/Sarajevo:20261012T101500
SUMMARY:Standup (moved)
END:VEVENT
BEGIN:VEVENT
UID:gone@google.com
DTSTART;TZID=Europe/Sarajevo:20261013T120000
DTEND;TZID=Europe/Sarajevo:20261013T130000
STATUS:CANCELLED
SUMMARY:Cancelled lunch
END:VEVENT
BEGIN:VEVENT
UID:holiday@google.com
DTSTART;VALUE=DATE:20261013
DTEND;VALUE=DATE:20261014
SUMMARY:Holiday
END:VEVENT
END:VCALENDAR`;

describe("calendar feeds", () => {
  const from = new Date("2026-10-11T22:00:00Z"); // Mon 12 Oct 00:00 in Sarajevo
  const to = new Date("2026-10-18T22:00:00Z");
  const meetings = meetingsFromIcs(ICS, from, to, "Work");

  it("expands recurring meetings with skipped and moved occurrences", () => {
    const standups = meetings.filter((m) => m.title.startsWith("Standup"));
    // Mon 12 moved to 10:00 (CEST = UTC+2 → 08:00Z); Wed 14 skipped; Fri isn't a standup day.
    expect(standups.map((m) => [m.title, m.start])).toEqual([["Standup (moved)", "2026-10-12T08:00:00.000Z"]]);
  });

  it("converts timezones and finds join links", () => {
    const call = meetings.find((m) => m.title.startsWith("Client call"))!;
    expect(call.start).toBe("2026-10-12T12:00:00.000Z");
    expect(call.joinUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(call.calendar).toBe("Work");
  });

  it("drops cancelled events and marks all-day ones", () => {
    expect(meetings.some((m) => m.title === "Cancelled lunch")).toBe(false);
    expect(meetings.find((m) => m.title === "Holiday")?.allDay).toBe(true);
  });

  it("validates feed URLs (https only, no private hosts)", () => {
    expect(isValidFeedUrl("https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics")).toBe(true);
    expect(isValidFeedUrl("webcal://p01-calendars.icloud.com/published/2/abc")).toBe(true);
    expect(isValidFeedUrl("http://calendar.google.com/x.ics")).toBe(false);
    expect(isValidFeedUrl("https://127.0.0.1/x.ics")).toBe(false);
  });

  it("formats how soon a meeting starts", () => {
    const now = new Date("2026-10-12T11:35:00Z");
    expect(relativeStart({ start: "2026-10-12T12:00:00Z", end: "2026-10-12T12:30:00Z" }, now)).toBe("in 25 min");
    expect(relativeStart({ start: "2026-10-12T11:30:00Z", end: "2026-10-12T12:00:00Z" }, now)).toBe("now");
  });
});
