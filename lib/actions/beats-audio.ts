"use server";

import { db } from "@/lib/db";
import { beatsAudio } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function getBeatAudio(beatId: number) {
  try {
    const rows = await db.select().from(beatsAudio).where(eq(beatsAudio.beatId, beatId)).limit(1);
    return rows[0] ?? null;
  } catch { return null; }
}

export async function getAllBeatAudio() {
  try {
    return db.select().from(beatsAudio);
  } catch { return []; }
}

export async function upsertBeatAudio(data: {
  beatId: number;
  audioUrl: string;
  fileName?: string;
  fileSize?: number;
}) {
  const existing = await getBeatAudio(data.beatId);
  if (existing) {
    await db.update(beatsAudio)
      .set({ audioUrl: data.audioUrl, fileName: data.fileName, fileSize: data.fileSize })
      .where(eq(beatsAudio.beatId, data.beatId));
  } else {
    await db.insert(beatsAudio).values({
      beatId: data.beatId,
      audioUrl: data.audioUrl,
      fileName: data.fileName,
      fileSize: data.fileSize,
    });
  }
}

export async function deleteBeatAudio(beatId: number) {
  await db.delete(beatsAudio).where(eq(beatsAudio.beatId, beatId));
}
