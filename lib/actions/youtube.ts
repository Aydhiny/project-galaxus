"use server";

import { toResult } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import {
  channelReportFor, connectChannelFor, createIdeaFor, deleteIdeaFor, improveVideoFor, removeChannelFor,
  saveKeysFor, studioFor, syncChannelFor, updateIdeaFor, updateVideoFor, writeScriptFor,
  draftRepliesFor, hookLabFor, updateCommentFor,
  type IdeaInput, type VideoPatch,
} from "@/lib/services/youtube/engine";

import {
  createEditFor, deleteEditFor, editFor, pitchLongformFor, planEditFor, saveGroqKeyFor, toggleCutFor, writeLongScriptFor,
} from "@/lib/services/youtube/longform";
import type { BrainPref } from "@/lib/youtube-longform";
import type { Segment, Span } from "@/lib/youtube-longform";

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

export async function updateComment(id: number, patch: { status?: string; reply?: string }) {
  return toResult(async () => {
    await updateCommentFor(await requireUserId(), id, patch);
    refresh();
  });
}

export async function draftReplies() {
  return toResult(async () => draftRepliesFor(await requireUserId()));
}

export async function runHookLab(ideaId: number) {
  return toResult(async () => hookLabFor(await requireUserId(), ideaId));
}

// ─── Long-form ────────────────────────────────────────────────────────────────

export async function pitchLongform(input: { channelRowId: number | null; steer?: string; count?: number; prefer?: BrainPref }) {
  return toResult(async () => {
    const r = await pitchLongformFor(await requireUserId(), input);
    refresh();
    return r;
  });
}

export async function writeLongScript(ideaId: number, prefer?: BrainPref) {
  return toResult(async () => {
    const row = await writeLongScriptFor(await requireUserId(), ideaId, prefer);
    refresh();
    return { id: row.id, brain: row.brain };
  });
}

export async function createEdit(input: { title: string; fileName: string; durationSec: number; ideaId: number | null; segments: Segment[]; silences: Span[] }) {
  return toResult(async () => {
    const row = await createEditFor(await requireUserId(), input);
    refresh();
    return row;
  });
}

export async function planEdit(id: number, prefer?: BrainPref) {
  return toResult(async () => {
    const r = await planEditFor(await requireUserId(), id, prefer);
    refresh();
    return r;
  });
}

export async function loadEdit(id: number) {
  return toResult(async () => editFor(await requireUserId(), id));
}

export async function toggleCut(id: number, seg: number) {
  return toResult(async () => toggleCutFor(await requireUserId(), id, seg));
}

export async function deleteEdit(id: number) {
  return toResult(async () => {
    await deleteEditFor(await requireUserId(), id);
    refresh();
  });
}

export async function saveGroqKey(key: string) {
  return toResult(async () => {
    await saveGroqKeyFor(await requireUserId(), key);
    refresh();
  });
}
