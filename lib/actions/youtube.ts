"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import {
  channelReportFor, connectChannelFor, createIdeaFor, deleteIdeaFor, improveVideoFor, removeChannelFor,
  saveKeysFor, studioFor, syncChannelFor, updateIdeaFor, updateVideoFor, writeScriptFor,
  type IdeaInput, type VideoPatch,
} from "@/lib/services/youtube/engine";

const refresh = () => revalidatePath("/youtube");

export async function getStudio() {
  return studioFor(await requireUserId());
}
export type StudioState = Awaited<ReturnType<typeof getStudio>>;

export async function saveYoutubeKeys(keys: { youtube?: string; anthropic?: string }) {
  await saveKeysFor(await requireUserId(), keys);
  refresh();
}

export async function connectChannel(input: string) {
  const row = await connectChannelFor(await requireUserId(), input);
  refresh();
  return row;
}

export async function syncChannel(channelRowId: number) {
  const r = await syncChannelFor(await requireUserId(), channelRowId);
  refresh();
  return r;
}

export async function removeChannel(channelRowId: number) {
  await removeChannelFor(await requireUserId(), channelRowId);
  refresh();
}

export async function runChannelReport(channelRowId: number) {
  const report = await channelReportFor(await requireUserId(), channelRowId);
  refresh();
  return report;
}

export async function updateVideo(id: number, patch: VideoPatch) {
  const row = await updateVideoFor(await requireUserId(), id, patch);
  refresh();
  return row;
}

export async function improveVideo(id: number) {
  const row = await improveVideoFor(await requireUserId(), id);
  refresh();
  return row;
}

export async function createIdea(input: IdeaInput) {
  const row = await createIdeaFor(await requireUserId(), input);
  refresh();
  return row;
}

export async function updateIdea(id: number, input: IdeaInput) {
  const row = await updateIdeaFor(await requireUserId(), id, input);
  refresh();
  return row;
}

export async function deleteIdea(id: number) {
  await deleteIdeaFor(await requireUserId(), id);
  refresh();
}

export async function writeScript(id: number) {
  const row = await writeScriptFor(await requireUserId(), id);
  refresh();
  return row;
}
