"use server";

import { revalidatePath } from "next/cache";
import { toResult } from "@/lib/action-result";
import { requireUserId } from "@/lib/auth-session";
import {
  addCommunityFor, discoverCommunitiesFor, draftTodayFor, markPostedFor, redditConnectionFor, redditStateFor, redraftFor,
  refreshCommunitiesFor, saveRedditConnectionFor, saveSettingsFor, setCommunityStatusFor, skipPostFor, testRedditFor, updatePostFor,
  type SettingsPatch,
} from "@/lib/services/reddit";

const refresh = () => revalidatePath("/game/reddit");

export async function getRedditState() {
  return redditStateFor(await requireUserId());
}
export type RedditState = Awaited<ReturnType<typeof getRedditState>>;

export async function saveRedditSettings(patch: SettingsPatch) {
  return toResult(async () => { await saveSettingsFor(await requireUserId(), patch); refresh(); });
}

export async function refreshCommunities() {
  return toResult(async () => {
    const r = await refreshCommunitiesFor(await requireUserId(), { max: 10 });
    refresh();
    return r;
  });
}

export async function discoverCommunities() {
  return toResult(async () => {
    const r = await discoverCommunitiesFor(await requireUserId());
    refresh();
    return r;
  });
}

export async function addRedditCommunity(name: string) {
  return toResult(async () => {
    const userId = await requireUserId();
    const row = await addCommunityFor(userId, name);
    await refreshCommunitiesFor(userId, { max: 3 }).catch(() => null); // read its rules right away; the button can retry
    refresh();
    return row;
  });
}

export async function setRedditCommunityStatus(id: number, status: string) {
  return toResult(async () => { await setCommunityStatusFor(await requireUserId(), id, status); refresh(); });
}

export async function draftRedditPost() {
  return toResult(async () => {
    const r = await draftTodayFor(await requireUserId());
    refresh();
    return r;
  });
}

// ─── The Reddit card on the Connections tab ───────────────────────────────────

export async function getRedditConnection() {
  return redditConnectionFor(await requireUserId());
}
export type RedditConnection = Awaited<ReturnType<typeof getRedditConnection>>;

export async function saveRedditConnection(input: { clientId: string; clientSecret: string; username?: string } | null) {
  return toResult(async () => {
    await saveRedditConnectionFor(await requireUserId(), input);
    refresh();
    revalidatePath("/connections");
    revalidatePath("/gigs"); // Gig radar reads the same key
  });
}

export async function testRedditConnection() {
  return toResult(async () => testRedditFor(await requireUserId()));
}

export async function redraftRedditPost(id: number) {
  return toResult(async () => { const r = await redraftFor(await requireUserId(), id); refresh(); return r; });
}

export async function updateRedditPost(id: number, patch: { title?: string; body?: string; firstComment?: string }) {
  return toResult(async () => { await updatePostFor(await requireUserId(), id, patch); refresh(); });
}

export async function markRedditPosted(id: number, url?: string) {
  return toResult(async () => { await markPostedFor(await requireUserId(), id, url); refresh(); });
}

export async function skipRedditPost(id: number) {
  return toResult(async () => { await skipPostFor(await requireUserId(), id); refresh(); });
}
