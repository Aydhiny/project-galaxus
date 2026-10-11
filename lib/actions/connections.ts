"use server";

import { requireUserId } from "@/lib/auth-session";
import { getSecret } from "@/lib/services/secrets";
import { calendarStatusFor } from "@/lib/services/calendar";
import { listApiTokensFor } from "@/lib/services/api-tokens";
import { claudeHealthy } from "@/lib/services/claude-jobs";

/** Which connectors are set up — booleans and labels only, never key material. */
export async function getConnections() {
  const userId = await requireUserId();
  const [calendar, anthropic, google, youtube, github, tokens, gmail, foursquare, stripe, reddit, runnerOk, spotifyClient, spotify] = await Promise.all([
    calendarStatusFor(userId),
    getSecret(userId, "anthropic"),
    getSecret(userId, "google"),
    getSecret(userId, "youtube"),
    getSecret(userId, "github"),
    listApiTokensFor(userId),
    getSecret(userId, "gmail"),
    getSecret(userId, "foursquare"),
    getSecret(userId, "stripe"),
    getSecret(userId, "reddit"),
    claudeHealthy(userId),
    getSecret(userId, "spotify_client"),
    getSecret(userId, "spotify"),
  ]);
  return {
    calendars: calendar.feeds,
    anthropic: !!anthropic,
    google: !!google,
    youtube: !!youtube || !!google,
    github: !!github,
    mcpTokens: tokens.length,
    gmail: !!gmail,
    foursquare: !!foursquare,
    stripe: !!stripe,
    redditApp: !!reddit,
    claudeRunner: runnerOk,
    spotifyClient: !!spotifyClient,
    spotify: !!spotify,
  };
}
export type Connections = Awaited<ReturnType<typeof getConnections>>;
