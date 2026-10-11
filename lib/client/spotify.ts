// Client entry points for lib/actions/spotify.ts (readable errors, see lib/action-result.ts).
import { create } from "zustand";
import { unwrapped } from "@/lib/action-result";
import { disconnectSpotify, getSpotifyNow, saveSpotifyClientId, spotifyControl } from "@/lib/actions/spotify";
import type { NowPlaying } from "@/lib/services/spotify";

export const getSpotifyNowC = unwrapped(getSpotifyNow);
export const spotifyControlC = unwrapped(spotifyControl);
export const saveSpotifyClientIdC = unwrapped(saveSpotifyClientId);
export const disconnectSpotifyC = unwrapped(disconnectSpotify);
export type { NowPlaying };

/** Shared so the empire can go disco while Spotify plays. */
export const useSpotifyStore = create<{ now: NowPlaying | null; set: (n: NowPlaying | null) => void }>()((set) => ({ now: null, set: (now) => set({ now }) }));
