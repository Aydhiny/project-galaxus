"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { toResult } from "@/lib/action-result";
import { deleteDiaryEntryFor, diaryFor, importDiaryFor, saveDiaryEntryFor } from "@/lib/services/diary";
import { diaryUnlocked, hasDiaryPin, lockDiary, requireDiaryUnlocked, setDiaryPinFor, unlockDiaryFor } from "@/lib/services/diary-lock";

/** The diary page: entries only when unlocked; otherwise just the lock state. */
export async function getDiary() {
  const userId = await requireUserId();
  const hasPin = await hasDiaryPin(userId);
  const unlocked = hasPin && (await diaryUnlocked(userId));
  return { hasPin, unlocked, entries: unlocked ? await diaryFor(userId) : [] };
}

export async function saveDiaryEntry(id: number | null, input: { title?: string; content: string; mood?: string | null; date?: string; unlockAt?: string | null; kind?: "diary" | "gratitude" }) {
  return toResult(async () => { const userId = await requireUserId(); await requireDiaryUnlocked(userId); const r = await saveDiaryEntryFor(userId, id, input); revalidatePath("/diary"); return r; });
}

export async function deleteDiaryEntry(id: number) {
  return toResult(async () => { const userId = await requireUserId(); await requireDiaryUnlocked(userId); await deleteDiaryEntryFor(userId, id); revalidatePath("/diary"); });
}

/** One chunk of an import file (kept small to stay under the server-action body limit). */
export async function importDiaryChunk(entries: unknown[]) {
  return toResult(async () => { const userId = await requireUserId(); await requireDiaryUnlocked(userId); return importDiaryFor(userId, { entries }); });
}

export async function finishDiaryImport() {
  revalidatePath("/diary");
}

export async function setDiaryPin(pin: string, currentPin?: string) {
  return toResult(async () => { await setDiaryPinFor(await requireUserId(), pin, currentPin); revalidatePath("/diary"); });
}

export async function unlockDiary(pin: string) {
  return toResult(async () => { await unlockDiaryFor(await requireUserId(), pin); revalidatePath("/diary"); });
}

export async function lockDiaryNow() {
  return toResult(async () => { await requireUserId(); await lockDiary(); revalidatePath("/diary"); });
}
