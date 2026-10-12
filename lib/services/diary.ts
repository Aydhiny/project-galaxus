// Diary storage. Titles and text are encrypted at rest (AES-256-GCM, same box
// as API keys) — the database never holds your words in plain text. Entries
// are only ever decrypted for you; nothing here is sent to Claude or logged.

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { diaryEntries, journalEntries } from "@/lib/db/schema";
import { encrypt, tryDecrypt } from "@/lib/crypto-box";
import { parseImport, type ImportEntry } from "@/lib/diary";

export type DiaryKind = "diary" | "gratitude";
export type DiaryEntry = { id: number; kind: DiaryKind; date: string; title: string; content: string; mood: string | null; tags: string[]; unlockAt: string | null; locked: boolean };

/**
 * One place for everything you write: entries from the old Journal (gratitude /
 * writing) are copied into the encrypted diary once. Idempotent — the external
 * id "journal:<id>" makes a second run a no-op.
 */
export async function migrateJournalFor(userId: number) {
  const old = await db.select().from(journalEntries).where(eq(journalEntries.userId, userId));
  if (old.length === 0) return 0;
  const done = new Set((await db.select({ id: diaryEntries.externalId }).from(diaryEntries)
    .where(and(eq(diaryEntries.userId, userId), eq(diaryEntries.source, "journal")))).map((r) => r.id));
  const fresh = old.filter((j) => !done.has(`journal:${j.id}`));
  if (fresh.length === 0) return 0;
  await db.insert(diaryEntries).values(fresh.map((j) => ({
    userId, externalId: `journal:${j.id}`, source: "journal", kind: j.type === "gratitude" ? "gratitude" : "diary",
    date: j.createdAt ?? new Date(`${j.date}T12:00:00`), titleEnc: encrypt(j.type === "gratitude" ? "Gratitude" : ""), contentEnc: encrypt(j.content),
  }))).onConflictDoNothing();
  return fresh.length;
}

export async function diaryFor(userId: number): Promise<DiaryEntry[]> {
  await migrateJournalFor(userId);
  const rows = await db.select().from(diaryEntries).where(eq(diaryEntries.userId, userId)).orderBy(desc(diaryEntries.date));
  const now = Date.now();
  return rows.map((r) => {
    const locked = !!r.unlockAt && r.unlockAt.getTime() > now; // a letter to your future self stays sealed
    return {
      id: r.id, kind: (r.kind === "gratitude" ? "gratitude" : "diary") as DiaryKind, date: r.date.toISOString(), mood: r.mood, tags: r.tags, unlockAt: r.unlockAt?.toISOString() ?? null, locked,
      title: locked ? "Sealed letter" : tryDecrypt(r.titleEnc) ?? "",
      content: locked ? "" : tryDecrypt(r.contentEnc) ?? "(couldn't decrypt)",
    };
  });
}

export async function saveDiaryEntryFor(userId: number, id: number | null, input: { title?: string; content: string; mood?: string | null; date?: string; unlockAt?: string | null; kind?: DiaryKind }) {
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
  const [row] = await db.insert(diaryEntries).values({ userId, date: input.date ? new Date(input.date) : new Date(), source: "galaxus", kind: input.kind === "gratitude" ? "gratitude" : "diary", ...values }).returning({ id: diaryEntries.id });
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

/** Consecutive days with at least one entry of this kind (today counts; yesterday keeps it alive). */
export function streakOf(dates: string[]): number {
  const days = new Set(dates.map((d) => d.slice(0, 10)));
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const cur = new Date();
  if (!days.has(key(cur))) cur.setDate(cur.getDate() - 1);
  let n = 0;
  while (days.has(key(cur))) { n++; cur.setDate(cur.getDate() - 1); }
  return n;
}

/** Dates, kinds and moods only — for stats (Weekly Review, Year in Review). Never decrypts text. */
export async function diaryMetaFor(userId: number) {
  await migrateJournalFor(userId);
  const rows = await db.select({ id: diaryEntries.id, kind: diaryEntries.kind, date: diaryEntries.date, mood: diaryEntries.mood })
    .from(diaryEntries).where(eq(diaryEntries.userId, userId)).orderBy(desc(diaryEntries.date));
  return rows.map((r) => ({ id: r.id, kind: (r.kind === "gratitude" ? "gratitude" : "diary") as DiaryKind, date: r.date.toISOString(), mood: r.mood }));
}
