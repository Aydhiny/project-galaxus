// Which building's room sits faded behind which page. Pure, so the layout can
// decide on the server-safe path alone whether a page has a room.

const ROOMS: [prefix: string, building: string][] = [
  ["/gigs", "radar"], ["/deals", "deals"], ["/outreach", "outreach"], ["/money", "vault"], ["/opportunities", "hq"],
  ["/game", "studio"], ["/youtube", "youtube"], ["/beats", "studio"], ["/creative", "studio"],
  ["/reading", "library"], ["/study", "library"], ["/notes", "library"], ["/diary", "library"],
  ["/training", "gym"], ["/workout", "gym"], ["/metrics", "gym"],
  ["/spiritual", "mosque"], ["/duas", "mosque"], ["/level", "hq"], ["/brief", "news"], ["/community", "community"],
  ["/hold", "home"], ["/connections", "runner"], ["/voice", "runner"],
];

export function roomFor(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  return ROOMS.find(([p]) => pathname === p || pathname.startsWith(`${p}/`))?.[1] ?? null;
}
