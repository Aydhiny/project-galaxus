// Diary storage. Titles and text are encrypted at rest (AES-256-GCM, same box
// as API keys) — the database never holds your words in plain text. Entries
// are only ever decrypted for you; nothing here is sent to Claude or logged.

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { diaryEntries } from "@/lib/db/schema";
import { encrypt, tryDecrypt } from "@/lib/crypto-box";
import { parseImport, type ImportEntry } from "@/lib/diary";

export type DiaryEntry = { id: number; date: string; title: string; content: string; mood: string | null; tags: string[]; unlockAt: string | null; locked: boolean };

export async function diaryFor(userId: number): Promise<DiaryEntry[]> {
  const rows = await db.select().from(diaryEntries).where(eq(diaryEntries.userId, userId)).orderBy(desc(diaryEntries.date));
  const now = Date.now();
  return rows.map((r) => {
    const locked = !!r.unlockAt && r.unlockAt.getTime() > now; // a letter to your future self stays sealed
    return {
      id: r.id, date: r.date.toISOString(), mood: r.mood, tags: r.tags, unlockAt: r.unlockAt?.toISOString() ?? null, locked,
      title: locked ? "Sealed letter" : tryDecrypt(r.titleEnc) ?? "",
      content: locked ? "" : tryDecrypt(r.contentEnc) ?? "(couldn't decrypt)",
    };
  });
}

export async function saveDiaryEntryFor(userId: number, id: number | null, input: { title?: string; content: string; mood?: string | null; date?: string; unlockAt?: string | null }) {
  const content = String(input.content ?? "").trim().slice(0, 100_000);
  if (!content) throw new Error("Write something first.");
  const values = {
    titleEnc: encrypt(String(input.title ?? "").trim().slice(0, 200)),
    contentEnc: encrypt(content),
    mood: input.mood ?? null,
    unlockAt: input.unlockAt ? new Date(input.unlockAt) : null,
    updatedAt: new Date(),
  };
  if (id) {
    await db.update(diaryEntries).set(values).where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)));
    return id;
  }
  const [row] = await db.insert(diaryEntries).values({ userId, date: input.date ? new Date(input.date) : new Date(), source: "galaxus", ...values }).returning({ id: diaryEntries.id });
  return row.id;
}

export async function deleteDiaryEntryFor(userId: number, id: number) {
  await db.delete(diaryEntries).where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)));
}

/** Import a batch (the client sends the master file in chunks). Re-importing the same file never duplicates. */
export async function importDiaryFor(userId: number, json: unknown) {
  const entries: ImportEntry[] = parseImport(json).slice(0, 500);
  if (entries.length === 0) return { added: 0, skipped: 0 };
  const ids = entries.map((e) => e.externalId);
  const existing = new Set((await db.select({ id: diaryEntries.externalId }).from(diaryEntries)
    .where(and(eq(diaryEntries.userId, userId), inArray(diaryEntries.externalId, ids)))).map((r) => r.id));
  const fresh = entries.filter((e) => !existing.has(e.externalId));
  if (fresh.length) {
    await db.insert(diaryEntries).values(fresh.map((e) => ({
      userId, externalId: e.externalId, source: "mydiary", date: new Date(e.date), mood: e.mood, tags: e.tags,
      titleEnc: encrypt(e.title), contentEnc: encrypt(e.content),
    }))).onConflictDoNothing();
  }
  return { added: fresh.length, skipped: entries.length - fresh.length };
}
