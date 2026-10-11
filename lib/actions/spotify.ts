"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import { setSecret } from "@/lib/services/secrets";
import { controlFor, disconnectSpotifyFor, nowPlayingFor } from "@/lib/services/spotify";

export async function getSpotifyNow() {
  return toResult(async () => nowPlayingFor(await requireUserId()));
}

export async function spotifyControl(action: "play" | "pause" | "next" | "previous") {
  return toResult(async () => controlFor(await requireUserId(), action));
}

export async function saveSpotifyClientId(clientId: string) {
  return toResult(async () => {
    const v = clientId.trim();
    if (!/^[0-9a-f]{32}$/i.test(v)) throw new Error("A Spotify Client ID is 32 letters and numbers — copy it from your app's dashboard.");
    await setSecret(await requireUserId(), "spotify_client", v);
    revalidatePath("/connections");
  });
}

export async function disconnectSpotify() {
  return toResult(async () => { await disconnectSpotifyFor(await requireUserId()); revalidatePath("/connections"); });
}
