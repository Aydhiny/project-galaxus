"use server";

import { revalidatePath } from "next/cache";
import { toResult } from "@/lib/action-result";
import { requireUserId } from "@/lib/auth-session";
import {
  addFeedbackFor, deleteFeedbackFor, devlogFromCommitsFor, gameStateFor, groupFeedbackFor, saveRepoFor, themeToTaskFor,
} from "@/lib/services/game";

const refresh = () => revalidatePath("/game");

export async function getGameState() {
  return gameStateFor(await requireUserId());
}
export type GameState = Awaited<ReturnType<typeof getGameState>>;

export async function saveGameRepo(repo: string, token?: string) {
  return toResult(async () => { await saveRepoFor(await requireUserId(), repo, token); refresh(); });
}

export async function draftDevlog() {
  return toResult(async () => devlogFromCommitsFor(await requireUserId()));
}

export async function addFeedback(input: { text: string; tester?: string; build?: string; rating?: number | null }) {
  return toResult(async () => { const row = await addFeedbackFor(await requireUserId(), input); refresh(); return row; });
}

export async function deleteFeedback(id: number) {
  return toResult(async () => { await deleteFeedbackFor(await requireUserId(), id); refresh(); });
}

export async function groupFeedback() {
  return toResult(async () => groupFeedbackFor(await requireUserId()));
}

export async function themeToTask(index: number) {
  return toResult(async () => {
    const row = await themeToTaskFor(await requireUserId(), index);
    revalidatePath("/tasks");
    return row;
  });
}
