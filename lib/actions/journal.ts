"use server";

// The Journal now lives inside the encrypted Diary (lib/services/diary.ts).
// These keep their old shapes so the Weekly Review, Year in Review and
// streak widgets keep working: "writing" = diary entries, "gratitude" = gratitude.

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth-session";
import { deleteDiaryEntryFor, diaryMetaFor, saveDiaryEntryFor, streakOf } from "@/lib/services/diary";
import { requireDiaryUnlocked } from "@/lib/services/diary-lock";

type JournalType = "gratitude" | "writing";
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function getJournalEntries(type?: string) {
  try {
    // Stats only need dates and counts — the text stays encrypted (diary PIN).
    const all = await diaryMetaFor(await requireUserId());
    const mapped = all.map((e) => ({
      id: e.id, type: (e.kind === "gratitude" ? "gratitude" : "writing") as JournalType, content: "",
      mood: null as number | null, date: localDay(e.date), createdAt: new Date(e.date),
    }));
    return type ? mapped.filter((e) => e.type === type) : mapped;
  } catch {
    return [];
  }
}

export async function addJournalEntry(data: { type: JournalType; content: string; mood?: number }) {
  const userId = await requireUserId();
  await requireDiaryUnlocked(userId);
  await saveDiaryEntryFor(userId, null, { content: data.content, kind: data.type === "gratitude" ? "gratitude" : "diary", title: data.type === "gratitude" ? "Gratitude" : "" });
  revalidatePath("/diary");
  revalidatePath("/");
}

export async function deleteJournalEntry(id: number) {
  const userId = await requireUserId();
  await requireDiaryUnlocked(userId);
  await deleteDiaryEntryFor(userId, id);
  revalidatePath("/diary");
}

export async function getJournalStreak(type: JournalType) {
  const entries = await getJournalEntries(type);
  return streakOf(entries.map((e) => e.date));
}
