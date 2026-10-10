"use server";

import { toResult } from "@/lib/action-result";
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
  return toResult(async () => {
    await saveKeysFor(await requireUserId(), keys);
    refresh();
  });
}

export async function connectChannel(input: string) {
  return toResult(async () => {
    const row = await connectChannelFor(await requireUserId(), input);
    refresh();
    return row;
  });
}

export async function syncChannel(channelRowId: number) {
  return toResult(async () => {
    const r = await syncChannelFor(await requireUserId(), channelRowId);
    refresh();
    return r;
  });
}

export async function removeChannel(channelRowId: number) {
  return toResult(async () => {
    await removeChannelFor(await requireUserId(), channelRowId);
    refresh();
  });
}

export async function runChannelReport(channelRowId: number) {
  return toResult(async () => {
    const report = await channelReportFor(await requireUserId(), channelRowId);
    refresh();
    return report;
  });
}

export async function updateVideo(id: number, patch: VideoPatch) {
  return toResult(async () => {
    const row = await updateVideoFor(await requireUserId(), id, patch);
    refresh();
    return row;
  });
}

export async function improveVideo(id: number) {
  return toResult(async () => {
    const row = await improveVideoFor(await requireUserId(), id);
    refresh();
    return row;
  });
}

export async function createIdea(input: IdeaInput) {
  return toResult(async () => {
    const row = await createIdeaFor(await requireUserId(), input);
    refresh();
    return row;
  });
}

export async function updateIdea(id: number, input: IdeaInput) {
  return toResult(async () => {
    const row = await updateIdeaFor(await requireUserId(), id, input);
    refresh();
    return row;
  });
}

export async function deleteIdea(id: number) {
  return toResult(async () => {
    await deleteIdeaFor(await requireUserId(), id);
    refresh();
  });
}

export async function writeScript(id: number) {
  return toResult(async () => {
    const row = await writeScriptFor(await requireUserId(), id);
    refresh();
    return row;
  });
}
