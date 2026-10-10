"use server";

import { requireUserId } from "@/lib/auth-session";
import { getSecret } from "@/lib/services/secrets";
import { calendarStatusFor } from "@/lib/services/calendar";
import { listApiTokensFor } from "@/lib/services/api-tokens";

/** Which connectors are set up — booleans and labels only, never key material. */
export async function getConnections() {
  const userId = await requireUserId();
  const [calendar, anthropic, google, youtube, github, tokens] = await Promise.all([
    calendarStatusFor(userId),
    getSecret(userId, "anthropic"),
    getSecret(userId, "google"),
    getSecret(userId, "youtube"),
    getSecret(userId, "github"),
    listApiTokensFor(userId),
  ]);
  return {
    calendars: calendar.feeds,
    anthropic: !!anthropic,
    google: !!google,
    youtube: !!youtube || !!google,
    github: !!github,
    mcpTokens: tokens.length,
  };
}
export type Connections = Awaited<ReturnType<typeof getConnections>>;
