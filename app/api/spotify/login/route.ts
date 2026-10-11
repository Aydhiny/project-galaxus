// Starts the Spotify OAuth (PKCE) flow: verifier + state go in a short-lived
// httpOnly cookie, the browser goes to Spotify to approve.

import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-session";
import { SPOTIFY_SCOPES, spotifyClientId } from "@/lib/services/spotify";

export async function GET(req: Request) {
  let userId: number;
  try { userId = await requireUserId(); } catch { return NextResponse.redirect(new URL("/login", req.url)); }
  const clientId = await spotifyClientId(userId);
  if (!clientId) return NextResponse.redirect(new URL("/connections?spotify=missing-client", req.url));

  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  const redirectUri = new URL("/api/spotify/callback", req.url).toString();
  const url = `https://accounts.spotify.com/authorize?${new URLSearchParams({
    response_type: "code", client_id: clientId, scope: SPOTIFY_SCOPES, redirect_uri: redirectUri,
    code_challenge_method: "S256", code_challenge: challenge, state,
  })}`;
  const res = NextResponse.redirect(url);
  res.cookies.set("spotify_pkce", JSON.stringify({ verifier, state }), { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/spotify" });
  return res;
}
