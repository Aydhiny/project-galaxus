"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import { deleteDiaryEntryFor, diaryFor, importDiaryFor, saveDiaryEntryFor } from "@/lib/services/diary";

export async function getDiary() {
  return diaryFor(await requireUserId());
}

export async function saveDiaryEntry(id: number | null, input: { title?: string; content: string; mood?: string | null; date?: string; unlockAt?: string | null }) {
  return toResult(async () => { const r = await saveDiaryEntryFor(await requireUserId(), id, input); revalidatePath("/diary"); return r; });
}

export async function deleteDiaryEntry(id: number) {
  return toResult(async () => { await deleteDiaryEntryFor(await requireUserId(), id); revalidatePath("/diary"); });
}

/** One chunk of an import file (kept small to stay under the server-action body limit). */
export async function importDiaryChunk(entries: unknown[]) {
  return toResult(async () => importDiaryFor(await requireUserId(), { entries }));
}

export async function finishDiaryImport() {
  revalidatePath("/diary");
}
