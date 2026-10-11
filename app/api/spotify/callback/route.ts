// Spotify sends you back here: check state, swap the code for tokens (PKCE),
// store them encrypted, return to Connections.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-session";
import { saveSpotifyTokens, spotifyClientId } from "@/lib/services/spotify";

export async function GET(req: Request) {
  const back = (q: string) => NextResponse.redirect(new URL(`/connections?spotify=${q}`, req.url));
  let userId: number;
  try { userId = await requireUserId(); } catch { return NextResponse.redirect(new URL("/login", req.url)); }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code) return back("denied");

  const jar = await cookies();
  let saved: { verifier: string; state: string } | null = null;
  try { saved = JSON.parse(jar.get("spotify_pkce")?.value ?? "null"); } catch { saved = null; }
  if (!saved || saved.state !== state) return back("expired");
  const clientId = await spotifyClientId(userId);
  if (!clientId) return back("missing-client");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: new URL("/api/spotify/callback", req.url).toString(),
      client_id: clientId, code_verifier: saved.verifier,
    }),
    cache: "no-store",
  });
  if (!res.ok) return back("failed");
  await saveSpotifyTokens(userId, await res.json());
  const out = back("connected");
  out.cookies.delete({ name: "spotify_pkce", path: "/api/spotify" });
  return out;
}
