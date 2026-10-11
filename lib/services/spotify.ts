// Spotify — your own account, via Spotify's official OAuth (Authorization Code
// + PKCE: no client secret exists anywhere). Tokens are stored encrypted in
// user_secrets; the access token is refreshed automatically.

import { getSecret, setSecret } from "@/lib/services/secrets";

export const SPOTIFY_SCOPES = "user-read-playback-state user-read-currently-playing user-modify-playback-state";
type Tokens = { access: string; refresh: string; expiresAt: number };

export async function spotifyClientId(userId: number) {
  return getSecret(userId, "spotify_client");
}

async function tokens(userId: number): Promise<Tokens | null> {
  const raw = await getSecret(userId, "spotify");
  try { return raw ? (JSON.parse(raw) as Tokens) : null; } catch { return null; }
}

export async function saveSpotifyTokens(userId: number, t: { access_token: string; refresh_token?: string; expires_in: number }, previous?: Tokens | null) {
  const value: Tokens = { access: t.access_token, refresh: t.refresh_token ?? previous?.refresh ?? "", expiresAt: Date.now() + (t.expires_in - 60) * 1000 };
  await setSecret(userId, "spotify", JSON.stringify(value));
}

async function accessToken(userId: number): Promise<string | null> {
  const t = await tokens(userId);
  if (!t) return null;
  if (Date.now() < t.expiresAt) return t.access;
  const clientId = await spotifyClientId(userId);
  if (!clientId || !t.refresh) return null;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: clientId }),
    cache: "no-store",
  });
  if (!res.ok) return null; // revoked — show "Connect" again
  const j = await res.json();
  await saveSpotifyTokens(userId, j, t);
  return j.access_token as string;
}

export type NowPlaying = {
  connected: boolean;
  configured: boolean;
  isPlaying: boolean;
  track: string | null;
  artist: string | null;
  album: string | null;
  image: string | null;
  url: string | null;
  progressMs: number;
  durationMs: number;
};

export async function nowPlayingFor(userId: number): Promise<NowPlaying> {
  const base: NowPlaying = { connected: false, configured: !!(await spotifyClientId(userId)), isPlaying: false, track: null, artist: null, album: null, image: null, url: null, progressMs: 0, durationMs: 0 };
  const token = await accessToken(userId);
  if (!token) return base;
  const res = await fetch("https://api.spotify.com/v1/me/player?additional_types=episode", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 204 || !res.ok) return { ...base, connected: true };
  const j = await res.json();
  const item = j.item ?? {};
  return {
    ...base, connected: true, isPlaying: !!j.is_playing,
    track: item.name ?? null,
    artist: (item.artists ?? []).map((a: { name: string }) => a.name).join(", ") || item.show?.name || null,
    album: item.album?.name ?? null,
    image: item.album?.images?.[1]?.url ?? item.album?.images?.[0]?.url ?? item.images?.[0]?.url ?? null,
    url: item.external_urls?.spotify ?? null,
    progressMs: j.progress_ms ?? 0, durationMs: item.duration_ms ?? 0,
  };
}

/** Play / pause / skip. Spotify only allows remote control on Premium accounts. */
export async function controlFor(userId: number, action: "play" | "pause" | "next" | "previous") {
  const token = await accessToken(userId);
  if (!token) throw new Error("Connect Spotify first (Connections page).");
  const [method, path] = action === "play" ? ["PUT", "play"] : action === "pause" ? ["PUT", "pause"] : ["POST", action];
  const res = await fetch(`https://api.spotify.com/v1/me/player/${path}`, { method, headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 403) throw new Error("Spotify only allows remote control with Premium.");
  if (res.status === 404) throw new Error("Open Spotify on a device first (nothing active to control).");
  if (!res.ok && res.status !== 204) throw new Error(`Spotify said no (${res.status}).`);
}

export async function disconnectSpotifyFor(userId: number) {
  await setSecret(userId, "spotify", null);
}
