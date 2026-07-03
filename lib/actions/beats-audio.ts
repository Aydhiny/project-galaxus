"use server";

import { db } from "@/lib/db";
import { beatsAudio, beats } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth-session";

export async function getBeatAudio(beatId: number) {
  try {
    const userId = await requireUserId();
    const rows = await db.select().from(beatsAudio).where(and(eq(beatsAudio.beatId, beatId), eq(beatsAudio.userId, userId))).limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function getAllBeatAudio() {
  try {
    const userId = await requireUserId();
    return db.select().from(beatsAudio).where(eq(beatsAudio.userId, userId));
  } catch {
    return [];
  }
}

export async function upsertBeatAudio(data: {
  beatId: number;
  audioUrl: string;
  fileName?: string;
  fileSize?: number;
}) {
  const userId = await requireUserId();

  const owned = await db.select({ id: beats.id }).from(beats).where(and(eq(beats.id, data.beatId), eq(beats.userId, userId))).limit(1);
  if (!owned[0]) throw new Error("Beat not found.");

  const existing = await getBeatAudio(data.beatId);
  if (existing) {
    await db.update(beatsAudio)
      .set({ audioUrl: data.audioUrl, fileName: data.fileName, fileSize: data.fileSize })
      .where(and(eq(beatsAudio.beatId, data.beatId), eq(beatsAudio.userId, userId)));
  } else {
    await db.insert(beatsAudio).values({
      userId,
      beatId: data.beatId,
      audioUrl: data.audioUrl,
      fileName: data.fileName,
      fileSize: data.fileSize,
    });
  }
}

export async function deleteBeatAudio(beatId: number) {
  const userId = await requireUserId();
  await db.delete(beatsAudio).where(and(eq(beatsAudio.beatId, beatId), eq(beatsAudio.userId, userId)));
}
